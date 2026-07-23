import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Smartphone } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { t } from '@/i18n';
import { colorFor, digits } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { Sheet } from '@/ui/Sheet';
import { InitialsAvatar, PlaceholderAvatar } from '@/shared/ContactAvatar';
import { useContacts } from '@/stores/contactsStore';


export interface ShareTarget { id: number; name: string; number?: string }
type SendState = 'sending' | 'sent' | 'failed';

async function fetchNearby(): Promise<ShareTarget[]> {
    if (!isFiveM) return [{ id: 1, name: 'Marcus', number: '2135550148' }, { id: 2, name: 'Tommy V', number: '5550190244' }, { id: 3, name: 'Mike' }];
    return (await apiData<{ targets: ShareTarget[] }>('sd-phone:share:nearby'))?.targets ?? [];
}

export function ShareSheet({ onClose, onShare, children, top = '55%' }: {
    onClose:  () => void;
    onShare:  (target: ShareTarget) => Promise<boolean> | boolean;
    children?: ReactNode;
    top?:      string;
}) {
    const [targets, setTargets] = useState<ShareTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [state,   setState]   = useState<Record<number, SendState>>({});
    const { contacts, load } = useContacts('contacts', 'load');

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        let alive = true;
        fetchNearby().then(t => { if (alive) { setTargets(t); setLoading(false); } }).catch(() => setLoading(false));
        return () => { alive = false; };
    }, []);

    async function send(t: ShareTarget) {
        if (state[t.id] === 'sending' || state[t.id] === 'sent') return;
        setState(s => ({ ...s, [t.id]: 'sending' }));
        const ok = await onShare(t);
        setState(s => ({ ...s, [t.id]: ok ? 'sent' : 'failed' }));
    }

    // A nearby phone presents as the receiver's SAVED CONTACT (name + picture) when their
    // number is in the sender's contacts; an unknown number shows as just the number, like a
    // real phone would - never the character name over their head.
    function resolve(target: ShareTarget) {
        const d = target.number ? digits(target.number) : '';
        const contact = d ? contacts.find(c => digits(c.phone) === d) : undefined;
        return {
            contact,
            label: contact?.name ?? (target.number ? formatPhone(target.number) : target.name),
        };
    }

    return (
        <Sheet onClose={onClose} top={top} durationMs={240} className="font-sf bg-[#d4d4d4] dark:bg-base">
            {() => (
                <>
                <div className="px-4 pt-5">
                    {loading ? (
                        <p className="py-8 text-center text-[15px] text-ios-gray">{t('common.lookingForNearby', 'Looking for people nearby…')}</p>
                    ) : targets.length === 0 ? (
                        <p className="py-8 text-center text-[15px] text-ios-gray">{t('common.noOneNearby', 'No one nearby with their phone out.')}</p>
                    ) : (
                        <div className="flex gap-6 overflow-x-auto no-scrollbar px-1 pb-1">
                            {targets.map(target => {
                                const st = state[target.id];
                                const { contact, label } = resolve(target);
                                return (
                                    <button key={target.id} type="button" onClick={() => void send(target)} className="flex w-[96px] shrink-0 flex-col items-center active:opacity-70">
                                        <span className="relative">
                                            {contact?.avatar ? (
                                                <img
                                                    src={contact.avatar}
                                                    alt=""
                                                    draggable={false}
                                                    className="h-[80px] w-[80px] rounded-full object-cover shadow-sm"
                                                />
                                            ) : contact ? (
                                                <InitialsAvatar name={contact.name} color={contact.color || colorFor(contact.name)} size={80} />
                                            ) : (
                                                <PlaceholderAvatar size={80} />
                                            )}
                                            <span className="absolute -bottom-0.5 -right-0.5 flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#e9e9e9] shadow-sm ring-2 ring-[#d4d4d4] dark:bg-elevated dark:ring-base">
                                                <Smartphone className="h-[15px] w-[15px] text-black/60 dark:text-white/70" />
                                            </span>
                                        </span>
                                        <span className="mt-2 w-full truncate text-center text-[14.5px] font-medium leading-tight text-black dark:text-white">{label}</span>
                                        <span className={`mt-0.5 text-[13px] ${st === 'failed' ? 'text-ios-red' : 'text-ios-blue'}`}>
                                            {st === 'sent' ? t('common.sent', 'Sent') : st === 'sending' ? t('common.sending', 'Sending…') : st === 'failed' ? t('common.failed', 'Failed') : ' '}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {children && (
                    <>
                        <div className="mx-4 mt-5 h-px bg-black/10 dark:bg-white/10" />
                        <div className="flex flex-col gap-2.5 px-4 pt-5">{children}</div>
                    </>
                )}
                </>
            )}
        </Sheet>
    );
}

export function ShareAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-[14px] bg-black/[0.05] px-5 py-5 text-left active:opacity-70 dark:bg-white/[0.06]">
            <span className="text-[18px] font-medium text-black dark:text-white">{label}</span>
            <span className="text-black/60 dark:text-white/70">{icon}</span>
        </button>
    );
}
