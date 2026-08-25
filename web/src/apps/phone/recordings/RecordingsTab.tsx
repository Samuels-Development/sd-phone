import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Pause, Pencil, Play, PhoneIncoming, PhoneOutgoing, Trash2, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';

import { AlertDialog } from '@/ui/AlertDialog';
import { PromptDialog } from '@/ui/PromptDialog';
import { EmptyState } from '@/ui/EmptyState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { formatPhone } from '@/lib/phone';
import { trackFraction } from '@/lib/zoom';
import { t } from '@/i18n';
import { deleteRecording, fetchRecordings, renameRecording, type CallRecording } from '../callrecApi';

const EXPAND_MS = 260;

function clock(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function when(iso: string) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const sameDay = at.toDateString() === new Date().toDateString();
    return sameDay
        ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : at.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function titleOf(rec: CallRecording) {
    return rec.label?.trim() || rec.peerName?.trim() || formatPhone(rec.peerNumber);
}

export function RecordingsTab() {
    const [items, setItems] = useState<CallRecording[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<CallRecording | null>(null);
    const [renaming, setRenaming] = useState<CallRecording | null>(null);

    const load = useCallback(() => { void fetchRecordings().then(setItems); }, []);
    useEffect(() => { load(); }, [load]);

    useNuiEvent('sd-phone:callrec:added', useCallback((rec: CallRecording) => {
        setItems(prev => [rec, ...prev.filter(r => r.id !== rec.id)]);
    }, []));

    const confirmDelete = async () => {
        const rec = pendingDelete;
        setPendingDelete(null);
        if (!rec) return;
        if (!await deleteRecording(rec.id)) return;
        setItems(prev => prev.filter(r => r.id !== rec.id));
        setOpenId(prev => (prev === rec.id ? null : prev));
    };

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">
                    {t('phone.recordings', 'Recordings')}
                </h1>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-6 pt-2">
                    {items.length === 0 ? (
                        <EmptyState
                            icon={<AudioLines className="h-12 w-12" strokeWidth={1.5} />}
                            title={t('phone.noRecordings', 'No recordings')}
                            subtitle={t('phone.noRecordingsBody', 'Recordings you make during a call are kept here.')}
                        />
                    ) : (
                        <div className="overflow-hidden rounded-[10px] bg-surface">
                            {items.map((rec, i) => (
                                <div key={rec.id}>
                                    {i > 0 && (
                                        <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
                                    )}
                                    <Row
                                        rec={rec}
                                        open={openId === rec.id}
                                        onToggle={() => setOpenId(prev => (prev === rec.id ? null : rec.id))}
                                        onRequestRename={() => setRenaming(rec)}
                                        onRequestDelete={() => setPendingDelete(rec)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {renaming && (
                <PromptDialog
                    title={t('phone.renameRecording', 'Rename')}
                    message={t('phone.renameRecordingBody', 'Enter a name for this recording.')}
                    placeholder={t('phone.namePlaceholder', 'Name')}
                    confirmLabel={t('phone.save', 'Save')}
                    maxLength={120}
                    initialValue={renaming.label ?? ''}
                    onCancel={() => setRenaming(null)}
                    onConfirm={name => {
                        const rec = renaming;
                        setRenaming(null);
                        const next = name.trim();
                        void renameRecording(rec.id, next).then(okDone => {
                            if (!okDone) return;
                            setItems(prev => prev.map(r => (r.id === rec.id ? { ...r, label: next || null } : r)));
                        });
                    }}
                />
            )}

            {pendingDelete && (
                <AlertDialog
                    title={t('phone.deleteRecordingTitle', 'Delete recording?')}
                    message={t('phone.deleteRecordingBody', 'The recording with {name} is removed for good.', {
                        name: titleOf(pendingDelete),
                    })}
                    confirmLabel={t('phone.delete', 'Delete')}
                    destructive
                    onCancel={() => setPendingDelete(null)}
                    onConfirm={() => void confirmDelete()}
                />
            )}
        </div>
    );
}

function Row({ rec, open, onToggle, onRequestRename, onRequestDelete }: {
    rec: CallRecording;
    open: boolean;
    onToggle: () => void;
    onRequestRename: () => void;
    onRequestDelete: () => void;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrubbing = useRef(false);
    const pendingSeek = useRef<number | null>(null);

    const [armed, setArmed] = useState(open);
    const [playing, setPlaying] = useState(false);
    const [at, setAt] = useState(0);
    const [total, setTotal] = useState(rec.duration || 0);

    useEffect(() => {
        if (!open) { audioRef.current?.pause(); return; }
        if (armed) return;
        const id = window.setTimeout(() => setArmed(true), EXPAND_MS);
        return () => window.clearTimeout(id);
    }, [open, armed]);

    const seekTo = (clientX: number) => {
        const track = trackRef.current;
        const el = audioRef.current;
        if (!track || !el || !total) return;
        const f = trackFraction(track, clientX);
        if (f === null) return;
        const next = f * total;
        setAt(next);
        if (el.readyState > 0) el.currentTime = next;
        else pendingSeek.current = next;
    };

    const endScrub = () => { scrubbing.current = false; };
    const pct = total ? Math.min(100, (at / total) * 100) : 0;
    const Icon = rec.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;

    return (
        <div>
            <button type="button" onClick={onToggle} className="flex w-full items-center gap-3.5 px-3.5 py-3.5 text-left active:opacity-60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/15 text-ios-blue">
                    <AudioLines className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className="truncate text-[17px] text-black dark:text-white">{titleOf(rec)}</span>
                        {rec.oneSided && <TriangleAlert className="h-[13px] w-[13px] shrink-0 text-ios-orange" />}
                    </span>
                    <span className="flex items-center gap-1.5 text-[15px] text-black/50 dark:text-white/50">
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                        {clock(rec.duration)}
                    </span>
                </span>
                <span className="shrink-0 text-[15px] text-black/50 dark:text-white/50">{when(rec.date)}</span>
            </button>

            <div
                className={clsx(
                    'grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="overflow-hidden">
                    <div className="px-4 pb-4">
                        {armed && (
                            <audio
                                ref={audioRef}
                                src={rec.url}
                                preload="metadata"
                                onPlay={() => setPlaying(true)}
                                onPause={() => setPlaying(false)}
                                onEnded={() => { setPlaying(false); setAt(0); }}
                                onTimeUpdate={e => {
                                    if (scrubbing.current || e.currentTarget.seeking) return;
                                    setAt(e.currentTarget.currentTime);
                                }}
                                onLoadedMetadata={e => {
                                    const el = e.currentTarget;
                                    const d = el.duration;
                                    if (Number.isFinite(d) && d > 0) setTotal(d);
                                    if (pendingSeek.current !== null) {
                                        el.currentTime = pendingSeek.current;
                                        pendingSeek.current = null;
                                    }
                                }}
                            />
                        )}

                        {rec.oneSided && (
                            <div className="mb-2 text-[13px] text-ios-orange">
                                {t('phone.oneSidedRecording', 'Only your side was captured.')}
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    const el = audioRef.current;
                                    if (!el) return;
                                    if (el.paused) void el.play(); else el.pause();
                                }}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ios-blue text-white active:opacity-70"
                            >
                                {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-[2px] h-4 w-4 fill-current" />}
                            </button>

                            <div
                                ref={trackRef}
                                onPointerDown={e => {
                                    if (!total) return;
                                    scrubbing.current = true;
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    seekTo(e.clientX);
                                }}
                                onPointerMove={e => { if (scrubbing.current) seekTo(e.clientX); }}
                                onPointerUp={endScrub}
                                onPointerCancel={endScrub}
                                className="relative -my-2 min-w-0 flex-1 cursor-pointer touch-none py-2"
                            >
                                <div className="relative h-5">
                                    <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/15 dark:bg-white/20" />
                                    <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/45 dark:bg-white/55" style={{ width: `${pct}%` }} />
                                    <div className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black shadow-sm dark:bg-white" style={{ left: `${pct}%` }} />
                                </div>
                            </div>

                            <span className="shrink-0 text-[13px] tabular-nums text-black/50 dark:text-white/50">
                                {clock(at)} / {clock(total)}
                            </span>

                            <button
                                type="button"
                                onClick={onRequestRename}
                                className="shrink-0 p-1 text-ios-blue active:opacity-60"
                                title={t('phone.renameRecording', 'Rename')}
                            >
                                <Pencil className="h-[17px] w-[17px]" strokeWidth={2} />
                            </button>

                            <button
                                type="button"
                                onClick={onRequestDelete}
                                className="shrink-0 p-1 text-ios-red active:opacity-60"
                                title={t('phone.deleteRecording', 'Delete recording')}
                            >
                                <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
