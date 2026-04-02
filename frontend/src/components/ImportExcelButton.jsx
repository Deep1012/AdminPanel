import React, { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Upload, FileDown, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { importFromExcel, downloadTemplate } from '../lib/importFromExcel';
import { toast } from 'sonner';

/**
 * Reusable Import Excel button with template download and progress bar.
 * @param {Object} props
 * @param {Array<{header: string, key: string}>} props.columns - Import column definitions
 * @param {string} props.templateName - Name for the template file
 * @param {Function} props.onImport - Async callback receiving (rows, onProgress). onProgress(current, total) updates the bar.
 */
const ImportExcelButton = ({ columns, templateName, onImport }) => {
    const fileRef = useRef(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [result, setResult] = useState(null); // { success, failed } or null

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

            const onProgress = (current) => {
                setProgress(current);
            };

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

    const closeDialog = () => {
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

            <Dialog open={importing} onOpenChange={(open) => { if (!open && isDone) closeDialog(); }}>
                <DialogContent className="bg-card border-border rounded-sm max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-lg font-bold tracking-tight uppercase">
                            {isDone ? 'Import Complete' : 'Importing Data...'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <Progress value={pct} className="h-3" />
                        <div className="flex items-center justify-between text-sm">
                            {!isDone ? (
                                <>
                                    <span className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                        Processing row {progress} of {total}
                                    </span>
                                    <span className="font-mono font-bold text-primary">{pct}%</span>
                                </>
                            ) : (
                                <div className="flex flex-col gap-2 w-full">
                                    {result.success > 0 && (
                                        <span className="flex items-center gap-2 text-success">
                                            <CheckCircle2 className="w-4 h-4" />
                                            {result.success} record(s) imported successfully
                                        </span>
                                    )}
                                    {result.failed > 0 && (
                                        <span className="flex items-center gap-2 text-destructive">
                                            <XCircle className="w-4 h-4" />
                                            {result.failed} record(s) failed
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        {isDone && (
                            <Button onClick={closeDialog} className="w-full font-bold uppercase tracking-wider rounded-sm" data-testid="import-done-btn">
                                Done
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default ImportExcelButton;
