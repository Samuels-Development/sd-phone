import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronLeft, Lock, PenLine } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import { apiGetSignature, apiSetSignature, apiSignDoc } from './documentsApi';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
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
                <textarea
                    value={body}
                    readOnly={readOnly}
                    maxLength={MAX_TEXT_LENGTH}
                    onChange={e => setBody(e.target.value)}
                    placeholder={t('documents.startWriting', 'Start writing…')}
                    className="mt-4 w-full resize-none bg-transparent text-[17px] leading-snug outline-none placeholder:text-ios-gray"
                    style={{ minHeight: signed ? 180 : 320 }}
                    aria-label={t('documents.documentBody', 'Document body')}
                />

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
                {!signed && (
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


function SignSheet({ docId, onClose, onSigned }: {
    docId:    string;
    onClose:  () => void;
    onSigned: (doc: DocFile) => void;
}) {
    const padRef = useRef<SignaturePadHandle>(null);
    const [saved,   setSaved]   = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [drawing, setDrawing] = useState(false);
    const [hasInk,  setHasInk]  = useState(false);
    const [busy,    setBusy]    = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void apiGetSignature().then(image => {
            if (!alive) return;
            setSaved(image);
            setDrawing(!image);
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    async function sign() {
        if (busy) return;
        setBusy(true);
        setError(null);
        if (drawing) {
            const image = padRef.current?.toImage();
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

    return (
        <Sheet onClose={onClose} fit="content" title={t('documents.signDocument', 'Sign Document')} className="bg-[#ececec] dark:bg-surface">
            {() => (
                <div className="flex flex-col gap-3 px-5 pb-8 pt-1">
                    {loading ? (
                        <div className="h-[150px]" />
                    ) : drawing ? (
                        <SignaturePad ref={padRef} onInkChange={setHasInk} />
                    ) : (
                        <div className="flex items-center justify-center rounded-[12px] border border-black/10 bg-white px-4 py-5">
                            <img src={saved ?? undefined} alt="" className="h-[84px] max-w-full object-contain" draggable={false} />
                        </div>
                    )}

                    <p className="text-center text-[13px] leading-snug text-ios-gray">
                        {t('documents.signLockHint', 'Signing adds your name and locks this document from further edits.')}
                    </p>

                    {error && <p className="text-center text-[13px] text-ios-red">{error}</p>}

                    <button
                        type="button"
                        disabled={busy || loading || (drawing && !hasInk)}
                        onClick={() => void sign()}
                        className="rounded-[12px] bg-ios-blue py-3 text-[16px] font-semibold text-white active:opacity-80 disabled:opacity-40"
                    >
                        {t('documents.signDocument', 'Sign Document')}
                    </button>

                    {drawing ? (
                        <div className="flex items-center justify-center gap-6">
                            <button
                                type="button"
                                onClick={() => { padRef.current?.clear(); }}
                                className="text-[15px] text-ios-blue active:opacity-60"
                            >
                                {t('documents.clearSignature', 'Clear')}
                            </button>
                            {saved && (
                                <button
                                    type="button"
                                    onClick={() => { setDrawing(false); setHasInk(false); }}
                                    className="text-[15px] text-ios-blue active:opacity-60"
                                >
                                    {t('documents.useSavedSignature', 'Use Saved Signature')}
                                </button>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setDrawing(true)}
                            className="text-[15px] text-ios-blue active:opacity-60"
                        >
                            {t('documents.redrawSignature', 'Redraw Signature')}
                        </button>
                    )}
                </div>
            )}
        </Sheet>
    );
}
