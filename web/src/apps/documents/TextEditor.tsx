import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, ChevronLeft, Lock, PenLine } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { useContacts } from '@/stores/contactsStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
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

    const [body, setBody] = useState(doc.content ?? '');
    const signed   = doc.signed === true;
    const readOnly = doc.locked || signed;
    const [signOpen, setSignOpen] = useState(false);

    const lastSaved = useRef(doc.content ?? '');
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;

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
            className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-base text-black dark:text-white"
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
                <span className="flex w-[68px] shrink-0 items-center justify-end pr-1.5">
                    {signed ? (
                        <span className="flex items-center gap-1 text-[13px] text-ios-blue">
                            <BadgeCheck className="h-[15px] w-[15px]" strokeWidth={2.2} />
                            {t('documents.signed', 'Signed')}
                        </span>
                    ) : doc.locked ? (
                        <span className="flex items-center gap-1 text-[13px] text-ios-gray">
                            <Lock className="h-[14px] w-[14px]" strokeWidth={2.4} />
                            {t('documents.readOnly', 'Read Only')}
                        </span>
                    ) : null}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4">
                {readOnly ? (
                    <RichBody content={body} />
                ) : (
                    <textarea
                        value={body}
                        maxLength={MAX_TEXT_LENGTH}
                        onChange={e => setBody(e.target.value)}
                        placeholder={t('documents.startWriting', 'Start writing…')}
                        className="mt-4 w-full resize-none bg-transparent text-[17px] leading-snug outline-none placeholder:text-ios-gray"
                        style={{ minHeight: 320 }}
                        aria-label={t('documents.documentBody', 'Document body')}
                    />
                )}

                {(doc.signatures?.length ?? 0) > 0 && (
                    <div className="mb-4 mt-2 flex flex-col gap-2.5">
                        {doc.signatures!.map(sig => <SignatureBlock key={sig.id} sig={sig} />)}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 items-center justify-between px-4 pb-12 pt-2">
                <span className="text-[13px] text-ios-gray tabular-nums">
                    {t('documents.charCount', '{n} of {max} characters', { n: body.length, max: MAX_TEXT_LENGTH })}
                </span>
                {!signed && doc.signable !== false && (
                    <button
                        type="button"
                        onClick={() => setSignOpen(true)}
                        className="flex items-center gap-1.5 text-[15px] font-semibold text-ios-blue active:opacity-60"
                    >
                        <PenLine className="h-[16px] w-[16px]" strokeWidth={2.3} />
                        {t('documents.sign', 'Sign')}
                    </button>
                )}
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

function RichBody({ content }: { content: string }) {
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


function SignatureBlock({ sig }: { sig: DocSignature }) {
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
