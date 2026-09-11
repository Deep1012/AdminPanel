/**
 * Manual jest mock for `src/lib/api.js`.
 *
 * Form tests assert on the exact payload each page hands to the API, so every
 * exported client is a bare `jest.fn()` here. Each test file sets the resolved
 * values its page needs in `beforeEach`.
 */
const client = (...methods) =>
    methods.reduce((acc, name) => {
        acc[name] = jest.fn();
        return acc;
    }, {});

export const authAPI = client('login', 'register', 'getMe');
export const usersAPI = client('getAll', 'update', 'delete');
export const brandsAPI = client('getAll', 'create', 'update', 'delete');
export const sizesAPI = client('getAll', 'create', 'update', 'delete');
export const purchaseAPI = client('getAll', 'getAvailable', 'create', 'update', 'delete');
export const printingAPI = client('getAll', 'create', 'update', 'delete');
export const productionAPI = client('getAll', 'create', 'update', 'delete');
export const dispatchAPI = client('getAll', 'create', 'update', 'delete');
export const purchaseOrdersAPI = client('getAll', 'create', 'update', 'delete', 'toggleComplete');
export const customersAPI = client('getAll', 'create', 'update', 'delete');
export const adminAPI = client('clearOperationalData', 'getActivityLogs', 'getActivityLogStats');
export const menuItemsAPI = client('getAll', 'create', 'update', 'delete', 'reorder', 'seedDefaults');
export const dashboardAPI = client(
    'getStats',
    'getPurchaseStock',
    'getPrintingStockList',
    'getFinishedGoodsList',
    'getProductionTrend',
    'getRecentActivity',
    'getPOSummary',
    'getExportAll'
);
export const backupsAPI = client('getAll', 'create', 'get', 'delete');

export default client('get', 'post', 'put', 'delete');
