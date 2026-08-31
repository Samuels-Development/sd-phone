import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { t } from '@/i18n';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[sd-phone] interface crashed:', error, info.componentStack);
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div
                style={{
                    position: 'fixed',
                    left: '50%',
                    bottom: 24,
                    transform: 'translateX(-50%)',
                    zIndex: 2147483647,
                    pointerEvents: 'none',
                    maxWidth: 420,
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'rgba(20,20,22,0.92)',
                    color: '#fff',
                    font: '500 13px/1.45 -apple-system, "Segoe UI", system-ui, sans-serif',
                    textAlign: 'center',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                }}
            >
                {t('shell.crashMessage', 'The phone hit an error and had to stop. Ask an admin to restart sd-phone, and check the F8 console for the details to report.')}
            </div>
        );
    }
}
