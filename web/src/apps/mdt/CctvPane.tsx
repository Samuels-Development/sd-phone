import { useEffect, useMemo, useState } from 'react';
import { Cctv, Radio, X } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { Scroller } from '@/ui/Scroller';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { mdtPanePad, mdtRowMeta, mdtSectionHeader } from './mdtTheme';
import { cctvClose, cctvList, cctvWatch, type CctvCamera } from './mdtApi';
import { onThumbs, thumbFor } from './cctvThumbs';

const ART: Record<string, { from: string; to: string; glow: string }> = {
    Bank:            { from: '#12263f', to: '#0a1622', glow: 'rgba(120,180,255,0.30)' },
    '24/7':          { from: '#2a1f0d', to: '#150f06', glow: 'rgba(255,196,90,0.28)' },
    Ammunation:      { from: '#2a1212', to: '#160909', glow: 'rgba(255,120,110,0.26)' },
    'Liquor Store':  { from: '#241a2e', to: '#120d18', glow: 'rgba(190,140,255,0.26)' },
    YouTool:         { from: '#0f2620', to: '#081410', glow: 'rgba(110,235,190,0.26)' },
};

function Thumb({ camera, live, shot }: { camera: CctvCamera; live: boolean; shot: string | null }) {
    const art = ART[camera.category] ?? { from: '#1b1b1f', to: '#0d0d10', glow: 'rgba(255,255,255,0.2)' };
    return (
        <div
            className="relative aspect-[7/5] w-full overflow-hidden rounded-[10px]"
            style={{ background: `linear-gradient(150deg, ${art.from} 0%, ${art.to} 100%)` }}
        >
            {shot
                ? <img src={shot} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                : (
                    <div
                        className="absolute inset-0"
                        style={{ background: `radial-gradient(120% 90% at 30% 15%, ${art.glow} 0%, transparent 60%)` }}
                    />
                )}
            <div
                className="absolute inset-0 opacity-[0.22]"
                style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 3px)' }}
            />
            <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                <span className={`h-[5px] w-[5px] rounded-full ${live ? 'animate-pulse bg-[#ff5a5a]' : 'bg-white/35'}`} />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/70">
                    {live ? t('mdt.cctvRec', 'REC') : t('mdt.cctvStandby', 'STBY')}
                </span>
            </div>
            <Cctv className="absolute bottom-1.5 right-1.5 h-[13px] w-[13px] text-white/45" strokeWidth={2} />
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/10" />
        </div>
    );
}

function Group({ label, cameras, activeId, onPick }: {
    label: string;
    cameras: CctvCamera[];
    activeId: string | null;
    onPick: (camera: CctvCamera) => void;
}) {
    return (
        <div className="mb-5">
            <div className={`mb-2 ${mdtSectionHeader}`}>{label}</div>
            <div className="grid grid-cols-3 gap-2.5">
                {cameras.map(camera => {
                    const on = camera.id === activeId;
                    return (
                        <button
                            key={camera.id}
                            type="button"
                            onClick={() => onPick(camera)}
                            className="flex flex-col gap-1.5 rounded-[14px] p-2 text-left transition-colors"
                            style={{
                                background: on ? 'rgba(59,130,246,0.16)' : 'rgba(127,127,127,0.08)',
                                boxShadow: on ? 'inset 0 0 0 1.5px rgba(59,130,246,0.55)' : undefined,
                            }}
                        >
                            <Thumb camera={camera} live={on} shot={thumbFor(camera.id)} />
                            <span className="min-w-0 px-0.5">
                                <span className="block truncate text-[12.5px] font-semibold leading-tight">{camera.label}</span>
                                {on && (
                                    <span className="mt-0.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-blue-500">
                                        <Radio className="h-[10px] w-[10px]" strokeWidth={2.8} />
                                        {t('mdt.cctvViewing', 'Viewing')}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function CctvPane() {
    const [activeId, setActiveId] = useSessionState<string | null>('mdt:cctv:active', null);
    const [busy, setBusy] = useState(false);
    const [, bumpThumbs] = useState(0);

    useEffect(() => onThumbs(() => bumpThumbs(n => n + 1)), []);

    const { data, settled } = useAsyncData(() => cctvList(), []);
    const cameras = useMemo(() => data?.cameras ?? [], [data]);
    const enabled = data?.enabled !== false;

    const groups = useMemo(() => {
        const map = new Map<string, CctvCamera[]>();
        for (const camera of cameras) {
            const key = camera.category || t('mdt.cctvOther', 'Other');
            const list = map.get(key);
            if (list) list.push(camera);
            else map.set(key, [camera]);
        }
        return [...map.entries()];
    }, [cameras]);

    const active = activeId ? cameras.find(c => c.id === activeId) ?? null : null;

    async function pick(camera: CctvCamera) {
        if (busy) return;
        setBusy(true);
        const ok = await cctvWatch(camera.id);
        setBusy(false);
        if (ok) setActiveId(camera.id);
    }

    async function leave() {
        if (busy) return;
        setBusy(true);
        await cctvClose();
        setBusy(false);
        setActiveId(null);
    }

    if (settled && (!enabled || cameras.length === 0)) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">
                <EmptyState
                    center
                    icon={Cctv}
                    title={t('mdt.noCctv', 'No cameras on file')}
                    subtitle={t('mdt.noCctvSub', 'Fixed cameras are listed in configs/cctv.lua. Each one puts your own view at that location while you watch it.')}
                />
            </div>
        );
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className={`shrink-0 ${mdtPanePad}`}>
                <div className="flex items-center gap-2">
                    <Cctv className="h-[17px] w-[17px] text-ios-gray" strokeWidth={2.2} />
                    <h2 className={mdtSectionHeader}>{t('mdt.cctvTitle', 'Fixed cameras')}</h2>
                    <span className="flex-1" />
                    <span className={mdtRowMeta}>
                        {t('mdt.cctvCount', '{count} cameras', { count: cameras.length })}
                    </span>
                </div>
                <p className={`mt-1 ${mdtRowMeta}`}>
                    {t('mdt.cctvHint', 'Watching a camera moves your own view to it and puts it back when you leave. Nobody else is affected.')}
                </p>
            </div>

            {active && (
                <div className={`shrink-0 ${mdtPanePad} pt-0`}>
                    <div
                        className="flex items-center gap-3 rounded-[16px] px-3.5 py-3"
                        style={{ background: 'rgba(59,130,246,0.14)', boxShadow: 'inset 0 0 0 1.5px rgba(59,130,246,0.5)' }}
                    >
                        <Radio className="h-[16px] w-[16px] shrink-0 text-blue-500" strokeWidth={2.5} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-bold">{active.label}</div>
                            <div className={mdtRowMeta}>{t('mdt.cctvLive', 'Your view is on this camera')}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void leave(); }}
                            className="flex shrink-0 items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-bold text-white active:opacity-70"
                        >
                            <X className="h-[13px] w-[13px]" strokeWidth={2.8} />
                            {t('mdt.cctvExit', 'Exit')}
                        </button>
                    </div>
                </div>
            )}

            <Scroller className="min-h-0 flex-1 px-6 pb-6 pt-2">
                {groups.map(([label, list]) => (
                    <Group
                        key={label}
                        label={label}
                        cameras={list}
                        activeId={activeId}
                        onPick={camera => { void pick(camera); }}
                    />
                ))}
            </Scroller>
        </div>
    );
}
