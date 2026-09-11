import { cachedRead, invalidate, invalidateAll, mutating, CACHE_KEYS } from './apiCache';

beforeEach(() => {
    invalidateAll();
});

it('serves a second read from the cache without calling the loader again', async () => {
    const loader = jest.fn().mockResolvedValue({ data: ['SYNCOAT'] });

    const first = await cachedRead(CACHE_KEYS.brands, loader);
    const second = await cachedRead(CACHE_KEYS.brands, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
});

it('collapses concurrent reads of the same key into one request', async () => {
    const loader = jest.fn().mockResolvedValue({ data: [] });

    await Promise.all([
        cachedRead(CACHE_KEYS.sizes, loader),
        cachedRead(CACHE_KEYS.sizes, loader),
        cachedRead(CACHE_KEYS.sizes, loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
});

it('keys are independent', async () => {
    const brands = jest.fn().mockResolvedValue({ data: ['b'] });
    const sizes = jest.fn().mockResolvedValue({ data: ['s'] });

    await cachedRead(CACHE_KEYS.brands, brands);
    await cachedRead(CACHE_KEYS.sizes, sizes);
    invalidate(CACHE_KEYS.brands);
    await cachedRead(CACHE_KEYS.brands, brands);
    await cachedRead(CACHE_KEYS.sizes, sizes);

    expect(brands).toHaveBeenCalledTimes(2);
    expect(sizes).toHaveBeenCalledTimes(1);
});

it('refetches after the TTL expires', async () => {
    const loader = jest.fn().mockResolvedValue({ data: [] });

    await cachedRead(CACHE_KEYS.brands, loader, 0);
    await cachedRead(CACHE_KEYS.brands, loader, 0);

    expect(loader).toHaveBeenCalledTimes(2);
});

it('does not remember a failed read', async () => {
    const loader = jest.fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ data: ['recovered'] });

    await expect(cachedRead(CACHE_KEYS.brands, loader)).rejects.toThrow('network');
    const res = await cachedRead(CACHE_KEYS.brands, loader);

    expect(res.data).toEqual(['recovered']);
    expect(loader).toHaveBeenCalledTimes(2);
});

it('a mutation drops the key so the next read hits the network', async () => {
    const loader = jest.fn()
        .mockResolvedValueOnce({ data: [{ name: 'SYNCOAT' }] })
        .mockResolvedValueOnce({ data: [{ name: 'SYNCOAT-RENAMED' }] });

    await cachedRead(CACHE_KEYS.brands, loader);
    await mutating(() => Promise.resolve({ data: {} }), [CACHE_KEYS.brands]);
    const after = await cachedRead(CACHE_KEYS.brands, loader);

    expect(after.data).toEqual([{ name: 'SYNCOAT-RENAMED' }]);
    expect(loader).toHaveBeenCalledTimes(2);
});

it('a failed mutation still drops the key', async () => {
    const loader = jest.fn().mockResolvedValue({ data: [] });

    await cachedRead(CACHE_KEYS.brands, loader);
    await expect(
        mutating(() => Promise.reject(new Error('timeout')), [CACHE_KEYS.brands])
    ).rejects.toThrow('timeout');
    await cachedRead(CACHE_KEYS.brands, loader);

    expect(loader).toHaveBeenCalledTimes(2);
});

it('invalidateAll clears every key', async () => {
    const brands = jest.fn().mockResolvedValue({ data: [] });
    const sizes = jest.fn().mockResolvedValue({ data: [] });

    await cachedRead(CACHE_KEYS.brands, brands);
    await cachedRead(CACHE_KEYS.sizes, sizes);
    invalidateAll();
    await cachedRead(CACHE_KEYS.brands, brands);
    await cachedRead(CACHE_KEYS.sizes, sizes);

    expect(brands).toHaveBeenCalledTimes(2);
    expect(sizes).toHaveBeenCalledTimes(2);
});
