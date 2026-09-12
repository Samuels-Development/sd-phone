import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { copyToClipboard } from '@/lib/clipboard';
import { digits } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { useContacts } from '@/stores/contactsStore';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useIosPush } from '@/hooks/useIosPush';
import { blockedListApi, setBlockedApi } from '@/apps/phone/contactsApi';
import { AlertDialog } from '@/ui/AlertDialog';
import { ListGroup, ToggleRow } from '@/ui/ListGroup';
import { PromptDialog } from '@/ui/PromptDialog';
import { useMaskedPhone, useStreamerHidden, useTheme } from '@/stores/themeStore';
import { HIDDEN_TEXT } from '@/shell/streamerMode';
import { SubPage } from '../SettingsSubPage';


export function PhoneSettingsPage({ onBack }: { onBack: () => void }) {
    const { myNumber, load } = useContacts('myNumber', 'load');
    useEffect(() => { void load(); }, [load]);
    const hideNumber = useStreamerHidden('number');
    const number = hideNumber ? HIDDEN_TEXT : (myNumber ? formatPhone(myNumber) : '—');
    const { callerId, setCallerId } = useTheme('callerId', 'setCallerId');
    const [copied,       setCopied]       = useState(false);
    const [showBlocked,  setShowBlocked]  = useState(false);

    function copyNumber() {
        copyToClipboard(number);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    return (
        <SubPage
            title={t('settings.phone', 'Phone')}
            backLabel={t('settings.settings', 'Settings')}
            onBack={onBack}
            sub={showBlocked ? <BlockedContactsPage onBack={() => setShowBlocked(false)} /> : null}
        >

            <ListGroup>
                <div className="flex items-center px-4 py-3">
                    <span className="flex-1 text-[17px] font-normal text-black dark:text-white">
                        {t('settings.myNumber', 'My Number')}
                    </span>
                    <span dir="ltr" className="me-2 text-[15px] text-ios-gray">{number}</span>
                    <button
                        type="button"
                        onClick={copyNumber}
                        className="active:opacity-50 transition-opacity"
                        aria-label={t('settings.copyNumber', 'Copy number')}
                    >
                        <Copy
                            className={`h-[18px] w-[18px] transition-colors ${copied ? 'text-ios-green' : 'text-ios-gray'}`}
                            strokeWidth={2}
                        />
                    </button>
                </div>
            </ListGroup>

            <ListGroup footer={callerId
                ? undefined
                : t('settings.callerIdOffFooter', 'People you call will see Unknown instead of your number, and cannot call you back from their recents.')}>
                <ToggleRow
                    label={t('settings.showCallerId', 'Show Caller ID')}
                    on={callerId}
                    onToggle={() => setCallerId(!callerId)}
                    divider
                />
                <button
                    type="button"
                    onClick={() => setShowBlocked(true)}
                    className="relative flex w-full items-center px-4 py-3 text-start active:bg-black/5 dark:active:bg-white/5"
                >
                    <span className="flex-1 text-[17px] font-normal text-black dark:text-white">
                        {t('settings.blockedContacts', 'Blocked Contacts')}
                    </span>
                    <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                </button>
            </ListGroup>

        </SubPage>
    );
}


function BlockedContactsPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { contacts } = useContacts('contacts');
    const phone = useMaskedPhone();
    const [adding, setAdding] = useState(false);
    const [unblocking, setUnblocking] = useState<string | null>(null);

    const { data, refetch } = useAsyncData(blockedListApi, []);
    const blocked = data ?? [];

    const nameByNumber = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of contacts) {
            const key = digits(c.phone ?? '');
            if (key) map.set(key, c.name);
        }
        return map;
    }, [contacts]);

    async function addNumber(value: string): Promise<string | null> {
        const d = digits(value);
        if (!d) return t('settings.blockNeedsNumber', 'Enter a phone number.');
        const done = await setBlockedApi(d, true);
        if (!done) return t('settings.blockFailed', 'Could not block that number.');
        setAdding(false);
        refetch();
        return null;
    }

    function labelFor(number: string): string {
        return nameByNumber.get(number) ?? phone(number);
    }

    function unblock(number: string) {
        setUnblocking(null);
        void setBlockedApi(number, false).then(() => refetch());
    }

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-base"
            style={pageStyle}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <div className="relative flex h-11 shrink-0 items-center px-2">
                <button
                    type="button"
                    onClick={goBack}
                    className="relative z-10 flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span>{t('settings.phone', 'Phone')}</span>
                </button>
                <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                    <span className="text-[17px] font-semibold text-black dark:text-white">
                        {t('settings.blockedContacts', 'Blocked Contacts')}
                    </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-[0.5px] bg-control" />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 px-4 pb-10">
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        {blocked.map((b, i) => (
                            <div
                                key={b.number}
                                className="relative flex items-center px-4 py-3"
                            >
                                <span dir="auto" className="min-w-0 flex-1 truncate text-[17px] font-normal text-black dark:text-white">
                                    {labelFor(b.number)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setUnblocking(b.number)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-ios-red/10 active:bg-ios-red/20"
                                >
                                    <Trash2 className="h-[14px] w-[14px] text-ios-red" strokeWidth={2} />
                                </button>
                                {i < blocked.length - 1 && (
                                    <div
                                        className="pointer-events-none absolute bottom-0 end-0 bg-ios-gray4 dark:bg-control"
                                        style={{ insetInlineStart: 0, height: '0.5px' }}
                                    />
                                )}
                            </div>
                        ))}

                        <button
                            type="button"
                            onClick={() => setAdding(true)}
                            className={`flex w-full items-center gap-2 px-4 py-3 active:bg-black/5 dark:active:bg-white/5 ${blocked.length > 0 ? 'border-t border-ios-gray4 dark:border-control' : ''}`}
                            style={blocked.length > 0 ? { borderTopWidth: '0.5px' } : undefined}
                        >
                            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ios-green">
                                <Plus className="h-[13px] w-[13px] text-white" strokeWidth={3} />
                            </div>
                            <span className="text-[17px] font-normal text-ios-blue">
                                {t('settings.addNew', 'Add New')}
                            </span>
                        </button>
                    </div>

                    <p className="px-4 text-center text-[14px] text-ios-gray">
                        {t('settings.blockedContactsFooter', "Blocked contacts can't call, message, or video call you.")}
                    </p>
                </div>
            </div>

            {adding && (
                <PromptDialog
                    title={t('settings.blockNumberTitle', 'Block a Number')}
                    label={t('settings.enterNumberToBlock', 'Enter a number to block')}
                    placeholder={t('settings.blockNumberPlaceholder', 'Phone number')}
                    inputMode="tel"
                    maxLength={20}
                    sanitize={v => v.replace(/[^\d\s()+-]/g, '')}
                    confirmLabel={t('settings.blockConfirm', 'Block')}
                    onCancel={() => setAdding(false)}
                    onConfirm={addNumber}
                />
            )}

            {unblocking !== null && (
                <AlertDialog
                    title={t('phone.unblockContact', 'Unblock Contact')}
                    message={t('phone.unblockMessage', '{name} will be able to call and message you again.', { name: labelFor(unblocking) })}
                    confirmLabel={t('phone.unblock', 'Unblock')}
                    onCancel={() => setUnblocking(null)}
                    onConfirm={() => unblock(unblocking)}
                />
            )}
        </div>
    );
}
