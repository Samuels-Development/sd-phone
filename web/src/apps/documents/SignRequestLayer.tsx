import { useState } from 'react';
import { PenLine } from 'lucide-react';

import { t } from '@/i18n';
import { respondSignRequestApi } from './documentsApi';
import { RichBody, SignatureBlock, SignSheet } from './TextEditor';
import type { DocFile } from './data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export interface SignRequestData {
    requestId: string;
    fromName:  string;
    doc:       DocFile;
}

// Full-screen prompt for an accepted AirShare signature request: the responder reads the
// requester's document (with every existing signature) and signs the requester's ORIGINAL via
// the shared SignSheet, or declines. Mounted phone-wide - a request can arrive with any app open.
export function SignRequestLayer({ request, onDone }: {
    request: SignRequestData;
    onDone:  () => void;
}) {
    const [signOpen, setSignOpen] = useState(false);
    const [leaving,  setLeaving]  = useState(false);
    const doc = request.doc;

    function dismiss(after?: () => void) {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(() => { after?.(); onDone(); }, 260);
    }

    function decline() {
        void respondSignRequestApi(request.requestId, false);
        dismiss();
    }

    return (
        <div
            className="absolute inset-0 z-[59] flex flex-col bg-[#d4d4d4] font-sf text-black"
            style={{ animation: leaving
                ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)' }}
        >
            <StatusBarSpacer />

            <div className="shrink-0 px-5 pb-2 pt-2 text-center">
                <div className="text-[15px] font-semibold text-ios-gray">
                    {t('documents.signRequestFrom', '{name} asks you to sign', { name: request.fromName })}
                </div>
                <div className="mt-0.5 truncate text-[20px] font-bold">{doc.name}</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5">
                <RichBody content={doc.content ?? ''} />
                {(doc.signatures?.length ?? 0) > 0 && (
                    <div className="mb-4 mt-2 flex flex-col gap-2.5">
                        {doc.signatures!.map(sig => <SignatureBlock key={sig.id} sig={sig} />)}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 gap-3 px-5 pb-10 pt-3">
                <button
                    type="button"
                    onClick={decline}
                    className="flex-1 rounded-full bg-black/10 py-3.5 text-[17px] font-semibold active:opacity-70"
                >
                    {t('common.decline', 'Decline')}
                </button>
                <button
                    type="button"
                    onClick={() => setSignOpen(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ios-blue py-3.5 text-[17px] font-semibold text-white active:opacity-80"
                >
                    <PenLine className="h-[18px] w-[18px]" strokeWidth={2.3} />
                    {t('documents.sign', 'Sign')}
                </button>
            </div>

            {signOpen && (
                <SignSheet
                    docId={doc.id}
                    docName={doc.name}
                    signAction={() => respondSignRequestApi(request.requestId, true)}
                    onClose={() => setSignOpen(false)}
                    onSigned={() => dismiss()}
                />
            )}
        </div>
    );
}
