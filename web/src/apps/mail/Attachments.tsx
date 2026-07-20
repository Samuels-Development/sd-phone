import { useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Download, Paperclip, Pause, Play, StickyNote, X } from 'lucide-react';

import { t } from '@/i18n';
import { isFiveM } from '@/core/nui';
import { useNuiQuery } from '@/hooks/useNuiQuery';
import { AlertDialog } from '@/ui/AlertDialog';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { Sheet } from '@/ui/Sheet';
import { fetchMemos, fmtDuration, fmtMemoDate, type VoiceMemo } from '@/apps/voicememos/voiceApi';
import { loadState as loadNotes, noteTitle, notePreview, type Note, type NotesState } from '@/apps/notes/data';
import { attachmentSaveStates, saveAttachment, type MailAttachment } from './data';

export function AttachmentStrip({ attachments, max, onRemove }: {
    attachments: MailAttachment[];
    max:         number;
    onRemove:    (index: number) => void;
}) {
    const [viewer,   setViewer]   = useState<string | null>(null);
    const [openNote, setOpenNote] = useState<Extract<MailAttachment, { kind: 'note' }> | null>(null);
    if (attachments.length === 0) return null;
    // Original indices survive the photo/other split so removal stays addressable.
    const indexed = attachments.map((a, i) => ({ a, i }));
    const photos  = indexed.filter(({ a }) => a.kind === 'photo');
    const others  = indexed.filter(({ a }) => a.kind !== 'photo');

    return (
        <div className="mt-2 shrink-0 overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
            <div className="flex items-center gap-1.5 px-4 pb-1 pt-3">
                <Paperclip className="h-[15px] w-[15px] text-ios-gray" strokeWidth={2.2} />
                <span className="text-[14px] font-semibold uppercase tracking-wide text-ios-gray">
                    {t('mail.attachmentsLabel', 'Attachments')}
                </span>
                <span className="ml-auto text-[14px] text-ios-gray">{attachments.length}/{max}</span>
            </div>

            <div className="max-h-[250px] overflow-y-auto no-scrollbar">
                {photos.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 px-4 pb-3 pt-2">
                        {photos.map(({ a, i }) => a.kind === 'photo' && (
                            <div key={i} className="relative">
                                <button type="button" onClick={() => setViewer(a.url)} className="block active:opacity-70">
                                    <img src={a.url} alt="" className="h-[76px] w-[76px] rounded-[10px] object-cover" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRemove(i)}
                                    aria-label={t('mail.removeAttachment', 'Remove attachment')}
                                    className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/55 text-white active:opacity-70"
                                >
                                    <X className="h-[14px] w-[14px]" strokeWidth={2.8} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {others.map(({ a, i }, idx) => (
                    <div key={i}>
                        {(idx > 0 || photos.length > 0) && (
                            <div className="bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
                        )}
                        <div className="flex items-center gap-3 px-4 py-3">
                            {a.kind === 'audio' ? (
                                <StripAudioRow att={a} />
                            ) : a.kind === 'note' && (
                                <button
                                    type="button"
                                    onClick={() => setOpenNote(a)}
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
                                >
                                    <StickyNote className="h-[24px] w-[24px] shrink-0 text-ios-orange" strokeWidth={2} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[16px] font-medium">{a.title || t('mail.note', 'Note')}</div>
                                        <div className="truncate text-[13px] text-ios-gray">{t('mail.note', 'Note')}</div>
                                    </div>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onRemove(i)}
                                aria-label={t('mail.removeAttachment', 'Remove attachment')}
                                className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-black/10 text-black/55 active:opacity-70 dark:bg-white/15 dark:text-white/70"
                            >
                                <X className="h-[15px] w-[15px]" strokeWidth={2.6} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {viewer && <ImageLightbox src={viewer} onClose={() => setViewer(null)} />}
            {openNote && <NoteSheet title={openNote.title} body={openNote.body} onClose={() => setOpenNote(null)} />}
        </div>
    );
}

function PickerSheet({ title, action, children, onClose }: {
    title:    string;
    action?:  { label: string; disabled: boolean; onClick: () => void };
    children: React.ReactNode;
    onClose:  () => void;
}) {
    return (
        <Sheet onClose={onClose} grabber={false} className="font-sf bg-[#d4d4d4] text-black dark:bg-base dark:text-white">
            {({ close }) => (
                <>
                    <div className="flex h-12 shrink-0 items-center px-4 pt-1">
                        <div className="flex flex-1 justify-start">
                            <button type="button" onClick={close} className="text-[16px] text-ios-blue active:opacity-60">
                                {t('mail.cancel', 'Cancel')}
                            </button>
                        </div>
                        <div className="flex shrink-0 justify-center">
                            <span className="max-w-[180px] truncate text-[15px] font-semibold">{title}</span>
                        </div>
                        <div className="flex flex-1 justify-end">
                            {action && (
                                <button
                                    type="button"
                                    onClick={() => { if (!action.disabled) action.onClick(); }}
                                    className={`text-[16px] font-semibold ${!action.disabled ? 'text-ios-blue active:opacity-60' : 'text-ios-gray/50'}`}
                                >
                                    {action.label}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-4 pt-1">{children}</div>
                </>
            )}
        </Sheet>
    );
}

function SelectCircle({ selected }: { selected: boolean }) {
    return (
        <div
            className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
                selected ? 'border-ios-blue bg-ios-blue' : 'border-black/25 bg-transparent dark:border-white/30'
            }`}
        >
            <svg
                viewBox="0 0 24 24"
                className="h-[20px] w-[20px]"
                fill="none"
                aria-hidden
                style={{ transform: selected ? 'scale(1)' : 'scale(0)', transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1)' }}
            >
                <path d="M6.2 12.5l3.6 3.6L17.8 7.8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}

export function MemoPickerSheet({ excludeUrls, max, onPickMany, onClose }: {
    excludeUrls: Set<string>;
    max:         number;
    onPickMany:  (memos: VoiceMemo[]) => void;
    onClose:     () => void;
}) {
    const [memos,    setMemos]    = useState<VoiceMemo[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    useEffect(() => { void fetchMemos().then(setMemos); }, []);

    const candidates = (memos ?? []).filter(m => !excludeUrls.has(m.url));

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < max) next.add(id);
            return next;
        });
    }

    return (
        <PickerSheet
            title={t('mail.attachMemoTitle', 'Attach Voice Memos')}
            action={{
                label: `${t('mail.add', 'Add')}${selected.size ? ` (${selected.size}/${max})` : ''}`,
                disabled: selected.size === 0,
                onClick: () => onPickMany(candidates.filter(m => selected.has(m.id))),
            }}
            onClose={onClose}
        >
            {memos !== null && candidates.length === 0 ? (
                <p className="pt-10 text-center text-[14px] text-black/45 dark:text-white/45">
                    {t('mail.noMemos', 'No recordings to attach. Record one in Voice Memos first.')}
                </p>
            ) : (
                <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                    {candidates.map((m, i) => (
                        <div key={m.id}>
                            <button
                                type="button"
                                onClick={() => toggle(m.id)}
                                className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <AudioLines className="h-[24px] w-[24px] shrink-0 text-ios-blue" strokeWidth={2} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[17px] font-medium">{m.name}</div>
                                    <div className="truncate text-[14px] text-ios-gray">{fmtMemoDate(m.date)}</div>
                                </div>
                                <span className="shrink-0 text-[15px] text-ios-gray">{fmtDuration(m.duration)}</span>
                                <SelectCircle selected={selected.has(m.id)} />
                            </button>
                            {i < candidates.length - 1 && <div className="bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                        </div>
                    ))}
                </div>
            )}
        </PickerSheet>
    );
}

export function NotePickerSheet({ max, onPickMany, onClose }: {
    max:        number;
    onPickMany: (notes: Note[]) => void;
    onClose:    () => void;
}) {
    // In-game notes are per-character server data (localStorage only backs the dev browser),
    // so this mirrors Notes.tsx: seed from localStorage in dev, query the server in FiveM.
    const [allNotes, setAllNotes] = useState<Note[]>(() => (isFiveM ? [] : loadNotes().notes));
    const [loaded,   setLoaded]   = useState(!isFiveM);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    useNuiQuery<NotesState>('sd-phone:notes:list', {
        enabled: isFiveM,
        onData: s => { setAllNotes(s.notes); setLoaded(true); },
    });

    const notes = allNotes.filter(n => n.body.trim() !== '');

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < max) next.add(id);
            return next;
        });
    }

    return (
        <PickerSheet
            title={t('mail.attachNoteTitle', 'Attach Notes')}
            action={{
                label: `${t('mail.add', 'Add')}${selected.size ? ` (${selected.size}/${max})` : ''}`,
                disabled: selected.size === 0,
                onClick: () => onPickMany(notes.filter(n => selected.has(n.id))),
            }}
            onClose={onClose}
        >
            {loaded && notes.length === 0 ? (
                <p className="pt-10 text-center text-[14px] text-black/45 dark:text-white/45">
                    {t('mail.noNotes', 'No notes to attach. Write one in Notes first.')}
                </p>
            ) : (
                <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                    {notes.map((n, i) => (
                        <div key={n.id}>
                            <button
                                type="button"
                                onClick={() => toggle(n.id)}
                                className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <StickyNote className="h-[24px] w-[24px] shrink-0 text-ios-orange" strokeWidth={2} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[17px] font-medium">{noteTitle(n)}</div>
                                    <div className="truncate text-[14px] text-ios-gray">{notePreview(n)}</div>
                                </div>
                                <SelectCircle selected={selected.has(n.id)} />
                            </button>
                            {i < notes.length - 1 && <div className="bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                        </div>
                    ))}
                </div>
            )}
        </PickerSheet>
    );
}

function NoteSheet({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
    const [leaving, setLeaving] = useState(false);
    function close() {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(onClose, 260);
    }
    return (
        <div
            className="absolute inset-0 z-50 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white"
            style={{ animation: leaving
                ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)' }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />
            <div className="relative flex h-11 shrink-0 items-center px-4">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="max-w-[60%] truncate text-[15px] font-semibold">{title || t('mail.note', 'Note')}</span>
                </div>
                <button type="button" onClick={close} className="ml-auto text-[16px] font-medium text-ios-blue">
                    {t('mail.done', 'Done')}
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar whitespace-pre-wrap px-5 pb-10 pt-2 text-[16px] leading-[1.55]">
                {body}
            </div>
        </div>
    );
}

function StripAudioRow({ att }: { att: Extract<MailAttachment, { kind: 'audio' }> }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing,  setPlaying]  = useState(false);
    const [position, setPosition] = useState(0);

    function toggle() {
        const el = audioRef.current;
        if (!el) return;
        if (playing) el.pause();
        else void el.play();
    }

    return (
        <>
            <audio
                ref={audioRef}
                src={att.url}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setPosition(0); }}
                onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
            />
            <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t('mail.pause', 'Pause') : t('mail.play', 'Play')}
                className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-ios-blue text-white active:opacity-70"
            >
                {playing
                    ? <Pause className="h-[15px] w-[15px]" strokeWidth={2.4} fill="currentColor" />
                    : <Play className="ml-0.5 h-[15px] w-[15px]" strokeWidth={2.4} fill="currentColor" />}
            </button>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-medium">{att.name || t('mail.voiceMemo', 'Voice Memo')}</div>
                <div className="truncate text-[13px] text-ios-gray">
                    {playing || position > 0 ? `${fmtDuration(position)} / ` : ''}{fmtDuration(att.duration)}
                </div>
            </div>
        </>
    );
}

function SaveButton({ saved, onSave, label }: { saved: boolean; onSave: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onSave}
            disabled={saved}
            aria-label={label}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-black/10 text-black/60 active:opacity-70 dark:bg-white/15 dark:text-white/70"
        >
            {saved
                ? <Check className="h-[17px] w-[17px] text-ios-blue" strokeWidth={2.6} />
                : <Download className="h-[17px] w-[17px]" strokeWidth={2.2} />}
        </button>
    );
}

function AudioAttachmentCard({ att, saved, onSave }: {
    att:     Extract<MailAttachment, { kind: 'audio' }>;
    saved:   boolean;
    onSave?: () => void;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing,  setPlaying]  = useState(false);
    const [position, setPosition] = useState(0);

    function toggle() {
        const el = audioRef.current;
        if (!el) return;
        if (playing) el.pause();
        else void el.play();
    }

    return (
        <div className="flex items-center gap-3 rounded-[12px] bg-[#e5e5e5] px-3.5 py-3 dark:bg-white/[0.07]">
            <audio
                ref={audioRef}
                src={att.url}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setPosition(0); }}
                onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
            />
            <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t('mail.pause', 'Pause') : t('mail.play', 'Play')}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-ios-blue text-white active:opacity-70"
            >
                {playing
                    ? <Pause className="h-[18px] w-[18px]" strokeWidth={2.4} fill="currentColor" />
                    : <Play className="ml-0.5 h-[18px] w-[18px]" strokeWidth={2.4} fill="currentColor" />}
            </button>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{att.name || t('mail.voiceMemo', 'Voice Memo')}</div>
                <div className="text-[13px] text-ios-gray">
                    {playing || position > 0 ? `${fmtDuration(position)} / ` : ''}{fmtDuration(att.duration)}
                </div>
            </div>
            {onSave && <SaveButton saved={saved} onSave={onSave} label={t('mail.saveToMemos', 'Save to Voice Memos')} />}
        </div>
    );
}

export function AttachmentsView({ attachments, accountEmail, messageId, canSave }: {
    attachments:  MailAttachment[];
    accountEmail: string;
    messageId:    string;
    canSave:      boolean;
}) {
    const [viewer,   setViewer]   = useState<{ url: string; i: number } | null>(null);
    const [openNote, setOpenNote] = useState<Extract<MailAttachment, { kind: 'note' }> | null>(null);
    const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
    const [saveErr,  setSaveErr]  = useState<string | null>(null);
    // Save buttons stay hidden until the server reports which attachments are already saved,
    // so an already-saved item never flashes an actionable download button.
    const [statesReady, setStatesReady] = useState(!canSave || !isFiveM);

    useEffect(() => {
        if (!canSave || !isFiveM) return;
        let alive = true;
        void attachmentSaveStates(accountEmail, messageId).then(states => {
            if (!alive) return;
            setSavedIdx(new Set(states.flatMap((s, i) => (s ? [i] : []))));
            setStatesReady(true);
        });
        return () => { alive = false; };
    }, [accountEmail, messageId, canSave]);

    const showSave = canSave && statesReady;

    // Original indices survive the photo/other split; the server resolves saves by index.
    const indexed = attachments.map((a, i) => ({ a, i }));
    const photos  = indexed.filter(({ a }) => a.kind === 'photo');
    const others  = indexed.filter(({ a }) => a.kind !== 'photo');

    async function saveOther(index: number) {
        if (savedIdx.has(index)) return;
        const r = await saveAttachment(accountEmail, messageId, index);
        if (r.ok) setSavedIdx(prev => new Set(prev).add(index));
        else setSaveErr(r.message ?? t('mail.saveAttachmentFailed', 'Could not save the attachment.'));
    }

    return (
        <div className="flex flex-col gap-2.5">
            {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {photos.map(({ a, i }) => a.kind === 'photo' && (
                        <button key={i} type="button" onClick={() => setViewer({ url: a.url, i })} className="active:opacity-70">
                            <img src={a.url} alt="" className="aspect-square w-full rounded-[10px] object-cover" />
                        </button>
                    ))}
                </div>
            )}
            {others.map(({ a, i }) => a.kind === 'audio'
                ? (
                    <AudioAttachmentCard
                        key={i}
                        att={a}
                        saved={savedIdx.has(i)}
                        onSave={showSave ? () => void saveOther(i) : undefined}
                    />
                )
                : a.kind === 'note' && (
                    <div
                        key={i}
                        className="flex items-center gap-3 rounded-[12px] bg-[#e5e5e5] px-3.5 py-3 dark:bg-white/[0.07]"
                    >
                        <button
                            type="button"
                            onClick={() => setOpenNote(a)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
                        >
                            <StickyNote className="h-[22px] w-[22px] shrink-0 text-ios-orange" strokeWidth={2} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[15px] font-medium">{a.title || t('mail.note', 'Note')}</div>
                                <div className="line-clamp-2 text-[13px] leading-snug text-ios-gray">{a.body}</div>
                            </div>
                        </button>
                        {showSave && (
                            <SaveButton saved={savedIdx.has(i)} onSave={() => void saveOther(i)} label={t('mail.saveToNotes', 'Save to Notes')} />
                        )}
                    </div>
                ))}

            {viewer && (
                <ImageLightbox
                    src={viewer.url}
                    onClose={() => setViewer(null)}
                    action={showSave ? {
                        label: savedIdx.has(viewer.i) ? t('mail.savedToPhotos', 'Saved to Photos') : t('mail.saveToPhotos', 'Save to Photos'),
                        onClick: () => void saveOther(viewer.i),
                    } : undefined}
                />
            )}

            {openNote && <NoteSheet title={openNote.title} body={openNote.body} onClose={() => setOpenNote(null)} />}

            {saveErr && (
                <AlertDialog
                    title={t('mail.saveAttachmentFailedTitle', 'Could Not Save')}
                    message={saveErr}
                    confirmLabel={t('mail.ok', 'OK')}
                    hideCancel
                    onCancel={() => setSaveErr(null)}
                    onConfirm={() => setSaveErr(null)}
                />
            )}
        </div>
    );
}
