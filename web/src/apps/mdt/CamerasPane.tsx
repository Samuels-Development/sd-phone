import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Eye, Video, VideoOff } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { Scroller } from '@/ui/Scroller';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { formatDuration } from '@/lib/time';
import type { LiveHealth } from '@/shared/liveMedia';

import { CameraFeed, feedNotice } from './CameraFeed';
import { mdtCameras } from './mdtApi';
import { useDeckRefresh } from './useMdtSession';
import { mdtPanePad, mdtRowMeta, mdtSectionHeader } from './mdtTheme';
import type { CameraTile } from './data';

const REFRESH_MS = 5000;

function kindLabel(camera: CameraTile): string {
    return camera.kind === 'dashcam'
        ? t('mdt.dashcam', 'Dashcam')
        : t('mdt.bodycam', 'Bodycam');
}

function subtitleFor(camera: CameraTile): string {
    if (camera.kind === 'dashcam') {
        const parts = [camera.model, camera.plate].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : t('mdt.cameraUnknownVehicle', 'Marked unit');
    }
    return camera.rank ?? camera.unit ?? '';
}

function RecordingDot({ label }: { label: string }) {
    return (
        <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-[3px] text-[11px] font-bold uppercase tracking-wide text-white">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-ios-red" />
            {label}
        </span>
    );
}

function CameraCard({ camera, previews, onOpen }: {
    camera:   CameraTile;
    previews: boolean;
    onOpen:   () => void;
}) {
    const [health, setHealth] = useState<LiveHealth>('starting');
    const active = previews && !camera.self && camera.status !== 'unsupported' && camera.status !== 'busy';
    const notice = feedNotice(camera, active, previews);

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group relative flex flex-col overflow-hidden rounded-[14px] bg-black text-left ring-1 ring-black/10 transition-transform duration-150 active:scale-[0.985] dark:ring-white/10"
        >
            <span className="relative block w-full" style={{ aspectRatio: '16 / 9' }}>
                <CameraFeed camera={camera} quality="preview" active={active} notice={notice} onHealth={setHealth} />

                <span className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
                    <span className="rounded-[6px] bg-black/70 px-1.5 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-white/85">
                        {kindLabel(camera)}
                    </span>
                    {camera.viewers > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-[2px] text-[11px] font-semibold tabular-nums text-white/85">
                            <Eye className="h-[12px] w-[12px]" strokeWidth={2.4} />
                            {camera.viewers}
                        </span>
                    )}
                </span>

                {!notice && health === 'live' && (
                    <span className="pointer-events-none absolute bottom-2 left-2">
                        <RecordingDot label={t('mdt.cameraRec', 'Rec')} />
                    </span>
                )}
            </span>

            <span className="flex min-w-0 flex-col gap-0.5 bg-surface px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-black dark:text-white">
                        {camera.officer}
                    </span>
                    {camera.callsign && (
                        <span className="shrink-0 rounded-[5px] bg-black/[0.06] px-1.5 py-[1px] text-[11.5px] font-bold tabular-nums tracking-wide text-ios-gray dark:bg-white/[0.10]">
                            {camera.callsign}
                        </span>
                    )}
                </span>
                <span className={`truncate ${mdtRowMeta}`}>{subtitleFor(camera)}</span>
            </span>
        </button>
    );
}

function CameraStage({ camera, onClose }: { camera: CameraTile; onClose: () => void }) {
    const [elapsed, setElapsed] = useState(0);
    const [health, setHealth] = useState<LiveHealth>('starting');

    useEffect(() => {
        const timer = window.setInterval(() => setElapsed(s => s + 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const active = !camera.self && camera.status !== 'unsupported';
    const notice = feedNotice(camera, active, true);

    return (
        <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-black animate-fade-in">
            <div className="relative min-h-0 flex-1">
                <CameraFeed camera={camera} quality="full" active={active} notice={notice} showTransport onHealth={setHealth} />

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/60" />

                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full bg-black/70 py-[6px] pl-1.5 pr-3 text-[14px] font-semibold text-white active:opacity-70"
                    >
                        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.6} />
                        {t('mdt.cameras', 'Cameras')}
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                        {camera.viewers > 0 && (
                            <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-[4px] text-[13px] font-semibold tabular-nums text-white">
                                <Eye className="h-[14px] w-[14px]" strokeWidth={2.4} />
                                {camera.viewers}
                            </span>
                        )}
                        {!notice && health === 'live' && <RecordingDot label={t('mdt.cameraRec', 'Rec')} />}
                        <span className="rounded-full bg-black/70 px-2.5 py-[4px] text-[13px] font-medium tabular-nums text-white/85">
                            {formatDuration(elapsed)}
                        </span>
                    </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="rounded-[6px] bg-white/25 px-2 py-[2px] text-[11px] font-bold uppercase tracking-wide text-white">
                            {kindLabel(camera)}
                        </span>
                        {camera.callsign && (
                            <span className="rounded-[6px] bg-white/25 px-2 py-[2px] text-[12px] font-bold tabular-nums tracking-wide text-white">
                                {camera.callsign}
                            </span>
                        )}
                        {camera.plate && (
                            <span className="rounded-[6px] bg-white/25 px-2 py-[2px] text-[12px] font-bold uppercase tracking-wide text-white">
                                {camera.plate}
                            </span>
                        )}
                    </div>
                    <div className="truncate text-[20px] font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                        {camera.officer}
                    </div>
                    <div className="truncate text-[13.5px] font-medium text-white/70">
                        {[camera.rank, camera.unit, camera.model].filter(Boolean).join(' · ')}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function CamerasPane() {
    const [openId, setOpenId] = useSessionState<string | null>('mdt:cameras:open', null);

    const { data, settled, refetch } = useAsyncData(() => mdtCameras(), []);

    useEffect(() => {
        const timer = window.setInterval(refetch, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [refetch]);

    useDeckRefresh(refetch);

    const cameras = useMemo(() => data?.cameras ?? [], [data]);
    const previews = data?.previews === true;

    const open = openId ? cameras.find(c => c.id === openId) ?? null : null;

    useEffect(() => {
        if (openId && settled && !open) setOpenId(null);
    }, [openId, settled, open, setOpenId]);

    const empty = (
        <EmptyState
            center
            icon={VideoOff}
            title={t('mdt.noCameras', 'No units on the air')}
            subtitle={t('mdt.noCamerasSub', 'Bodycams and dashcams appear here while officers are on duty. Nothing is recorded until a terminal opens a feed.')}
        />
    );

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className={`shrink-0 ${mdtPanePad}`}>
                <div className="flex items-center gap-2">
                    <Video className="h-[17px] w-[17px] text-ios-gray" strokeWidth={2.2} />
                    <h2 className={mdtSectionHeader}>{t('mdt.camerasLive', 'Live cameras')}</h2>
                    <span className="flex-1" />
                    <span className={mdtRowMeta}>
                        {t('mdt.camerasOnAir', '{count} on air', { count: cameras.length })}
                    </span>
                </div>
                <p className={`mt-1 ${mdtRowMeta}`}>
                    {previews
                        ? t('mdt.camerasHint', 'A unit only publishes video while a terminal is watching it.')
                        : t('mdt.camerasHintNoPreview', 'Live thumbnails are switched off. Open a unit to connect to its camera.')}
                </p>
            </div>

            {settled && cameras.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">{empty}</div>
            ) : (
                <Scroller className="min-h-0 flex-1 px-6 pb-6 pt-4">
                    <div className="mdt-stagger grid grid-cols-3 gap-2.5">
                        {cameras.map(camera => (
                            <CameraCard
                                key={camera.id}
                                camera={camera}
                                previews={previews && !open}
                                onOpen={() => setOpenId(camera.id)}
                            />
                        ))}
                    </div>
                </Scroller>
            )}

            {open && <CameraStage key={open.id} camera={open} onClose={() => setOpenId(null)} />}
        </div>
    );
}
