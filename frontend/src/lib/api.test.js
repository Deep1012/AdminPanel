/**
 * Request shape of `adminAPI.reconcile`, against the real api.js with axios
 * replaced. The point is that it is NOT routed through the TTL cache: the
 * reconcile report is only useful if it reflects the data right now.
 *
 * babel-jest hoists the `jest.mock` call above these imports.
 */
import { instance as http } from 'axios';
import { adminAPI } from './api';

jest.mock('axios', () => {
    const instance = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    };
    return { __esModule: true, default: { create: jest.fn(() => instance) }, instance };
});

beforeEach(() => {
    jest.clearAllMocks();
    http.get.mockResolvedValue({ data: { clean: true } });
});

it('hits GET /admin/reconcile on every call instead of serving a cached report', async () => {
    await adminAPI.reconcile();
    await adminAPI.reconcile();

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get).toHaveBeenNthCalledWith(1, '/admin/reconcile', undefined);
});

it('passes sampleLimit as the sample_limit query parameter', async () => {
    await adminAPI.reconcile(10);

    expect(http.get).toHaveBeenCalledWith('/admin/reconcile', { params: { sample_limit: 10 } });
});
