import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { formatPhone } from '@/lib/phone';
import { useContacts } from '@/stores/contactsStore';
import { useIosPush } from '@/hooks/useIosPush';
import { ListGroup, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';


export function PhoneSettingsPage({ onBack }: { onBack: () => void }) {
    const { myNumber, load } = useContacts('myNumber', 'load');
    useEffect(() => { void load(); }, [load]);
    const number = myNumber ? formatPhone(myNumber) : '—';
    const [showCallerId] = useState(true);
    const [copied,       setCopied]       = useState(false);
    const [showBlocked,  setShowBlocked]  = useState(false);

    function copyNumber() {
        navigator.clipboard?.writeText(number).catch(() => {});
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
                    <span className="mr-2 text-[15px] text-ios-gray">{number}</span>
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

            <ListGroup>
                <ToggleRow
                    label={t('settings.showCallerId', 'Show Caller ID')}
                    defaultOn={showCallerId}
                    divider
                />
                <button
                    type="button"
                    onClick={() => setShowBlocked(true)}
                    className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
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


interface Blocked { id: string; name: string; number: string }

const INITIAL_BLOCKED: Blocked[] = [];

function BlockedContactsPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [blocked, setBlocked] = useState<Blocked[]>(INITIAL_BLOCKED);

    function addNumber() {
        const raw = window.prompt(t('settings.enterNumberToBlock', 'Enter number or name to block:'));
        if (raw?.trim()) {
            setBlocked(prev => [
                ...prev,
                { id: `b${Date.now()}`, name: raw.trim(), number: '' },
            ]);
        }
    }

    function remove(id: string) {
        setBlocked(prev => prev.filter(b => b.id !== id));
    }

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base"
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
                <div className="absolute inset-x-0 bottom-0 h-[0.5px] bg-[#C6C6C8] dark:bg-control" />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 px-4 pb-10">
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        {blocked.map((b, i) => (
                            <div
                                key={b.id}
                                className="relative flex items-center px-4 py-3"
                            >
                                <span className="flex-1 text-[17px] font-normal text-black dark:text-white">
                                    {b.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => remove(b.id)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-ios-red/10 active:bg-ios-red/20"
                                >
                                    <Trash2 className="h-[14px] w-[14px] text-ios-red" strokeWidth={2} />
                                </button>
                                {i < blocked.length - 1 && (
                                    <div
                                        className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control"
                                        style={{ left: 0, height: '0.5px' }}
                                    />
                                )}
                            </div>
                        ))}

                        <button
                            type="button"
                            onClick={addNumber}
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

                    {blocked.length === 0 && (
                        <p className="text-center text-[14px] text-ios-gray px-4">
                            {t('settings.blockedContactsFooter', "Blocked contacts can't call, message, or FaceTime you.")}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
