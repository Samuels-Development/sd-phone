import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';

export interface ComposerHandle {
    append: (text: string) => void;
}

const TYPING_IDLE_MS = 3000;
const TYPING_HEARTBEAT_MS = 2500;

export const Composer = forwardRef<ComposerHandle, {
    convId:         string;
    inputRef:       RefObject<HTMLInputElement | null>;
    hasAttachments: boolean;
    borderColor:    string;
    onFocus:        () => void;
    onSendText:     (text: string) => void;
    onTyping?:      (on: boolean) => void;
}>(function Composer({ convId, inputRef, hasAttachments, borderColor, onFocus, onSendText, onTyping }, ref) {
    const [draft, setDraft] = useSessionState(`messages:draft:${convId}`, '');

    const lastOnRef = useRef(0);
    const idleRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notifyRef = useRef(onTyping);
    const activeRef = useRef<((on: boolean) => void) | null>(null);
    notifyRef.current = onTyping;

    useImperativeHandle(ref, () => ({ append: s => setDraft(d => d + s) }), [setDraft]);

    const stopTyping = useCallback(() => {
        if (idleRef.current) { clearTimeout(idleRef.current); idleRef.current = null; }
        const notify = activeRef.current;
        if (!notify) return;
        activeRef.current = null;
        notify(false);
    }, []);

    const pingTyping = useCallback(() => {
        const notify = notifyRef.current;
        if (!notify) return;
        const now = Date.now();
        if (!activeRef.current || now - lastOnRef.current >= TYPING_HEARTBEAT_MS) {
            activeRef.current = notify;
            lastOnRef.current = now;
            notify(true);
        }
        if (idleRef.current) clearTimeout(idleRef.current);
        idleRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    }, [stopTyping]);

    useEffect(() => stopTyping, [convId, stopTyping]);

    const canSend = !!draft.trim() || hasAttachments;

    function submit() {
        if (!canSend) return;
        stopTyping();
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
                    onChange={e => { setDraft(e.target.value); pingTyping(); }}
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
