import { useCallback, useEffect, useState } from 'react';
import { Footprints, Heart, MoonStar, Route } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionStore } from '@/stores/sessionStore';
import { t } from '@/i18n';

const SB_H = 54;

const M_PER_MILE = 1609.34;

interface HealthProps {
    onClose: () => void;
}

const live = {
    steps:        null as number | null,
    distanceM:    null as number | null,
    heartRate:    null as number | null,
};
window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data as { action?: string; data?: Record<string, unknown> } | undefined;
    if (!msg?.data) return;
    if (msg.action === 'sd-phone:health') {
        if (typeof msg.data.steps     === 'number') live.steps     = msg.data.steps;
        if (typeof msg.data.distanceM === 'number') live.distanceM = msg.data.distanceM;
        if (typeof msg.data.heartRate === 'number') live.heartRate = msg.data.heartRate;
    }
});

export function Health({ onClose }: HealthProps) {
    const storeStart = useSessionStore((s) => s.startMs);
    const [fallbackStart]                 = useState<number>(() => Date.now());
    const [now,          setNow]          = useState<number>(() => Date.now());
    const [steps,        setSteps]        = useState<number>(() => live.steps ?? 0);
    const [distanceM,    setDistanceM]    = useState<number>(() => live.distanceM ?? 0);
    const [hr,           setHr]           = useState<number>(() => live.heartRate ?? 70);

    useNuiEvent('sd-phone:health', useCallback((data) => {
        if (!data) return;
        if (typeof data.steps     === 'number') setSteps(data.steps);
        if (typeof data.distanceM === 'number') setDistanceM(data.distanceM);
        if (typeof data.heartRate === 'number') setHr(data.heartRate);
    }, []));

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const awakeMs  = Math.max(0, now - (storeStart ?? fallbackStart));
    const distance = distanceM / M_PER_MILE;

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white">
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="shrink-0 px-5 pb-2 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight">{t('health.title', 'Health')}</h1>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-6 pt-1">
                <Card
                    accent="#7C3AED"
                    icon={<MoonStar className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.timeAwake', 'Time Awake')}
                >
                    <BigValue value={formatAwake(awakeMs)} unit="" />
                </Card>

                <Card
                    accent="#FB8C00"
                    icon={<Footprints className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.steps', 'Steps')}
                >
                    <BigValue value={steps.toLocaleString()} unit={t('health.stepsUnit', 'steps')} />
                </Card>

                <Card
                    accent="#1E90FF"
                    icon={<Route className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.walkingRunningDistance', 'Walking + Running Distance')}
                >
                    <BigValue value={distance.toFixed(2)} unit={t('health.miUnit', 'mi')} />
                </Card>

                <Card
                    accent="#FF2D55"
                    icon={<Heart className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.heartRate', 'Heart Rate')}
                >
                    <div className="flex items-end gap-2">
                        <BigValue value={hr > 0 ? String(hr) : '—'} unit={hr > 0 ? t('health.bpmUnit', 'BPM') : ''} />
                        {hr > 0 && <HeartPulse hr={hr} />}
                    </div>
                </Card>
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label={t('health.closeHealth', 'Close Health')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}


function Card({ accent, icon, title, children }: {
    accent: string;
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="mb-2.5 rounded-[15px] bg-[#e5e5e5] p-3.5 dark:bg-surface">
            <div className="flex items-center gap-1.5 text-[16px] font-semibold" style={{ color: accent }}>
                <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
                <span>{title}</span>
            </div>
            <div className="mt-2">{children}</div>
        </div>
    );
}

function BigValue({ value, unit }: { value: string; unit: string }) {
    return (
        <div className="flex items-baseline gap-1">
            <span className="text-[34px] font-semibold leading-none tabular-nums">{value}</span>
            {unit && (
                <span className="text-[15px] font-medium text-black/65 dark:text-white/65">
                    {unit}
                </span>
            )}
        </div>
    );
}

function HeartPulse({ hr }: { hr: number }) {
    const duration = `${(60 / Math.max(30, hr)).toFixed(2)}s`;
    return (
        <span className="ml-1 inline-block" style={{ animation: `sdph-pulse ${duration} ease-in-out infinite` }}>
            <Heart className="h-5 w-5 text-rose-500" fill="currentColor" strokeWidth={0} />
            <style>{`@keyframes sdph-pulse {
                0%, 100% { transform: scale(1); }
                25%      { transform: scale(1.18); }
                40%      { transform: scale(0.96); }
                60%      { transform: scale(1.10); }
            }`}</style>
        </span>
    );
}


function formatAwake(ms: number): string {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return t('health.awakeHm', '{h}h {m}m', { h, m });
    const s = total % 60;
    return t('health.awakeMs', '{m}m {s}s', { m, s: s.toString().padStart(2, '0') });
}
