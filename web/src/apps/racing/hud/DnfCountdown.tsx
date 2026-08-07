import { useEffect, useRef, useState } from 'react';
import { Hourglass } from 'lucide-react';

import { t } from '@/i18n';

const TICK_MS       = 100;
const URGENT_SEC    = 10;
const WARNING_SEC   = 30;
const URGENT_COLOR  = '#f87171';
const WARNING_COLOR = '#fbbf24';
const CALM_COLOR    = 'rgba(255, 255, 255, 0.95)';

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

export function DnfCountdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
    const total  = Math.max(1, Math.floor(seconds)) * 1000;
    const endsAt = useRef(performance.now() + total);

    const [remaining, setRemaining] = useState(total);

    useEffect(() => {
        const id = window.setInterval(() => {
            const left = endsAt.current - performance.now();
            if (left <= 0) {
                setRemaining(0);
                window.clearInterval(id);
                onDone();
                return;
            }
            setRemaining(left);
        }, TICK_MS);
        return () => window.clearInterval(id);
    }, [onDone]);

    const leftSec  = Math.ceil(remaining / 1000);
    const urgent   = leftSec <= URGENT_SEC;
    const color    = urgent ? URGENT_COLOR : leftSec <= WARNING_SEC ? WARNING_COLOR : CALM_COLOR;
    const progress = total > 0 ? remaining / total : 0;

    return (
        <div
            className={`flex flex-col gap-2 rounded-lg px-4 py-2.5 ${urgent ? 'animate-pulse' : ''}`}
            style={{
                background: 'rgba(10, 12, 16, 0.96)',
                border:     '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow:  '0 6px 20px rgba(0, 0, 0, 0.45)',
            }}
        >
            <div className="flex min-w-0 items-center justify-between gap-3">
                <span
                    className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold tracking-wider"
                    style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                >
                    <Hourglass size={14} className="shrink-0" style={{ color }} />
                    <span className="truncate">{t('racing.hudDnfWarning', 'FINISH OR DNF')}</span>
                </span>
                <span
                    className="shrink-0 rounded px-2 py-[2px] font-mono text-[15px] font-bold tabular-nums"
                    style={{ background: 'rgba(255, 255, 255, 0.06)', color }}
                >
                    {`${pad2(Math.floor(leftSec / 60))}:${pad2(leftSec % 60)}`}
                </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255, 255, 255, 0.08)' }}>
                <div
                    className="h-full rounded-full"
                    style={{ width: `${progress * 100}%`, background: color, transition: 'background 0.3s' }}
                />
            </div>
        </div>
    );
}
