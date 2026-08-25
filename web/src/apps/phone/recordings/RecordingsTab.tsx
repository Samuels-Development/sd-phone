import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Pause, Play, PhoneIncoming, PhoneOutgoing, Trash2, TriangleAlert } from 'lucide-react';

import { EmptyState } from '@/ui/EmptyState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { formatPhone } from '@/lib/phone';
import { t } from '@/i18n';
import { deleteRecording, fetchRecordings, type CallRecording } from '../callrecApi';

function clock(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function when(iso: string) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const today = new Date();
    const sameDay = at.toDateString() === today.toDateString();
    return sameDay
        ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : at.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function RecordingsTab() {
    const [items, setItems] = useState<CallRecording[]>([]);
    const [openId, setOpenId] = useState<string | null>(null);

    const load = useCallback(() => { void fetchRecordings().then(setItems); }, []);
    useEffect(() => { load(); }, [load]);

    useNuiEvent('sd-phone:callrec:added', useCallback((rec: CallRecording) => {
        setItems(prev => [rec, ...prev.filter(r => r.id !== rec.id)]);
    }, []));

    const remove = async (id: string) => {
        const okGone = await deleteRecording(id);
        if (!okGone) return;
        setItems(prev => prev.filter(r => r.id !== id));
        setOpenId(prev => (prev === id ? null : prev));
    };

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <h1 className="px-5 pb-2 pt-6 text-[34px] font-bold tracking-tight text-black dark:text-white">
                {t('phone.recordings', 'Recordings')}
            </h1>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-6">
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
                                        <div className="pointer-events-none ml-[54px] bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
                                    )}
                                    <Row
                                        rec={rec}
                                        open={openId === rec.id}
                                        onToggle={() => setOpenId(prev => (prev === rec.id ? null : rec.id))}
                                        onDelete={() => void remove(rec.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Row({ rec, open, onToggle, onDelete }: {
    rec: CallRecording;
    open: boolean;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrubbing = useRef(false);

    const [playing, setPlaying] = useState(false);
    const [at, setAt] = useState(0);
    const [total, setTotal] = useState(rec.duration || 0);

    useEffect(() => { if (!open) audioRef.current?.pause(); }, [open]);

    const title = rec.peerName?.trim() || formatPhone(rec.peerNumber);
    const Icon = rec.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;

    const seekTo = (clientX: number) => {
        const track = trackRef.current;
        const el = audioRef.current;
        if (!track || !el || !total) return;
        const box = track.getBoundingClientRect();
        const next = Math.max(0, Math.min(total, ((clientX - box.left) / box.width) * total));
        el.currentTime = next;
        setAt(next);
    };

    const pct = total ? Math.min(100, (at / total) * 100) : 0;

    return (
        <div>
            <button type="button" onClick={onToggle} className="flex w-full items-center gap-3.5 px-3.5 py-3.5 text-left active:opacity-60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/15 text-ios-blue">
                    <AudioLines className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                        <span className="truncate text-[17px] text-black dark:text-white">{title}</span>
                        {rec.oneSided && <TriangleAlert className="h-[13px] w-[13px] shrink-0 text-ios-orange" />}
                    </span>
                    <span className="flex items-center gap-1.5 text-[15px] text-black/50 dark:text-white/50">
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                        {clock(rec.duration)}
                    </span>
                </span>
                <span className="shrink-0 text-[15px] text-black/50 dark:text-white/50">{when(rec.date)}</span>
            </button>

            {open && (
                <div className="px-4 pb-4">
                    <audio
                        ref={audioRef}
                        src={rec.url}
                        preload="none"
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onEnded={() => { setPlaying(false); setAt(0); }}
                        onTimeUpdate={e => { if (!scrubbing.current) setAt(e.currentTarget.currentTime); }}
                        onLoadedMetadata={e => {
                            const d = e.currentTarget.duration;
                            if (Number.isFinite(d) && d > 0) setTotal(d);
                        }}
                    />

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
                            onPointerDown={e => { if (!total) return; scrubbing.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekTo(e.clientX); }}
                            onPointerMove={e => { if (scrubbing.current) seekTo(e.clientX); }}
                            onPointerUp={() => { scrubbing.current = false; }}
                            onPointerCancel={() => { scrubbing.current = false; }}
                            className="relative h-5 min-w-0 flex-1 cursor-pointer touch-none"
                        >
                            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/15 dark:bg-white/20" />
                            <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/45 dark:bg-white/55" style={{ width: `${pct}%` }} />
                            <div className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black shadow-sm dark:bg-white" style={{ left: `${pct}%` }} />
                        </div>

                        <span className="shrink-0 text-[13px] tabular-nums text-black/50 dark:text-white/50">
                            {clock(at)} / {clock(total)}
                        </span>

                        <button
                            type="button"
                            onClick={onDelete}
                            className="shrink-0 p-1 text-ios-red active:opacity-60"
                            title={t('phone.deleteRecording', 'Delete recording')}
                        >
                            <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
