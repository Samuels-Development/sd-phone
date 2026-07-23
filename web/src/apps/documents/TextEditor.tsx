import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, ChevronLeft, Image as ImageIcon, Lock, PenLine, X } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { useContacts } from '@/stores/contactsStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { apiGetSignature, apiSetSignature, apiSignDoc } from './documentsApi';
import { SIGNATURE_STYLES, SignaturePad, renderTypedSignature, type SignaturePadHandle } from './SignaturePad';
import { MAX_TEXT_LENGTH, formatDocDate, type DocFile, type DocSignature } from './data';

interface Props {
    doc:       DocFile;
    backLabel: string;
    onBack:    () => void;
    onSave:    (content: string) => void;
    onSigned?: (doc: DocFile) => void;
    animateIn?: boolean;
}

export function TextEditor({ doc, backLabel, onBack, onSave, onSigned, animateIn = true }: Props) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);

    // The editor works on blocks (text runs + inline images) over the same storage format the
    // exports use: a line that is exactly one URL is an image. Serializing the blocks yields
    // the canonical string, so signing, AirShare and script-issued documents stay compatible.
    const [blocks, setBlocks] = useState<EditBlock[]>(() => parseEditBlocks(doc.content ?? ''));
    const signed   = doc.signed === true;
    const readOnly = doc.locked || signed;
    const [signOpen, setSignOpen] = useState(false);
    const [picking,  setPicking]  = useState(false);

    const body = readOnly ? (doc.content ?? '') : serializeBlocks(blocks);

    // Baseline is the parsed round-trip, not the raw content, so normalization alone never
    // triggers a save.
    const lastSaved = useRef<string>();
    lastSaved.current ??= serializeBlocks(blocks);
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;

    // Caret bookkeeping so an inserted image lands where the player is typing.
    const caretRef    = useRef<{ index: number; pos: number } | null>(null);
    const taRefs      = useRef(new Map<number, HTMLTextAreaElement>());
    const focusAfter  = useRef<number | null>(null);

    useLayoutEffect(() => {
        if (focusAfter.current === null) return;
        const el = taRefs.current.get(focusAfter.current);
        focusAfter.current = null;
        if (el) { el.focus(); el.setSelectionRange(0, 0); }
    }, [blocks]);

    function setTextBlock(id: number, value: string) {
        setBlocks(prev => prev.map(b => (b.id === id && b.kind === 'text' ? { ...b, value } : b)));
    }

    function insertImage(url: string) {
        setPicking(false);
        if (body.length + url.length + 1 > MAX_TEXT_LENGTH) return;
        setBlocks(prev => {
            const at = caretRef.current;
            const target = at && prev[at.index];
            if (target && target.kind === 'text') {
                const after: EditBlock = { id: nextBlockId(), kind: 'text', value: target.value.slice(at.pos) };
                focusAfter.current = after.id;
                return normalizeBlocks([
                    ...prev.slice(0, at.index),
                    { ...target, value: target.value.slice(0, at.pos) },
                    { id: nextBlockId(), kind: 'image', url },
                    after,
                    ...prev.slice(at.index + 1),
                ]);
            }
            return normalizeBlocks([...prev, { id: nextBlockId(), kind: 'image', url }]);
        });
    }

    function removeImage(id: number) {
        caretRef.current = null;
        setBlocks(prev => normalizeBlocks(prev.filter(b => b.id !== id)));
    }

    useEffect(() => {
        if (readOnly) return;
        const handle = window.setTimeout(() => {
            if (body === lastSaved.current) return;
            lastSaved.current = body;
            onSaveRef.current(body);
        }, 800);
        return () => window.clearTimeout(handle);
    }, [body, readOnly]);

    // Flush on unmount (covers back before the debounce fires). Refs hold latest.
    const live = useRef(body);
    live.current = body;
    const roRef = useRef(readOnly);
    roRef.current = readOnly;
    useEffect(() => () => {
        if (roRef.current) return;
        if (live.current !== lastSaved.current) {
            lastSaved.current = live.current;
            onSaveRef.current(live.current);
        }
    }, []);

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex items-center gap-2 px-2 pb-1 pt-3">
                <button
                    type="button"
                    onClick={goBack}
                    className="flex shrink-0 items-center gap-0.5 text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.5} />
                    <span className="text-[17px]">{backLabel}</span>
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{doc.name}</span>
                <span className="flex min-w-[68px] shrink-0 items-center justify-end pr-1.5">
                    {signed ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-ios-blue/15 px-3 py-[5px] text-[14px] font-medium text-ios-blue">
                            <BadgeCheck className="h-[16px] w-[16px]" strokeWidth={2.2} />
                            {t('documents.signed', 'Signed')}
                        </span>
                    ) : doc.locked ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-black/[0.07] px-3 py-[5px] text-[14px] font-medium text-ios-gray dark:bg-white/[0.1]">
                            <Lock className="h-[15px] w-[15px]" strokeWidth={2.4} />
                            {t('documents.readOnly', 'Read Only')}
                        </span>
                    ) : null}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4">
                {readOnly ? (
                    <RichBody content={body} />
                ) : (
                    <div
                        className="mt-4 flex min-h-[320px] flex-col gap-3 pb-4"
                        onMouseDown={e => {
                            if (e.target !== e.currentTarget) return;
                            e.preventDefault();
                            const last = blocks[blocks.length - 1];
                            const el = last ? taRefs.current.get(last.id) : undefined;
                            if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); }
                        }}
                    >
                        {blocks.map((b, i) => b.kind === 'image' ? (
                            <EditImage key={b.id} url={b.url} onRemove={() => removeImage(b.id)} />
                        ) : (
                            <TextBlockArea
                                key={b.id}
                                value={b.value}
                                placeholder={blocks.length === 1 && i === 0 ? t('documents.startWriting', 'Start writing…') : undefined}
                                maxLength={b.value.length + Math.max(0, MAX_TEXT_LENGTH - body.length)}
                                taRef={el => { if (el) taRefs.current.set(b.id, el); else taRefs.current.delete(b.id); }}
                                onValue={v => setTextBlock(b.id, v)}
                                onCaret={pos => { caretRef.current = { index: i, pos }; }}
                            />
                        ))}
                    </div>
                )}

                {(doc.signatures?.length ?? 0) > 0 && (
                    <div className="mb-4 mt-2 flex flex-col gap-2.5">
                        {doc.signatures!.map(sig => <SignatureBlock key={sig.id} sig={sig} />)}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 items-center justify-between px-4 pb-12 pt-2">
                <span className="text-[14px] text-ios-gray tabular-nums">
                    {t('documents.charCount', '{n} of {max} characters', { n: body.length, max: MAX_TEXT_LENGTH })}
                </span>
                <div className="flex items-center gap-5">
                    {!readOnly && (
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            aria-label={t('documents.addImage', 'Add image')}
                            className="flex items-center text-ios-blue active:opacity-60"
                        >
                            <ImageIcon className="h-[21px] w-[21px]" strokeWidth={2.1} />
                        </button>
                    )}
                    {!signed && doc.signable !== false && (
                        <button
                            type="button"
                            onClick={() => setSignOpen(true)}
                            className="flex items-center gap-1.5 text-[17px] font-semibold text-ios-blue active:opacity-60"
                        >
                            <PenLine className="h-[18px] w-[18px]" strokeWidth={2.3} />
                            {t('documents.sign', 'Sign')}
                        </button>
                    )}
                </div>
            </div>

            {signOpen && (
                <SignSheet
                    docId={doc.id}
                    docName={doc.name}
                    onClose={() => setSignOpen(false)}
                    onSigned={updated => {
                        setSignOpen(false);
                        onSigned?.(updated);
                    }}
                />
            )}

            {picking && (
                <MediaPickerSheet
                    onSelect={photo => insertImage(photo.url)}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}


// ---- Block editing model -------------------------------------------------------------------
// Same storage format as script-issued documents: a line that is exactly one http(s) URL is an
// image. The editor holds an alternating list (text run, image, text run, ...) so images render
// inline while editing; serializing joins the pieces back into the canonical string.

const URL_LINE = /^https?:\/\/\S+$/;

let editBlockSeq = 0;
const nextBlockId = () => ++editBlockSeq;

type EditBlock =
    | { id: number; kind: 'text'; value: string }
    | { id: number; kind: 'image'; url: string };

function parseEditBlocks(content: string): EditBlock[] {
    const list: EditBlock[] = [];
    let run: string[] = [];
    const flush = () => { list.push({ id: nextBlockId(), kind: 'text', value: run.join('\n') }); run = []; };
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (URL_LINE.test(trimmed)) { flush(); list.push({ id: nextBlockId(), kind: 'image', url: trimmed }); }
        else run.push(line);
    }
    flush();
    return normalizeBlocks(list);
}

// Merges adjacent text runs and guarantees a text block at both ends and between images, so
// there is always somewhere to type around every picture.
function normalizeBlocks(list: EditBlock[]): EditBlock[] {
    const out: EditBlock[] = [];
    for (const b of list) {
        const last = out[out.length - 1];
        if (b.kind === 'text') {
            if (last && last.kind === 'text') {
                const merged = last.value === '' ? b.value : b.value === '' ? last.value : `${last.value}\n${b.value}`;
                out[out.length - 1] = { ...last, value: merged };
            } else {
                out.push(b);
            }
        } else {
            if (!last || last.kind === 'image') out.push({ id: nextBlockId(), kind: 'text', value: '' });
            out.push(b);
        }
    }
    if (out.length === 0 || out[out.length - 1].kind === 'image') out.push({ id: nextBlockId(), kind: 'text', value: '' });
    return out;
}

function serializeBlocks(blocks: EditBlock[]): string {
    const parts: string[] = [];
    for (const b of blocks) {
        if (b.kind === 'image') parts.push(b.url);
        else if (b.value !== '') parts.push(b.value);
    }
    return parts.join('\n');
}

function TextBlockArea({ value, placeholder, maxLength, taRef, onValue, onCaret }: {
    value:       string;
    placeholder?: string;
    maxLength:   number;
    taRef:       (el: HTMLTextAreaElement | null) => void;
    onValue:     (v: string) => void;
    onCaret:     (pos: number) => void;
}) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [value]);
    const report = (el: HTMLTextAreaElement) => onCaret(el.selectionStart ?? el.value.length);
    return (
        <textarea
            ref={el => { innerRef.current = el; taRef(el); }}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={1}
            onChange={e => { onValue(e.target.value); report(e.target); }}
            onSelect={e => report(e.currentTarget)}
            onFocus={e => report(e.currentTarget)}
            className="w-full resize-none overflow-hidden bg-transparent text-[17px] leading-snug outline-none placeholder:text-ios-gray"
            aria-label={t('documents.documentBody', 'Document body')}
        />
    );
}

function EditImage({ url, onRemove }: { url: string; onRemove: () => void }) {
    const [failed, setFailed] = useState(false);
    return (
        <div className="relative">
            {failed ? (
                <p className="break-all pr-10 text-[15px] text-ios-blue">{url}</p>
            ) : (
                <img
                    src={url}
                    alt=""
                    draggable={false}
                    onError={() => setFailed(true)}
                    className="max-h-[340px] w-full rounded-[12px] object-cover"
                    style={{ border: '0.5px solid rgba(0,0,0,0.12)' }}
                />
            )}
            <button
                type="button"
                onClick={onRemove}
                aria-label={t('documents.removeImage', 'Remove image')}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 active:opacity-70"
            >
                <X className="h-[16px] w-[16px] text-white" strokeWidth={2.6} />
            </button>
        </div>
    );
}


type RichBlock = { kind: 'text' | 'image'; value: string };

// A line that is exactly one http(s) URL becomes an inline image in the read view; everything
// else stays running text. Script-issued documents (citations, dossiers, contracts) use this
// to mix paragraphs and pictures in a single document.
function parseBlocks(content: string): RichBlock[] {
    const blocks: RichBlock[] = [];
    let run: string[] = [];
    const flush = () => {
        const text = run.join('\n');
        if (text.trim() !== '') blocks.push({ kind: 'text', value: text });
        run = [];
    };
    for (const line of content.split('\n')) {
        if (/^https?:\/\/\S+$/.test(line.trim())) {
            flush();
            blocks.push({ kind: 'image', value: line.trim() });
        } else {
            run.push(line);
        }
    }
    flush();
    return blocks;
}

export function RichBody({ content }: { content: string }) {
    const blocks = useMemo(() => parseBlocks(content), [content]);
    return (
        <div className="mb-2 mt-4 flex flex-col gap-3">
            {blocks.map((b, i) => (
                b.kind === 'image'
                    ? <RichImage key={i} url={b.value} />
                    : <p key={i} className="whitespace-pre-wrap text-[17px] leading-snug">{b.value}</p>
            ))}
        </div>
    );
}

function RichImage({ url }: { url: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return <p className="break-all text-[15px] text-ios-blue">{url}</p>;
    }
    return (
        <img
            src={url}
            alt=""
            draggable={false}
            onError={() => setFailed(true)}
            className="max-h-[340px] w-full rounded-[12px] object-cover"
            style={{ border: '0.5px solid rgba(0,0,0,0.12)' }}
        />
    );
}


export function SignatureBlock({ sig }: { sig: Omit<DocSignature, 'id'> }) {
    return (
        <div className="rounded-[12px] border border-black/[0.08] bg-white px-4 py-3 shadow-sm dark:border-white/[0.1]">
            {sig.image ? (
                <img src={sig.image} alt="" className="h-[64px] max-w-full object-contain" draggable={false} />
            ) : (
                <span className="block py-2 font-serif text-[26px] italic leading-none text-[#1d1d1f]">
                    {sig.signer}
                </span>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-black/[0.06] pt-2">
                <span className="text-[13px] font-semibold text-black">{sig.signer}</span>
                <span className="flex items-center gap-1 text-[12px] text-ios-blue">
                    <BadgeCheck className="h-[13px] w-[13px]" strokeWidth={2.2} />
                    {t('documents.signedOn', 'Signed {date}', { date: formatDocDate(sig.signedAt) })}
                </span>
            </div>
        </div>
    );
}


type SignMode = 'saved' | 'draw' | 'type';

// The sheet is bottom-anchored, so animating this wrapper's height makes mode switches grow
// and shrink upward smoothly instead of snapping. Content height is tracked live (fonts and
// the saved-signature image settle async), driven by CSS - no rAF (starved in CEF in-game).
function AnimatedHeight({ children }: { children: React.ReactNode }) {
    const innerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        const measure = () => setHeight(el.offsetHeight);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <div
            className="overflow-hidden"
            style={{ height: height ?? undefined, transition: 'height 0.32s cubic-bezier(0.32, 0.72, 0, 1)' }}
        >
            <div ref={innerRef}>{children}</div>
        </div>
    );
}

function SignSheet({ docId, docName, onClose, onSigned }: {
    docId:    string;
    docName:  string;
    onClose:  () => void;
    onSigned: (doc: DocFile) => void;
}) {
    const padRef = useRef<SignaturePadHandle>(null);
    const { myName, load } = useContacts('myName', 'load');
    const [saved,   setSaved]   = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [mode,    setMode]    = useState<SignMode>('draw');
    const [hasInk,  setHasInk]  = useState(false);
    const [typed,   setTyped]   = useState('');
    const [styleId, setStyleId] = useState(SIGNATURE_STYLES[0].id);
    const [busy,    setBusy]    = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        let alive = true;
        void apiGetSignature().then(image => {
            if (!alive) return;
            setSaved(image);
            setMode(image ? 'saved' : 'draw');
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    // The typed name defaults to the character once contacts resolve; a name the player
    // already typed is never overwritten.
    useEffect(() => {
        if (myName) setTyped(prev => (prev === '' ? myName : prev));
    }, [myName]);

    const typedOk = typed.trim().length >= 2;
    const canSign = !loading && !busy
        && (mode === 'saved' || (mode === 'draw' && hasInk) || (mode === 'type' && typedOk));

    async function sign() {
        if (!canSign) return;
        setBusy(true);
        setError(null);
        if (mode !== 'saved') {
            const image = mode === 'draw'
                ? padRef.current?.toImage()
                : await renderTypedSignature(typed, SIGNATURE_STYLES.find(s => s.id === styleId) ?? SIGNATURE_STYLES[0]);
            if (!image) { setBusy(false); return; }
            const stored = await apiSetSignature(image);
            if (!stored) {
                setError(t('documents.signatureSaveFailed', 'Your signature could not be saved.'));
                setBusy(false);
                return;
            }
        }
        const updated = await apiSignDoc(docId);
        if (!updated) {
            setError(t('documents.signFailed', 'The document could not be signed.'));
            setBusy(false);
            return;
        }
        onSigned(updated);
    }

    function switchMode(next: SignMode) {
        setMode(next);
        setHasInk(false);
        setError(null);
    }

    return (
        <Sheet onClose={onClose} fit="content" title={t('documents.signDocument', 'Sign Document')} className="bg-[#ececec] dark:bg-surface">
            {() => (
                <div className="flex flex-col gap-3 px-5 pb-8 pt-1">
                    {mode !== 'saved' && !loading && (
                        <div className="flex rounded-[10px] bg-black/[0.06] p-[3px] dark:bg-white/[0.08]">
                            <ModeTab label={t('documents.signModeDraw', 'Draw')} active={mode === 'draw'} onPress={() => switchMode('draw')} />
                            <ModeTab label={t('documents.signModeType', 'Type')} active={mode === 'type'} onPress={() => switchMode('type')} />
                        </div>
                    )}

                    <AnimatedHeight>
                        <div className="flex flex-col gap-3">
                            {loading ? (
                                <div className="h-[150px]" />
                            ) : mode === 'saved' ? (
                                <div className="flex items-center justify-center rounded-[12px] border border-black/10 bg-white px-4 py-5">
                                    <img src={saved ?? undefined} alt="" className="h-[84px] max-w-full object-contain" draggable={false} />
                                </div>
                            ) : mode === 'draw' ? (
                                <SignaturePad ref={padRef} onInkChange={setHasInk} />
                            ) : (
                                <>
                                    <input
                                        value={typed}
                                        onChange={e => setTyped(e.target.value)}
                                        maxLength={40}
                                        placeholder={t('documents.typeYourName', 'Type your name')}
                                        className="rounded-[12px] border border-black/10 bg-white px-4 py-3 text-[17px] text-black outline-none placeholder:text-ios-gray3 focus:border-ios-blue"
                                    />
                                    <div className="flex flex-col gap-2">
                                        {SIGNATURE_STYLES.map(s => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setStyleId(s.id)}
                                                className={`flex h-[58px] items-center justify-between rounded-[12px] border bg-white px-4 text-left ${
                                                    styleId === s.id ? 'border-ios-blue ring-1 ring-ios-blue' : 'border-black/10'
                                                }`}
                                            >
                                                <span
                                                    className="min-w-0 flex-1 truncate text-[#1d1d1f]"
                                                    style={{
                                                        fontFamily: s.fontFamily,
                                                        fontWeight: s.fontWeight,
                                                        fontStyle:  s.fontStyle,
                                                        fontSize:   Math.round(s.fontSize * 0.55),
                                                        lineHeight: 1.5,
                                                    }}
                                                >
                                                    {typed.trim() || t('documents.typeYourName', 'Type your name')}
                                                </span>
                                                <span className="ml-3 shrink-0 text-[12px] text-ios-gray">{s.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </AnimatedHeight>

                    <p className="text-center text-[13px] leading-snug text-ios-gray">
                        {t('documents.signLockHint', 'Signing adds your name and locks this document from further edits.')}
                    </p>

                    {error && <p className="text-center text-[13px] text-ios-red">{error}</p>}

                    <button
                        type="button"
                        disabled={!canSign}
                        onClick={() => setConfirming(true)}
                        className="rounded-[12px] bg-ios-blue py-3 text-[16px] font-semibold text-white active:opacity-80 disabled:opacity-40"
                    >
                        {t('documents.signDocument', 'Sign Document')}
                    </button>

                    {confirming && (
                        <AlertDialog
                            title={t('documents.confirmSignTitle', 'Sign Document?')}
                            message={t('documents.confirmSignBody', 'You are about to sign "{name}". This locks the document from further edits and cannot be undone.', { name: docName })}
                            confirmLabel={t('documents.sign', 'Sign')}
                            onCancel={() => setConfirming(false)}
                            onConfirm={() => { setConfirming(false); void sign(); }}
                        />
                    )}

                    {mode === 'saved' ? (
                        <button
                            type="button"
                            onClick={() => switchMode('draw')}
                            className="text-[15px] text-ios-blue active:opacity-60"
                        >
                            {t('documents.redrawSignature', 'Replace Signature')}
                        </button>
                    ) : (
                        <div className="flex items-center justify-center gap-6">
                            {mode === 'draw' && (
                                <button
                                    type="button"
                                    onClick={() => { padRef.current?.clear(); }}
                                    className="text-[15px] text-ios-blue active:opacity-60"
                                >
                                    {t('documents.clearSignature', 'Clear')}
                                </button>
                            )}
                            {saved && (
                                <button
                                    type="button"
                                    onClick={() => switchMode('saved')}
                                    className="text-[15px] text-ios-blue active:opacity-60"
                                >
                                    {t('documents.useSavedSignature', 'Use Saved Signature')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Sheet>
    );
}

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <button
            type="button"
            onClick={onPress}
            className={`flex-1 rounded-[8px] py-1.5 text-[14px] font-semibold transition-colors ${
                active ? 'bg-white text-black shadow-sm dark:bg-elevated dark:text-white' : 'text-ios-gray'
            }`}
        >
            {label}
        </button>
    );
}
