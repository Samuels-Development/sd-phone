import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Copy, FastForward, Mic, Pause, Pencil, Phone, Play, Rewind, SearchX, Trash2 } from 'lucide-react';

import { EmptyState } from '@/ui/EmptyState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { copyToClipboard } from '@/lib/clipboard';
import { AlertDialog } from '@/ui/AlertDialog';
import { SearchBar } from '@/ui/SearchBar';
import { PromptDialog } from '@/ui/PromptDialog';
import { ShareAction, ShareSheet } from '@/shared/ShareSheet';
import { RecordPulse } from '@/shared/audio/RecordPulse';
import { useAudioRecorder, type AudioRecording, type RecorderError } from '@/shared/audio/useAudioRecorder';
import { trackFraction } from '@/lib/zoom';
import {
    deleteMemo, fetchMemos, fmtDuration, fmtMemoDate, renameMemo, shareMemo, uploadMemo, type VoiceMemo,
} from './voiceApi';
import { t } from '@/i18n';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';
import { useDeeplinkTarget } from '@/shell/deeplink';
import { ensureCustomTone, MAX_CUSTOM_TONES, useThemeStore } from '@/stores/themeStore';
import type { ToneKind } from '@/apps/settings/tones';

function recorderMessage(code: RecorderError): string {
    if (code === 'unavailable') return t('voicememos.micUnavailable', 'Microphone unavailable on this server.');
    if (code === 'blocked')     return t('voicememos.micBlocked', 'Microphone access was blocked.');
    return t('voicememos.recordingUnsupported', 'Recording is not supported here.');
}

export function VoiceMemos({ onClose: _onClose }: { onClose: () => void }) {
    const [memos,    setMemos]    = useState<VoiceMemo[]>([]);
    const [expanded, setExpanded] = useSessionState<string | null>('voicememos:expandedId', null);
    const [renaming, setRenaming] = useState<VoiceMemo | null>(null);
    const [confirmDel, setConfirmDel] = useState<VoiceMemo | null>(null);
    const [sharing,  setSharing]  = useState<VoiceMemo | null>(null);
    const [copied,   setCopied]   = useState(false);
    const [toneSet,  setToneSet]  = useState<ToneKind | null>(null);
    const [error,    setError]    = useState<string | null>(null);
    const [query,    setQuery]    = useSessionState('voicememos:query', '');

    const { recording, seconds: recSecs, error: recError, start: startRec, stop: stopRec } = useAudioRecorder({
        onComplete: useCallback((rec: AudioRecording) => {
            const memo = uploadMemo(rec.dataUrl, t('voicememos.newRecording', 'New Recording'), rec.duration, rec.blob);
            if (memo) setMemos(prev => [memo, ...prev]);
        }, []),
    });

    useEffect(() => {
        if (recError) setError(recorderMessage(recError));
    }, [recError]);

    useEffect(() => { void fetchMemos().then(setMemos); }, []);

    const [pendingMemoId, setPendingMemoId] = useState<string | null>(null);
    useDeeplinkTarget('voicememos', target => {
        setQuery('');
        setPendingMemoId(String(target.memoId));
    });
    useEffect(() => {
        if (!pendingMemoId) return;
        const memo = memos.find(m => String(m.id) === pendingMemoId);
        if (!memo) return;
        setExpanded(memo.id);
        setPendingMemoId(null);
    }, [pendingMemoId, memos, setExpanded]);

    useNuiEvent('sd-phone:voice:added', useCallback((memo: VoiceMemo) => {
        setMemos(prev => (prev.some(m => m.id === memo.id) ? prev : [memo, ...prev]));
    }, []));
    useNuiEvent('sd-phone:voice:uploadFailed', useCallback((d: { message?: string }) => {
        setError(d?.message ?? t('voicememos.uploadFailed', 'Upload failed'));
    }, []));

    function onDelete(id: string) {
        deleteMemo(id);
        setMemos(prev => prev.filter(m => m.id !== id));
        if (expanded === id) setExpanded(null);
    }

    function onRename(id: string, name: string) {
        renameMemo(id, name);
        setMemos(prev => prev.map(m => (m.id === id ? { ...m, name } : m)));
    }

    function copyLink(url: string) {
        copyToClipboard(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }

    function applyAsTone(kind: ToneKind, memo: VoiceMemo) {
        const id = ensureCustomTone(kind, memo.name, memo.url);
        if (!id) {
            setSharing(null);
            setError(t('voicememos.toneLimit', 'You can save up to {n} custom tones. Remove one in Settings first.', { n: MAX_CUSTOM_TONES }));
            return;
        }
        const store = useThemeStore.getState();
        if (kind === 'ringtone') store.setRingtone(id);
        else                     store.setNotificationTone(id);
        setError(null);
        setToneSet(kind);
        window.setTimeout(() => setToneSet(null), 1600);
    }

    const q    = query.trim().toLowerCase();
    const list = q ? memos.filter(m => m.name.toLowerCase().includes(q)) : memos;

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base font-sf text-black dark:text-white">
            <StatusBarSpacer />
            <div className="px-5 pb-1 pt-1 text-[34px] font-bold tracking-tight">{t('voicememos.title', 'Voice Memos')}</div>

            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-2 mt-1" />

            {error && (
                <div className="mx-4 mb-2 rounded-[12px] bg-ios-red/10 px-4 py-2.5 text-[14px] font-medium text-ios-red">
                    {error}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
                {memos.length === 0 ? (
                    <EmptyState icon={Mic} title={t('voicememos.noRecordings', 'No Recordings')}
                        subtitle={t('voicememos.noRecordingsSubtitle', 'Tap the record button to capture a voice memo.')} />
                ) : list.length === 0 ? (
                    <EmptyState icon={SearchX} title={t('voicememos.noResults', 'No Results')}
                        subtitle={t('voicememos.noResultsSubtitle', 'No recordings match your search.')} />
                ) : (
                    list.map(m => (
                        <MemoRow
                            key={m.id}
                            memo={m}
                            expanded={expanded === m.id}
                            onToggle={() => setExpanded(e => (e === m.id ? null : m.id))}
                            onRename={() => setRenaming(m)}
                            onShare={() => setSharing(m)}
                            onDelete={() => setConfirmDel(m)}
                        />
                    ))
                )}
            </div>

            <div className="shrink-0 border-t border-black/10 bg-surface px-6 pb-9 pt-5 dark:border-white/10">
                <div className="flex justify-center">
                    <button
                        type="button"
                        aria-label={recording ? t('voicememos.stopRecording', 'Stop recording') : t('voicememos.record', 'Record')}
                        onClick={() => { if (recording) stopRec(); else { setError(null); void startRec(); } }}
                        className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-elevated ring-[3px] ring-black/15 active:opacity-80 dark:bg-elevated dark:ring-white/20"
                    >
                        <span
                            className="bg-ios-red transition-all duration-200"
                            style={recording
                                ? { width: 32, height: 32, borderRadius: 8 }
                                : { width: 66, height: 66, borderRadius: 33 }}
                        />
                    </button>
                </div>

                <div className="mt-3 flex h-[22px] items-center justify-center">
                    {recording && <RecordPulse seconds={recSecs} />}
                </div>
            </div>

            {renaming && (
                <PromptDialog
                    title={t('voicememos.rename', 'Rename')}
                    message={t('voicememos.renameMessage', 'Enter a new name for this recording.')}
                    placeholder={t('voicememos.namePlaceholder', 'Name')}
                    confirmLabel={t('voicememos.save', 'Save')}
                    maxLength={80}
                    initialValue={renaming.name}
                    onCancel={() => setRenaming(null)}
                    onConfirm={(name) => { const n = name.trim(); if (n) onRename(renaming.id, n); setRenaming(null); }}
                />
            )}

            {confirmDel && (
                <AlertDialog
                    title={t('voicememos.deleteRecording', 'Delete Recording')}
                    message={t('voicememos.deleteMessage', '“{name}” will be permanently deleted.', { name: confirmDel.name })}
                    confirmLabel={t('voicememos.delete', 'Delete')}
                    cancelLabel={t('voicememos.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmDel(null)}
                    onConfirm={() => { onDelete(confirmDel.id); setConfirmDel(null); }}
                />
            )}

            {sharing && (
                <ShareSheet
                    onClose={() => { setSharing(null); setCopied(false); setToneSet(null); }}
                    onShare={(t) => shareMemo(sharing.id, t.id)}
                >
                    <ShareAction
                        icon={<Copy className="h-[23px] w-[23px]" strokeWidth={2} />}
                        label={copied ? t('voicememos.copied', 'Copied!') : t('voicememos.copyLink', 'Copy Link')}
                        onClick={() => copyLink(sharing.url)}
                    />
                    <ShareAction
                        icon={<Phone className="h-[23px] w-[23px]" strokeWidth={2} />}
                        label={toneSet === 'ringtone' ? t('voicememos.ringtoneSet', 'Ringtone Set') : t('voicememos.useAsRingtone', 'Use as Ringtone')}
                        onClick={() => applyAsTone('ringtone', sharing)}
                    />
                    <ShareAction
                        icon={<Bell className="h-[23px] w-[23px]" strokeWidth={2} />}
                        label={toneSet === 'notification' ? t('voicememos.notificationSet', 'Notification Sound Set') : t('voicememos.useAsNotification', 'Use as Notification Sound')}
                        onClick={() => applyAsTone('notification', sharing)}
                    />
                </ShareSheet>
            )}
        </div>
    );
}

function MemoRow({ memo, expanded, onToggle, onRename, onShare, onDelete }: {
    memo:     VoiceMemo;
    expanded: boolean;
    onToggle: () => void;
    onRename: () => void;
    onShare:  () => void;
    onDelete: () => void;
}) {
    const innerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);
    useEffect(() => {
        setHeight(expanded ? (innerRef.current?.scrollHeight ?? 0) : 0);
    }, [expanded]);

    return (
        <div className="mb-2.5 overflow-hidden rounded-[16px] bg-surface">
            <button type="button" onClick={onToggle} className="flex w-full items-center gap-3.5 px-5 py-4 text-start active:bg-black/[0.03] dark:active:bg-white/[0.03]">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span
                            dir="auto"
                            onClick={expanded ? (e) => { e.stopPropagation(); onRename(); } : undefined}
                            className="min-w-0 truncate text-[19px] font-semibold"
                        >
                            {memo.name}
                        </span>
                        {expanded && (
                            <span
                                role="button"
                                aria-label={t('voicememos.renameRecording', 'Rename recording')}
                                onClick={(e) => { e.stopPropagation(); onRename(); }}
                                className="shrink-0 text-ios-blue active:opacity-60"
                            >
                                <Pencil className="h-[16px] w-[16px]" strokeWidth={2.2} />
                            </span>
                        )}
                    </div>
                    <div className="mt-0.5 text-[14px] text-ios-gray">{fmtMemoDate(memo.date)}</div>
                </div>
                {!expanded && <span className="shrink-0 text-[14px] tabular-nums text-ios-gray">{fmtDuration(memo.duration)}</span>}
            </button>

            <div className="overflow-hidden" style={{ height, transition: 'height 0.34s cubic-bezier(0.32, 0.72, 0, 1)' }}>
                <div ref={innerRef} style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.26s ease' }}>
                    <Player memo={memo} active={expanded} onShare={onShare} onDelete={onDelete} />
                </div>
            </div>
        </div>
    );
}

function Player({ memo, active, onShare, onDelete }: { memo: VoiceMemo; active: boolean; onShare: () => void; onDelete: () => void }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [cur, setCur] = useState(0);
    const [dur, setDur] = useState(memo.duration || 0);
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    useEffect(() => { if (!active) audioRef.current?.pause(); }, [active]);

    const clamp = (n: number) => Math.max(0, Math.min(dur || 0, n));
    function toggle() { const a = audioRef.current; if (!a) return; if (playing) a.pause(); else void a.play(); }
    function skip(d: number) { const a = audioRef.current; if (!a) return; a.currentTime = clamp((a.currentTime || 0) + d); }

    function applyScrub(clientX: number) {
        const el = trackRef.current;
        if (!el || !dur) return;
        const f = trackFraction(el, clientX);
        if (f === null) return;
        const t = clamp(f * dur);
        if (audioRef.current) audioRef.current.currentTime = t;
        setCur(t);
    }
    function onDown(e: React.PointerEvent<HTMLDivElement>) {
        if (!dur) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        applyScrub(e.clientX);
    }
    function onMove(e: React.PointerEvent<HTMLDivElement>) { if (dragging.current) applyScrub(e.clientX); }
    function onUp() { dragging.current = false; }

    const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;

    return (
        <div className="px-5 pb-5 pt-1">
            <audio
                ref={audioRef}
                src={memo.url}
                preload="none"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setCur(0); }}
                onTimeUpdate={(e) => { if (!dragging.current) setCur(e.currentTarget.currentTime); }}
                onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
            />

            <div
                ref={trackRef}
                dir="ltr"
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="relative mb-1.5 h-5 cursor-pointer touch-none"
            >
                <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/15 dark:bg-white/20" />
                <div className="absolute start-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-black/45 dark:bg-white/55" style={{ width: `${pct}%` }} />
                <div className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black shadow-sm dark:bg-white" style={{ left: `${pct}%` }} />
            </div>
            <div dir="ltr" className="mb-3.5 flex justify-between text-[12px] tabular-nums text-ios-gray">
                <span>{fmtDuration(cur)}</span>
                <span>{fmtDuration(dur)}</span>
            </div>

            <div className="flex items-center justify-between px-1">
                <button type="button" onClick={onShare} aria-label={t('voicememos.share', 'Share')} className="text-ios-blue active:opacity-60">
                    <ShareGlyph className="h-[28px] w-[28px]" />
                </button>

                <div dir="ltr" className="flex items-center gap-7 text-black dark:text-white">
                    <button type="button" onClick={() => skip(-15)} aria-label={t('voicememos.skipBack', 'Skip back')} className="active:opacity-50">
                        <Rewind className="h-[26px] w-[26px]" fill="currentColor" strokeWidth={0} />
                    </button>
                    <button type="button" onClick={toggle} aria-label={playing ? t('voicememos.pause', 'Pause') : t('voicememos.play', 'Play')} className="active:opacity-50">
                        {playing ? <Pause className="h-[30px] w-[30px]" fill="currentColor" strokeWidth={0} /> : <Play className="h-[30px] w-[30px]" fill="currentColor" strokeWidth={0} />}
                    </button>
                    <button type="button" onClick={() => skip(15)} aria-label={t('voicememos.skipForward', 'Skip forward')} className="active:opacity-50">
                        <FastForward className="h-[26px] w-[26px]" fill="currentColor" strokeWidth={0} />
                    </button>
                </div>

                <button type="button" onClick={onDelete} aria-label={t('voicememos.delete', 'Delete')} className="text-ios-blue active:opacity-60">
                    <Trash2 className="h-[28px] w-[28px]" strokeWidth={2} />
                </button>
            </div>
        </div>
    );
}

function ShareGlyph({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path d="M8 11H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 3v11M8.5 6.5 12 3l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
