import { forwardRef, useImperativeHandle } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';

export interface ComposerHandle {
    append: (text: string) => void;
}

export const Composer = forwardRef<ComposerHandle, {
    convId:         string;
    inputRef:       RefObject<HTMLInputElement | null>;
    hasAttachments: boolean;
    borderColor:    string;
    onFocus:        () => void;
    onSendText:     (text: string) => void;
}>(function Composer({ convId, inputRef, hasAttachments, borderColor, onFocus, onSendText }, ref) {
    const [draft, setDraft] = useSessionState(`messages:draft:${convId}`, '');

    useImperativeHandle(ref, () => ({ append: s => setDraft(d => d + s) }), [setDraft]);

    const canSend = !!draft.trim() || hasAttachments;

    function submit() {
        if (!canSend) return;
        onSendText(draft.trim());
        setDraft('');
    }

    function handleKey(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    }

    return (
        <div className="px-3 pb-2 pt-1.5">
            <div
                className={`flex items-center gap-1 rounded-[22px] bg-base py-[9px] pl-4 dark:bg-surface ${canSend ? 'pr-[5px]' : 'pr-4'}`}
                style={{ boxShadow: `inset 0 0 0 var(--hairline-w, 1px) ${borderColor}` }}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKey}
                    onFocus={onFocus}
                    placeholder={t('messages.textMessagePlaceholder', 'Text Message')}
                    className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-black dark:text-white placeholder-black/35 dark:placeholder-white/35 outline-none"
                />
                {canSend && (
                    <button
                        type="button"
                        onClick={submit}
                        className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-ios-blue active:opacity-70"
                    >
                        <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                    </button>
                )}
            </div>
        </div>
    );
});
