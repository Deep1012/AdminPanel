/**
 * `xlsx` and `file-saver` are loaded on demand, not at module scope.
 *
 * WHY: xlsx is by far the largest single dependency in the bundle, and this
 * module is imported statically by twelve pages *and* by `Layout`, which every
 * authenticated route renders. A static `import * as XLSX` therefore pinned the
 * whole spreadsheet engine into the entry chunk, so the Login screen — where
 * nobody can export anything — paid for it. Moving the import inside the
 * function body lets webpack emit it as a separate chunk that is fetched the
 * first time someone actually clicks Export.
 *
 * CONSEQUENCE, DELIBERATE: `exportToExcel` is now async. Every call site
 * awaits it; the boolean it resolves to has the same meaning as before.
 */
import { saveAs } from 'file-saver';

/**
 * Export data to an Excel (.xlsx) file.
 * @param {Object} options
 * @param {Array<Object>} options.data - Array of row objects
 * @param {Array<{header: string, key: string, transform?: Function}>} options.columns - Column definitions
 * @param {string} options.fileName - File name without extension
 * @param {string} [options.sheetName='Sheet1'] - Worksheet name
 * @returns {Promise<boolean>} true if export succeeded, false if no data
 */
export async function exportToExcel({ data, columns, fileName, sheetName = 'Sheet1' }) {
    // Checked before the dynamic import so an empty export costs no download.
    if (!data || data.length === 0) {
        return false;
    }

    const XLSX = await import('xlsx');

    const headers = columns.map(col => col.header);
    const rows = data.map((row, rowIndex) =>
        columns.map(col => {
            const value = row[col.key];
            return col.transform ? col.transform(value, row, rowIndex) : (value ?? '');
        })
    );

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Auto-width columns
    const colWidths = headers.map((header, idx) => {
        const maxDataLen = rows.reduce((max, r) => {
            const cellLen = String(r[idx] ?? '').length;
            return cellLen > max ? cellLen : max;
        }, header.length);
        return { wch: Math.min(maxDataLen + 2, 40) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    saveAs(blob, `${fileName}.xlsx`);
    return true;
}
