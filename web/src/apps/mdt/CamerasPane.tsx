import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Car, ChevronLeft, Eye, Film, Pause, Play, Share2, Trash2, Video, VideoOff } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { Scroller } from '@/ui/Scroller';
import { SearchBar } from '@/ui/SearchBar';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { initials } from '@/lib/format';
import { formatDuration } from '@/lib/time';

import { uploadSettled } from './bodycamRecorder';
import { thumbFor } from './cctvThumbs';
import { ShareRecordingSheet } from './ShareRecordingSheet';
import { mdtCameras, mdtCameraWatch, mdtRecordingDelete, mdtRecordings } from './mdtApi';
import { useDeckRefresh } from './useMdtSession';
import { mdtPanePad, mdtRowMeta, mdtSectionHeader } from './mdtTheme';
import type { BodycamRecording, CameraTile } from './data';

const REFRESH_MS = 5000;
const IS_PHONE = device.id === 'phone';
const COLUMNS = IS_PHONE ? 2 : 3;

type CamerasTab = 'bodycams' | 'dashcams' | 'recordings';

function matchesCamera(camera: CameraTile, needle: string): boolean {
    return camera.officer.toLowerCase().includes(needle)
        || (camera.callsign ?? '').toLowerCase().includes(needle)
        || (camera.rank ?? '').toLowerCase().includes(needle)
        || (camera.unit ?? '').toLowerCase().includes(needle)
        || (camera.plate ?? '').toLowerCase().includes(needle)
        || (camera.model ?? '').toLowerCase().includes(needle);
}

function kindLabel(kind: string): string {
    return kind === 'dashcam' ? t('mdt.dashcam', 'Dashcam') : t('mdt.bodycam', 'Bodycam');
}

function subtitleFor(camera: CameraTile): string {
    if (camera.kind === 'dashcam') {
        const parts = [camera.model, camera.plate].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : t('mdt.cameraUnknownVehicle', 'Marked unit');
    }
    return camera.rank ?? camera.unit ?? '';
}

function whenLabel(seconds: number): string {
    const date = new Date(seconds * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function CameraCard({ camera, busy, onOpen }: {
    camera: CameraTile;
    busy:   boolean;
    onOpen: () => void;
}) {
    const still = thumbFor(camera.id);
    const ownBodycam = camera.self && camera.kind === 'bodycam';

    return (
        <button
            type="button"
            disabled={busy || ownBodycam}
            onClick={onOpen}
            className="group relative flex flex-col overflow-hidden rounded-[18px] bg-surface text-left shadow-sm ring-1 ring-black/[0.07] transition-all duration-150 hover:-translate-y-[2px] hover:shadow-lg hover:ring-black/[0.14] active:translate-y-0 active:scale-[0.99] disabled:opacity-60 dark:ring-white/[0.09] dark:hover:ring-white/20"
        >
            <span className="relative block w-full overflow-hidden bg-[#05070c]" style={{ aspectRatio: '16 / 9' }}>
                {still ? (
                    <img
                        src={still}
                        alt=""
                        className="h-full w-full object-cover opacity-85 saturate-[0.7] transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                ) : (
                    <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#1a1f2b] to-[#05070c]">
                        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/[0.07] text-[17px] font-bold tracking-wide text-white/45 ring-1 ring-white/10">
                            {initials(camera.officer)}
                        </span>
                    </span>
                )}

                <span
                    className="pointer-events-none absolute inset-0 opacity-[0.06]"
                    style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 4px)' }}
                />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

                <span className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
                    <span className="rounded-[6px] bg-black/65 px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/90">
                        {kindLabel(camera.kind)}
                    </span>
                    {camera.viewers > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-black/65 px-2 py-[3px] text-[11px] font-semibold tabular-nums text-white/90">
                            <Eye className="h-[12px] w-[12px]" strokeWidth={2.4} />
                            {camera.viewers}
                        </span>
                    )}
                </span>

                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
                    <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">
                        <span className={`h-[6px] w-[6px] rounded-full ${
                            ownBodycam ? 'bg-white/40' : busy ? 'bg-ios-yellow' : 'animate-pulse bg-[#ff4b4b]'
                        }`} />
                        {ownBodycam
                            ? t('mdt.cameraOwnBodycam', 'Your own camera')
                            : busy
                                ? t('mdt.cameraOpening', 'Connecting')
                                : t('mdt.cameraLive', 'Live')}
                    </span>
                    {camera.self && !ownBodycam && (
                        <span className="rounded-[5px] bg-white/[0.18] px-1.5 py-[2px] font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/90">
                            {t('mdt.cameraSelf', 'Your unit')}
                        </span>
                    )}
                </span>
            </span>

            <span className="flex min-w-0 flex-col gap-[3px] px-3.5 py-3">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15.5px] font-semibold tracking-[-0.01em] text-black dark:text-white">
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

function Playback({ recording, onClose }: { recording: BodycamRecording; onClose: () => void }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [playing, setPlaying] = useState(true);
    const [at, setAt] = useState(0);
    const [rate, setRate] = useState(1);

    const total = recording.duration || 0;

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.playbackRate = rate;
    }, [rate]);

    const toggle = () => {
        const el = videoRef.current;
        if (!el) return;
        if (el.paused) {
            void el.play();
            setPlaying(true);
        } else {
            el.pause();
            setPlaying(false);
        }
    };

    const seek = (value: number) => {
        const el = videoRef.current;
        if (!el) return;
        el.currentTime = value;
        setAt(value);
    };

    return (
        <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-black animate-fade-in">
            <div className="relative min-h-0 flex-1">
                {recording.url ? (
                    <video
                        ref={videoRef}
                        src={recording.url}
                        autoPlay
                        playsInline
                        className="h-full w-full object-contain"
                        onTimeUpdate={e => setAt(e.currentTarget.currentTime)}
                        onEnded={() => setPlaying(false)}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <EmptyState
                            center
                            icon={VideoOff}
                            title={t('mdt.recMissing', 'Footage unavailable')}
                            subtitle={t('mdt.recMissingSub', 'This recording has no hosted file.')}
                        />
                    </div>
                )}

                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.10]"
                    style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.3) 0px, rgba(255,255,255,0.3) 1px, transparent 1px, transparent 3px)' }}
                />
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(0,0,0,0.55) 100%)' }}
                />

                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full bg-black/70 py-[6px] pl-1.5 pr-3 text-[14px] font-semibold text-white active:opacity-70"
                    >
                        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.6} />
                        {t('mdt.recBack', 'Recordings')}
                    </button>
                    <span className="rounded-[6px] bg-black/70 px-2 py-[3px] text-[11px] font-bold uppercase tracking-wide text-white/85">
                        {kindLabel(recording.kind)}
                    </span>
                </div>

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4">
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[17px] font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                            {recording.officer}
                        </span>
                        <span className="truncate text-[12.5px] font-medium text-white/65">
                            {[recording.callsign, recording.model, recording.plate].filter(Boolean).join(' · ')}
                            {recording.callsign || recording.model || recording.plate ? ' · ' : ''}
                            {whenLabel(recording.createdAt)}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 rounded-[12px] bg-black/70 px-3 py-2">
                        <button
                            type="button"
                            onClick={toggle}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/15 text-white active:opacity-70"
                        >
                            {playing ? <Pause className="h-4 w-4" strokeWidth={2.4} /> : <Play className="h-4 w-4" strokeWidth={2.4} />}
                        </button>
                        <span className="shrink-0 text-[12px] font-medium tabular-nums text-white/80">
                            {formatDuration(Math.floor(at))}
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={Math.max(1, total)}
                            step={1}
                            value={Math.min(at, Math.max(1, total))}
                            onChange={e => seek(Number(e.currentTarget.value))}
                            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-ios-blue"
                        />
                        <span className="shrink-0 text-[12px] font-medium tabular-nums text-white/55">
                            {formatDuration(total)}
                        </span>
                        <button
                            type="button"
                            onClick={() => setRate(r => (r >= 2 ? 0.5 : r === 0.5 ? 1 : 2))}
                            className="shrink-0 rounded-[8px] bg-white/15 px-2 py-1 text-[12px] font-semibold tabular-nums text-white active:opacity-70"
                        >
                            {rate}x
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RecordingRow({ recording, onOpen, onShare, onDelete }: {
    recording: BodycamRecording;
    onOpen:    () => void;
    onShare:   () => void;
    onDelete:  () => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-[16px] bg-surface p-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
            <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3.5 text-left active:opacity-70">
                <span className="relative flex h-[62px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-b from-[#1b1f27] to-[#05070c]">
                    <Play className="h-6 w-6 text-white/75" strokeWidth={2.2} fill="currentColor" />
                    <span className="absolute bottom-1 right-1 rounded-[5px] bg-black/75 px-1.5 py-[1px] text-[11px] font-bold tabular-nums text-white/90">
                        {formatDuration(recording.duration)}
                    </span>
                </span>

                <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[16px] font-semibold text-black dark:text-white">
                            {recording.officer}
                        </span>
                        {recording.callsign && (
                            <span className="shrink-0 rounded-[5px] bg-black/[0.06] px-1.5 py-[1px] text-[11.5px] font-bold tabular-nums text-ios-gray dark:bg-white/[0.10]">
                                {recording.callsign}
                            </span>
                        )}
                    </span>
                    <span className={`truncate ${mdtRowMeta}`}>
                        {kindLabel(recording.kind)}
                        {recording.plate ? ` · ${recording.plate}` : ''}
                        {' · '}
                        {whenLabel(recording.createdAt)}
                    </span>
                    {recording.sharedBy && (
                        <span className="truncate text-[12px] font-semibold text-ios-blue">
                            {t('mdt.recSharedBy', 'Sent by {name}', { name: recording.sharedBy })}
                        </span>
                    )}
                </span>
            </button>

            <div className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    onClick={onShare}
                    aria-label={t('mdt.recShare', 'Send')}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-ios-gray active:opacity-60"
                >
                    <Share2 className="h-[18px] w-[18px]" strokeWidth={2.1} />
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label={t('common.delete', 'Delete')}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-ios-red active:opacity-60"
                >
                    <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.1} />
                </button>
            </div>
        </div>
    );
}

export function CamerasPane() {
    const [storedTab, setTab] = useSessionState<CamerasTab>('mdt:cameras:tab', 'bodycams');
    const [openRec, setOpenRec] = useSessionState<number | null>('mdt:cameras:rec', null);
    const [query, setQuery] = useSessionState('mdt:cameras:recQuery', '');
    const [liveQuery, setLiveQuery] = useSessionState('mdt:cameras:liveQuery', '');
    const [opening, setOpening] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<BodycamRecording | null>(null);
    const [sharing, setSharing] = useState<BodycamRecording | null>(null);

    const { data, settled, refetch } = useAsyncData(() => mdtCameras(), []);
    const { data: recData, refetch: refetchRecs } = useAsyncData(() => mdtRecordings(), []);

    useEffect(() => {
        const timer = window.setInterval(refetch, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [refetch]);

    useDeckRefresh(refetch);

    useNuiEvent('sd-phone:mdt:recSaved', () => {
        uploadSettled(null);
        void refetchRecs();
    });

    useNuiEvent('sd-phone:mdt:recFailed', (payload: { message?: string } | undefined) => {
        uploadSettled(payload?.message ?? 'Could not save the recording');
        setNotice(payload?.message ?? null);
    });

    useNuiEvent('sd-phone:mdt:recShared', () => {
        void refetchRecs();
    });

    const cameras = useMemo(() => data?.cameras ?? [], [data]);
    const allRecordings = useMemo(() => recData?.recordings ?? [], [recData]);
    const recordingsOn = recData?.enabled === true;
    const dashcamsOn = data?.dashcams === true;

    const tabs = useMemo(() => {
        const list: CamerasTab[] = ['bodycams'];
        if (dashcamsOn) list.push('dashcams');
        if (recordingsOn) list.push('recordings');
        return list;
    }, [dashcamsOn, recordingsOn]);

    const tab: CamerasTab = tabs.includes(storedTab) ? storedTab : 'bodycams';

    const liveCameras = useMemo(() => {
        const kind = tab === 'dashcams' ? 'dashcam' : 'bodycam';
        const rows = cameras.filter(c => c.kind === kind);
        const needle = liveQuery.trim().toLowerCase();
        return needle ? rows.filter(c => matchesCamera(c, needle)) : rows;
    }, [cameras, tab, liveQuery]);

    const liveTotal = useMemo(
        () => cameras.filter(c => c.kind === (tab === 'dashcams' ? 'dashcam' : 'bodycam')).length,
        [cameras, tab],
    );

    const recordings = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return allRecordings;
        return allRecordings.filter(r =>
            r.officer.toLowerCase().includes(needle)
            || (r.callsign ?? '').toLowerCase().includes(needle)
            || (r.plate ?? '').toLowerCase().includes(needle)
            || (r.model ?? '').toLowerCase().includes(needle)
            || (r.sharedBy ?? '').toLowerCase().includes(needle)
            || kindLabel(r.kind).toLowerCase().includes(needle)
            || whenLabel(r.createdAt).toLowerCase().includes(needle));
    }, [allRecordings, query]);

    const open = useCallback(async (cameraId: string) => {
        setOpening(cameraId);
        setNotice(null);
        const failed = await mdtCameraWatch(cameraId);
        setOpening(null);
        if (failed) setNotice(failed);
    }, []);

    const remove = useCallback(async (id: number) => {
        setConfirmDelete(null);
        if (await mdtRecordingDelete(id)) {
            if (openRec === id) setOpenRec(null);
            void refetchRecs();
        } else {
            setNotice(t('mdt.recDeleteFailed', 'That recording could not be deleted.'));
        }
    }, [openRec, refetchRecs, setOpenRec]);

    const playing = openRec !== null ? allRecordings.find(r => r.id === openRec) ?? null : null;

    useEffect(() => {
        if (openRec !== null && recData && !playing) setOpenRec(null);
    }, [openRec, recData, playing, setOpenRec]);

    const liveEmpty = tab === 'dashcams' ? (
        <EmptyState
            center
            icon={Car}
            title={t('mdt.noDashcams', 'No marked units out')}
            subtitle={t('mdt.noDashcamsSub', 'A dashcam appears here as soon as an officer gets into a marked vehicle.')}
        />
    ) : (
        <EmptyState
            center
            icon={VideoOff}
            title={t('mdt.noCameras', 'No units on the air')}
            subtitle={t('mdt.noCamerasSub', 'Bodycams appear here while officers are on duty. Opening one puts you behind that unit’s camera.')}
        />
    );

    const recEmpty = (
        <EmptyState
            center
            icon={Film}
            title={t('mdt.noRecordings', 'Nothing recorded yet')}
            subtitle={t('mdt.noRecordingsSub', 'Press R while watching a unit to record what you are seeing. Recordings are kept against your own terminal.')}
        />
    );

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className={`shrink-0 ${mdtPanePad}`}>
                <div className="flex items-center gap-2">
                    <Video className="h-[17px] w-[17px] text-ios-gray" strokeWidth={2.2} />
                    <h2 className={mdtSectionHeader}>{t('mdt.camerasLive', 'Live cameras')}</h2>
                    <span className="flex-1" />
                    {tab !== 'recordings' && (
                        <span className={mdtRowMeta}>
                            {t('mdt.camerasOnAir', '{count} on air', { count: liveTotal })}
                        </span>
                    )}
                </div>

                {tabs.length > 1 && (
                    <div className="mt-2.5 flex gap-1 rounded-[10px] bg-black/[0.05] p-[3px] dark:bg-white/[0.07]">
                        {tabs.map(id => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`flex-1 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                                    tab === id
                                        ? 'bg-surface text-black shadow-sm dark:text-white'
                                        : 'text-ios-gray'
                                }`}
                            >
                                {id === 'bodycams'
                                    ? t('mdt.camerasTabBodycams', 'Bodycams')
                                    : id === 'dashcams'
                                        ? t('mdt.camerasTabDashcams', 'Dashcams')
                                        : t('mdt.camerasTabRecordings', 'Recordings')}
                            </button>
                        ))}
                    </div>
                )}

                <p className={`mt-1.5 ${mdtRowMeta}`}>
                    {tab === 'recordings'
                        ? t('mdt.recordingsHint', 'Footage you recorded while watching a unit.')
                        : tab === 'dashcams'
                            ? t('mdt.dashcamsHint', 'A unit appears here while they are in a marked vehicle.')
                            : t('mdt.camerasHint', 'Opening a unit puts you behind their camera. Backspace leaves it.')}
                </p>

                {notice && (
                    <p className="mt-1.5 text-[12.5px] font-medium text-ios-red">{notice}</p>
                )}
            </div>

            {tab !== 'recordings' ? (
                <div className="flex min-h-0 flex-1 flex-col">
                    {liveTotal > 0 && (
                        <div className="shrink-0 px-6 pb-1">
                            <SearchBar
                                value={liveQuery}
                                onChange={setLiveQuery}
                                placeholder={tab === 'dashcams'
                                    ? t('mdt.dashcamSearch', 'Search by unit, callsign or plate')
                                    : t('mdt.bodycamSearch', 'Search by unit, callsign or rank')}
                            />
                        </div>
                    )}

                    {liveCameras.length === 0 ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">
                            {liveTotal === 0 ? (settled ? liveEmpty : null) : (
                                <EmptyState
                                    center
                                    icon={VideoOff}
                                    title={t('mdt.cameraNoMatch', 'No units match')}
                                    subtitle={t('mdt.cameraNoMatchSub', 'Try a different name, callsign or plate.')}
                                />
                            )}
                        </div>
                    ) : (
                        <Scroller className="min-h-0 flex-1 px-6 pb-6 pt-3">
                            <div
                                className="mdt-stagger grid gap-3"
                                style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
                            >
                                {liveCameras.map(camera => (
                                    <CameraCard
                                        key={camera.id}
                                        camera={camera}
                                        busy={opening === camera.id}
                                        onOpen={() => { void open(camera.id); }}
                                    />
                                ))}
                            </div>
                        </Scroller>
                    )}
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    {allRecordings.length > 0 && (
                        <div className="shrink-0 px-6 pb-1">
                            <SearchBar
                                value={query}
                                onChange={setQuery}
                                placeholder={t('mdt.recSearch', 'Search by unit, callsign or plate')}
                            />
                        </div>
                    )}

                    {recordings.length === 0 ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">
                            {allRecordings.length === 0 ? recEmpty : (
                                <EmptyState
                                    center
                                    icon={Film}
                                    title={t('mdt.recNoMatch', 'No footage matches')}
                                    subtitle={t('mdt.recNoMatchSub', 'Try a different unit, callsign or plate.')}
                                />
                            )}
                        </div>
                    ) : (
                        <Scroller className="min-h-0 flex-1 px-6 pb-6 pt-3">
                            <div className="mdt-stagger flex flex-col gap-2.5">
                                {recordings.map(recording => (
                                    <RecordingRow
                                        key={recording.id}
                                        recording={recording}
                                        onOpen={() => setOpenRec(recording.id)}
                                        onShare={() => setSharing(recording)}
                                        onDelete={() => setConfirmDelete(recording)}
                                    />
                                ))}
                            </div>
                        </Scroller>
                    )}
                </div>
            )}

            {playing && <Playback key={playing.id} recording={playing} onClose={() => setOpenRec(null)} />}

            {confirmDelete && (
                <AlertDialog
                    destructive
                    title={t('mdt.recDeleteTitle', 'Delete this recording?')}
                    message={t('mdt.recDeleteBody', '{kind} of {officer} from {when}. This cannot be undone, and anyone you sent it to keeps their copy.', {
                        kind: kindLabel(confirmDelete.kind),
                        officer: confirmDelete.officer,
                        when: whenLabel(confirmDelete.createdAt),
                    })}
                    confirmLabel={t('common.delete', 'Delete')}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={() => { void remove(confirmDelete.id); }}
                />
            )}

            {sharing && (
                <ShareRecordingSheet
                    recording={sharing}
                    onClose={() => setSharing(null)}
                    onSent={message => setNotice(message)}
                />
            )}
        </div>
    );
}
