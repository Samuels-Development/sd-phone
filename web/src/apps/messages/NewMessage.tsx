import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';

import { ContactAvatar } from '@/shared/ContactAvatar';
import { clearSessionState, useSessionState } from '@/hooks/useSessionState';
import { contactFromNumber } from '@/shared/chat/messagesApi';
import { useMaskedPhone } from '@/stores/themeStore';
import type { Contact } from '@/shared/chat/data';
import { t } from '@/i18n';

interface NewMessageProps {
    contacts: Contact[];
    myNumber: string;
    onCancel: () => void;
    onSend:   (recipients: Contact[], body: string) => void;
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

export function NewMessage({ contacts, myNumber, onCancel, onSend }: NewMessageProps) {
    const [query,    setQuery]    = useSessionState('messages:newQuery', '');
    const [selected, setSelected] = useSessionState<Contact[]>('messages:newRecipients', []);
    const [body,     setBody]     = useSessionState('messages:newBody', '');
    const [exiting,  setExiting]  = useState(false);
    const toRef = useRef<HTMLInputElement>(null);
    const phone = useMaskedPhone();

    const selectedIds = useMemo(() => new Set(selected.map(c => c.id)), [selected]);

    useEffect(() => { toRef.current?.focus({ preventScroll: true }); }, []);

    function close() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onCancel, 320);
    }

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const qDigits = digitsOf(q);
        return contacts.filter(c => {
            if (selectedIds.has(c.id)) return false;
            if (myNumber && digitsOf(c.phone ?? '') === digitsOf(myNumber)) return false;
            if (c.name.toLowerCase().includes(q)) return true;
            return qDigits.length > 0 && digitsOf(c.phone ?? '').includes(qDigits);
        });
    }, [contacts, query, selectedIds, myNumber]);

    const rawNumber = digitsOf(query);
    const showRaw = rawNumber.length >= 3 && !contacts.some(c => digitsOf(c.phone ?? '') === rawNumber);

    function addRecipient(c: Contact) {
        setSelected(prev => (prev.some(x => x.id === c.id) ? prev : [...prev, c]));
        setQuery('');
        toRef.current?.focus();
    }

    function removeRecipient(id: string) {
        setSelected(prev => prev.filter(c => c.id !== id));
    }

    function send() {
        const text = body.trim();
        if (selected.length === 0 || !text) return;
        clearSessionState('messages:new');
        onSend(selected, text);
    }

    const hasRecipients   = selected.length > 0;
    const showSuggestions = query.trim().length > 0;

    return (
        <div
            className="font-sf absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[16px] bg-elevated text-black dark:bg-base dark:text-white"
            style={{
                top: 'calc(var(--safe-top) + 6px)',
                animation: exiting
                    ? 'ios-sheet-down 0.32s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.44s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
        >
            <button
                type="button"
                onClick={close}
                aria-label={t('common.close', 'Close')}
                className="mx-auto flex h-7 w-full shrink-0 items-start justify-center pt-2 active:opacity-60"
            >
                <span className="h-[5px] w-9 rounded-full bg-black/25 dark:bg-white/30" />
            </button>

            <div className="shrink-0 px-4 pb-2 pt-1 text-center">
                <span className="text-[19px] font-semibold">{t('messages.newMessage', 'New Message')}</span>
            </div>
            <div className="h-[0.5px] bg-hairline/10" />

            <div className="shrink-0 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[18px] font-medium text-black/60 dark:text-white/60">{t('messages.toLabel', 'To:')}</span>
                    {selected.map(c => (
                        <span
                            key={c.id}
                            className="flex items-center gap-1 rounded-full bg-ios-blue/15 px-2.5 py-[4px] text-[16px] text-ios-blue"
                        >
                            {c.name}
                            <button type="button" onClick={() => removeRecipient(c.id)} className="active:opacity-60">
                                <X className="h-[13px] w-[13px]" strokeWidth={2.5} />
                            </button>
                        </span>
                    ))}
                    <input
                        ref={toRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && showRaw) addRecipient(contactFromNumber(rawNumber)); }}
                        placeholder={hasRecipients ? t('messages.addAnother', 'Add another') : t('messages.typeANameOrNumber', 'Type a name or number')}
                        className="min-w-[140px] flex-1 bg-transparent py-[4px] text-[18px] outline-none placeholder-black/35 dark:placeholder-white/35"
                    />
                </div>
            </div>
            <div className="h-[0.5px] bg-hairline/10" />

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2 pt-2">
                {showSuggestions && (
                    <>
                        {showRaw && (
                            <button
                                type="button"
                                onClick={() => addRecipient(contactFromNumber(rawNumber))}
                                className="flex w-full items-center gap-3.5 rounded-[12px] px-2.5 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <ContactAvatar contact={contactFromNumber(rawNumber)} size={56} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[23px]">{phone(rawNumber)}</div>
                                    <div className="text-[18px] font-medium text-black/60 dark:text-white/60">{t('messages.sendToThisNumber', 'Send to this number')}</div>
                                </div>
                            </button>
                        )}
                        {results.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => addRecipient(c)}
                                className="flex w-full items-center gap-3.5 rounded-[12px] px-2.5 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <ContactAvatar contact={c} size={56} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[23px]">{c.name}</div>
                                    {c.phone && <div className="text-[18px] font-medium text-black/60 dark:text-white/60">{phone(c.phone)}</div>}
                                </div>
                            </button>
                        ))}
                        {!showRaw && results.length === 0 && (
                            <p className="px-3 py-8 text-center text-[14px] text-black/35 dark:text-white/35">{t('messages.noMatches', 'No matches')}</p>
                        )}
                    </>
                )}
            </div>

            {hasRecipients && (
                <div
                    className="shrink-0 border-t border-black/10 px-3 pb-9 pt-2 dark:border-white/10"
                    style={{ animation: 'ios-sheet-up 0.3s cubic-bezier(0.32,0.72,0,1)' }}
                >
                    <div className={`flex items-center gap-1 rounded-[22px] bg-base py-[9px] pl-4 dark:bg-surface ${body.trim() ? 'pr-[5px]' : 'pr-4'}`}>
                        <input
                            type="text"
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder={t('messages.textMessagePlaceholder', 'Text Message')}
                            className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] outline-none placeholder-black/35 dark:placeholder-white/35"
                        />
                        {body.trim() && (
                            <button
                                type="button"
                                onClick={send}
                                className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-ios-blue active:opacity-70"
                            >
                                <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
