import * as XLSX from 'xlsx';

/**
 * Parse an Excel file and return rows as objects keyed by column headers.
 * @param {File} file - The uploaded Excel file
 * @param {Array<{header: string, key: string}>} columns - Expected column definitions
 * @returns {Promise<Array<Object>>} Parsed row objects
 */
export async function importFromExcel(file, columns) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                // Map Excel headers to internal keys
                const headerToKey = {};
                for (const col of columns) {
                    headerToKey[col.header.toLowerCase().trim()] = col.key;
                }

                const rows = jsonData.map(row => {
                    const mapped = {};
                    for (const [excelHeader, value] of Object.entries(row)) {
                        const key = headerToKey[excelHeader.toLowerCase().trim()];
                        if (key) mapped[key] = value;
                    }
                    return mapped;
                });

                resolve(rows);
            } catch (err) {
                reject(new Error('Failed to parse Excel file'));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Download a template Excel with only headers.
 * @param {Array<{header: string}>} columns - Column definitions
 * @param {string} fileName - File name without extension
 */
export function downloadTemplate(columns, fileName) {
    const headers = columns.map(col => col.header);
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 15) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_Template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}
