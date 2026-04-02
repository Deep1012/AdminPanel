import React, { useRef, useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Upload, FileDown, Loader2, CheckCircle2, XCircle, X } from 'lucide-react';
import { importFromExcel, downloadTemplate } from '../lib/importFromExcel';
import { toast } from 'sonner';

/**
 * Reusable Import Excel button with template download and non-blocking progress bar.
 * Progress shows as a sticky bottom banner inside the content area (not over sidebar).
 * Warns user before leaving page during import.
 */
const ImportExcelButton = ({ columns, templateName, onImport }) => {
    const fileRef = useRef(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [result, setResult] = useState(null);

    // Warn user before refresh/navigation during import
    useEffect(() => {
        if (!importing || result) return;
        const handler = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [importing, result]);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const rows = await importFromExcel(file, columns);
            if (rows.length === 0) {
                toast.error('No data found in the file');
                return;
            }
            setImporting(true);
            setTotal(rows.length);
            setProgress(0);
            setResult(null);

            const onProgress = (current) => setProgress(current);
            const importResult = await onImport(rows, onProgress);
            setResult(importResult);
            setProgress(rows.length);

            if (importResult.success > 0) toast.success(`Imported ${importResult.success} record(s)`);
            if (importResult.failed > 0) toast.error(`${importResult.failed} record(s) failed to import`);
        } catch (err) {
            toast.error(err.message || 'Import failed');
            setImporting(false);
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const dismiss = () => {
        setImporting(false);
        setResult(null);
        setProgress(0);
        setTotal(0);
    };

    const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
    const isDone = result !== null;

    return (
        <>
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
                    disabled={importing}
                    className="font-bold uppercase tracking-wider rounded-sm text-xs"
                    data-testid="import-excel-btn"
                >
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> {importing ? 'Importing...' : 'Import'}
                </Button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>

            {/* Non-blocking sticky bottom progress banner — inside content area only */}
            {importing && (
                <div className="fixed bottom-0 right-0 left-0 lg:left-64 z-40 border-t border-border bg-card/95 backdrop-blur-sm shadow-lg" data-testid="import-progress-banner">
                    <Progress value={pct} className="h-1.5 rounded-none" />
                    <div className="flex items-center justify-between px-4 py-2.5">
                        {!isDone ? (
                            <>
                                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    Importing {progress} of {total} records — do not refresh the page
                                </span>
                                <span className="font-mono text-sm font-bold text-primary">{pct}%</span>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-4 text-sm">
                                    {result.success > 0 && (
                                        <span className="flex items-center gap-1.5 text-success">
                                            <CheckCircle2 className="w-4 h-4" />
                                            {result.success} imported
                                        </span>
                                    )}
                                    {result.failed > 0 && (
                                        <span className="flex items-center gap-1.5 text-destructive">
                                            <XCircle className="w-4 h-4" />
                                            {result.failed} failed
                                        </span>
                                    )}
                                </div>
                                <Button variant="ghost" size="sm" onClick={dismiss} className="h-7 px-2 text-xs" data-testid="import-dismiss-btn">
                                    <X className="w-3.5 h-3.5 mr-1" /> Dismiss
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default ImportExcelButton;
