import React from 'react';
import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react';

/**
 * Top-level error boundary.
 *
 * A render-time throw anywhere in the tree would otherwise unmount the whole
 * app and leave the browser on a blank white screen with no route back. This
 * catches it and offers two ways out: a plain reload (transient failures) and a
 * "clear local data" escape hatch that wipes the auth keys before returning to
 * the login screen (corrupted or stale localStorage).
 *
 * Deliberately built from native elements and inline Tailwind classes rather
 * than the shadcn primitives — the fallback must not depend on any part of the
 * tree that may itself be the thing that broke.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, errorInfo) {
        // no-console allows console.error (eslint.config.js), so no directive needed.
        console.error('Unhandled render error:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleClearAndSignIn = () => {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('sidebar-collapsed');
        } catch {
            // Storage may be unavailable (private mode / blocked) — still navigate.
        }
        window.location.href = '/login';
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center p-4" data-testid="error-boundary">
                <div className="w-full max-w-lg border border-border bg-card rounded-sm">
                    <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                        <h1 className="font-display text-xl font-bold uppercase tracking-tight">
                            Something Went Wrong
                        </h1>
                    </div>

                    <div className="px-5 py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            The application hit an unexpected error and could not finish loading.
                            Reloading usually fixes it. If it keeps happening, clear the locally
                            stored session and sign in again.
                        </p>

                        <div className="space-y-1.5">
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Error Detail
                            </p>
                            <pre className="max-h-32 overflow-auto border border-border bg-background rounded-sm px-3 py-2 font-mono text-xs text-destructive whitespace-pre-wrap break-words" data-testid="error-boundary-message">
                                {error?.message || String(error)}
                            </pre>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 border-t border-border px-5 py-4">
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-sm bg-primary text-primary-foreground font-bold uppercase tracking-wider text-xs hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid="error-boundary-reload-btn"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Reload Page
                        </button>
                        <button
                            type="button"
                            onClick={this.handleClearAndSignIn}
                            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-sm border border-border bg-transparent text-foreground font-bold uppercase tracking-wider text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid="error-boundary-clear-btn"
                        >
                            <LogOut className="w-3.5 h-3.5" /> Clear Local Data &amp; Sign In
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
