// Loaded automatically by CRA's jest config before every test file.
import { TextEncoder, TextDecoder } from 'util';
import '@testing-library/jest-dom';

// The jsdom bundled with react-scripts 5 (jest 27) predates TextEncoder, which
// react-router v7 uses at import time.
if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder;
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder;

// jsdom implements neither ResizeObserver nor the pointer-capture / scroll APIs
// that Radix primitives (Dialog, Select, Switch) call while measuring and
// focus-trapping. Without these the component tree throws before a single
// assertion runs, so stub them once here rather than in every test file.
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

if (typeof globalThis.DOMRect === 'undefined') {
    globalThis.DOMRect = class DOMRect {
        constructor(x = 0, y = 0, width = 0, height = 0) {
            Object.assign(this, {
                x, y, width, height,
                top: y, left: x, right: x + width, bottom: y + height,
            });
        }
    };
}

if (typeof Element !== 'undefined') {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
}

if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}

// These page tests drive real Radix dialogs and full data tables through
// userEvent, which is well past jest's 5s default on a cold cache.
jest.setTimeout(30000);
