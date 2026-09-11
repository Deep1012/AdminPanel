import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, ScanSearch, AlertCircle, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import { formatDateTime, formatNumber } from '../../lib/utils';
import {
    groupChecks, totalCount, sampleColumns, formatSampleValue, SCANNED_LABELS,
} from '../../lib/reconcileChecks';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';

const SummaryStat = ({ label, value, tone = '', testId, children }) => (
    <div className="p-4 rounded-sm border border-border bg-secondary/30">
        <p className={LABEL_CLASS}>{label}</p>
        <p className={`font-display text-2xl font-bold ${tone}`} data-testid={testId}>{value}</p>
        {children}
    </div>
);

const SampleTable = ({ check, sampleLimit }) => {
    const columns = sampleColumns(check.samples);
    return (
        <div id={`reconcile-samples-${check.key}`} className="border-t border-border">
            <div className="overflow-x-auto">
                <table className="data-table" data-testid={`reconcile-samples-${check.key}`}>
                    <thead><tr>{columns.map((col) => <th key={col}>{col.replace(/_/g, ' ')}</th>)}</tr></thead>
                    <tbody>
                        {check.samples.map((row, idx) => (
                            // Samples are a static snapshot with no id field common
                            // to every check, so the index is the key.
                            <tr key={idx}>{columns.map((col) => <td key={col}>{formatSampleValue(row[col])}</td>)}</tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {check.count > check.samples.length && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                    Showing the first {formatNumber(check.samples.length)} of {formatNumber(check.count)}
                    {Number.isFinite(sampleLimit) ? ` (sample limit ${sampleLimit})` : ''}.
                </p>
            )}
        </div>
    );
};

const CheckRow = ({ check, open, onToggle, sampleLimit }) => {
    const failTone = check.expected ? 'text-warning' : 'text-destructive';
    return (
        <div className="border border-border rounded-sm" data-testid={`reconcile-check-${check.key}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold uppercase tracking-wider">{check.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{check.description}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`font-mono text-lg font-bold ${check.count > 0 ? failTone : 'text-success'}`} data-testid={`reconcile-count-${check.key}`}>
                        {formatNumber(check.count)}
                    </span>
                    {check.count > 0 && check.samples.length > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onToggle}
                            aria-expanded={open}
                            aria-controls={`reconcile-samples-${check.key}`}
                            className="rounded-sm text-xs font-bold uppercase tracking-wider"
                            data-testid={`reconcile-toggle-${check.key}`}
                        >
                            {open ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                            {open ? 'Hide' : 'Show'} samples<span className="sr-only"> for {check.label}</span>
                        </Button>
                    )}
                </div>
            </div>
            {open && <SampleTable check={check} sampleLimit={sampleLimit} />}
        </div>
    );
};

const statusCopy = (clean, integrityIssues) => {
    if (clean) return 'Every check returned zero.';
    if (integrityIssues === 0) return 'No integrity problems. Only the known data-entry gaps below remain.';
    return `${formatNumber(integrityIssues)} integrity problem${integrityIssues === 1 ? '' : 's'} to investigate, listed below.`;
};

/**
 * On-demand view of GET /api/admin/reconcile. Never runs on mount: the check
 * reads five collections in full.
 */
const ReconcilePanel = () => {
    const [report, setReport] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState({});

    const runCheck = async () => {
        setRunning(true);
        setError(null);
        try {
            const res = await adminAPI.reconcile();
            if (!res || !res.data || typeof res.data.checks !== 'object' || res.data.checks === null) {
                throw new Error('Malformed reconcile response');
            }
            setReport(res.data);
            setExpanded({});
        } catch (err) {
            const message = getErrorMessage(err, 'Failed to run the data check');
            setReport(null);
            setError(message);
            toast.error(message);
        } finally {
            setRunning(false);
        }
    };

    const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

    const { integrity, gaps } = report ? groupChecks(report.checks) : { integrity: [], gaps: [] };
    const integrityIssues = totalCount(integrity);
    const gapIssues = totalCount(gaps);
    const scanned = report && report.scanned ? report.scanned : {};
    const totalScanned = Object.values(scanned).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

    const renderRows = (list) => list.map((check) => (
        <CheckRow key={check.key} check={check} open={!!expanded[check.key]} onToggle={() => toggle(check.key)} sampleLimit={report.sample_limit} />
    ));

    return (
        <Card className="industrial-card" data-testid="reconcile-panel">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
                <div>
                    <CardTitle className="font-display text-xl font-bold tracking-tight uppercase">Data Integrity Check</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Recomputes every stock counter from the entries that produce it and lists where stored data disagrees. Read-only: it changes nothing.
                    </p>
                </div>
                <Button onClick={runCheck} disabled={running} className="font-bold uppercase tracking-wider rounded-sm shrink-0" data-testid="run-reconcile-btn">
                    {running
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking...</>
                        : <><ScanSearch className="w-4 h-4 mr-2" /> Run Data Check</>}
                </Button>
            </CardHeader>
            <CardContent className="space-y-6">
                {error && (
                    <div role="alert" className="flex items-start gap-2 p-3 rounded-sm border border-destructive/30 bg-destructive/10 text-sm text-destructive" data-testid="reconcile-error">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
                    </div>
                )}

                {!report && !error && (
                    <p className="text-sm text-muted-foreground" data-testid="reconcile-idle">
                        {running
                            ? 'Scanning purchases, printing jobs, production, dispatches and purchase orders...'
                            : 'Scans purchases, printing jobs, production, dispatches and purchase orders in full, so it only runs when you ask. Safe to run on live data at any time.'}
                    </p>
                )}

                {report && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="reconcile-summary">
                            <SummaryStat label="Documents Scanned" value={formatNumber(totalScanned)} testId="reconcile-scanned">
                                <p className="text-xs text-muted-foreground font-mono mt-1">
                                    {Object.entries(scanned).map(([key, n]) => `${SCANNED_LABELS[key] || key} ${formatNumber(n)}`).join(' · ')}
                                </p>
                            </SummaryStat>
                            <SummaryStat label="Total Issues" value={formatNumber(report.total_issues)} testId="reconcile-total-issues" />
                            <SummaryStat label="Integrity Problems" value={formatNumber(integrityIssues)} tone={integrityIssues > 0 ? 'text-destructive' : 'text-success'} testId="reconcile-integrity-issues" />
                            <SummaryStat label="Data-Entry Gaps" value={formatNumber(gapIssues)} tone={gapIssues > 0 ? 'text-warning' : 'text-success'} testId="reconcile-gap-issues" />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            {report.clean
                                ? <Badge variant="outline" className="uppercase border-success/40 text-success bg-success/10" data-testid="reconcile-status">Clean</Badge>
                                : <Badge variant="outline" className={`uppercase ${integrityIssues > 0 ? 'border-destructive/40 text-destructive bg-destructive/10' : 'border-warning/40 text-warning bg-warning/10'}`} data-testid="reconcile-status">Not Clean</Badge>}
                            <span className="text-sm">{statusCopy(report.clean, integrityIssues)}</span>
                            <span className="text-xs text-muted-foreground font-mono ml-auto">Run {formatDateTime(report.generated_at)} UTC</span>
                        </div>

                        <section className="space-y-3" aria-labelledby="reconcile-integrity-heading">
                            <div>
                                <h3 id="reconcile-integrity-heading" className="font-display text-lg font-bold tracking-tight uppercase">Integrity Checks</h3>
                                <p className="text-xs text-muted-foreground">
                                    Each of these should be zero. A non-zero count is a genuine inconsistency in stored data: drift between a stored counter and the entries behind it, references to deleted records, or duplicate numbers.
                                </p>
                            </div>
                            {renderRows(integrity)}
                        </section>

                        {gaps.length > 0 && (
                            <section className="space-y-3" aria-labelledby="reconcile-gaps-heading">
                                <h3 id="reconcile-gaps-heading" className="font-display text-lg font-bold tracking-tight uppercase">Data-Entry Gaps (Expected)</h3>
                                <div className="flex items-start gap-3 p-3 rounded-sm border border-warning/30 bg-warning/10 text-sm" data-testid="reconcile-gaps-note">
                                    <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
                                    <div className="space-y-2">
                                        <p>
                                            <span className="font-bold">These two are expected to be non-zero right now.</span>{' '}
                                            They are data-entry gaps to close, not errors or corrupted data.
                                        </p>
                                        <p>
                                            Measured against production on 11 Sep 2026: 144 printing-stock buckets were below zero (102 of them primary brands with no printing jobs recorded at all) and 59 finished-goods buckets were below zero (stock dispatched that predates the system). Falling counts mean the gaps are being closed.
                                        </p>
                                        <p>
                                            Because of this, the production and dispatch stock guards run in warn-only mode: an entry that overdraws these figures is logged and allowed through instead of being refused. Once both counts reach zero, the guards can be switched to enforcing.
                                        </p>
                                    </div>
                                </div>
                                {renderRows(gaps)}
                            </section>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default ReconcilePanel;
