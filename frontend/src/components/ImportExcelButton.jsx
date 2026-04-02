import React, { useRef } from 'react';
import { Button } from './ui/button';
import { Upload, FileDown } from 'lucide-react';
import { importFromExcel, downloadTemplate } from '../lib/importFromExcel';
import { toast } from 'sonner';

/**
 * Reusable Import Excel button with template download.
 * @param {Object} props
 * @param {Array<{header: string, key: string}>} props.columns - Import column definitions
 * @param {string} props.templateName - Name for the template file
 * @param {Function} props.onImport - Async callback receiving parsed rows; should return { success: number, failed: number }
 */
const ImportExcelButton = ({ columns, templateName, onImport }) => {
    const fileRef = useRef(null);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const rows = await importFromExcel(file, columns);
            if (rows.length === 0) {
                toast.error('No data found in the file');
                return;
            }
            const result = await onImport(rows);
            if (result.success > 0) toast.success(`Imported ${result.success} record(s)`);
            if (result.failed > 0) toast.error(`${result.failed} record(s) failed to import`);
        } catch (err) {
            toast.error(err.message || 'Import failed');
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div className="flex gap-1">
            <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate(columns, templateName)}
                className="font-bold uppercase tracking-wider rounded-sm text-xs"
                data-testid="download-template-btn"
            >
                <FileDown className="w-3.5 h-3.5 mr-1.5" /> Template
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="font-bold uppercase tracking-wider rounded-sm text-xs"
                data-testid="import-excel-btn"
            >
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Import
            </Button>
            <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
};

export default ImportExcelButton;
