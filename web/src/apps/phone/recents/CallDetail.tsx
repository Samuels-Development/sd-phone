import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, MessageSquare, Phone, Share, Video } from 'lucide-react';

import { PlaceholderAvatar } from '@/shared/ContactAvatar';
import { formatPhone, type CallEntry } from '../data';
import { t } from '@/i18n';

export function CallDetail({ entry, onBack, onAddToContacts }: {
    entry:           CallEntry;
    onBack:          () => void;
    onAddToContacts: () => void;
}) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const title = entry.noCallerId ? t('phone.noCallerId','No Caller ID') : formatPhone(entry.number);

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[#d4d4d4] dark:bg-base"
            style={{
                transform:  shown ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) onBack(); }}
        >
            <div className="flex items-center px-3 py-2">
                <button type="button" onClick={() => setShown(false)} className="flex items-center text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('phone.recents','Recents')}</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div className="flex flex-col items-center pb-5 pt-1">
                    <PlaceholderAvatar size={134} />
                    <div className="mt-3 text-center text-[30px] font-semibold text-black dark:text-white">{title}</div>
                </div>

                <div className="mb-7 flex gap-3">
                    <ActionButton label={t('phone.actionMessage','message')} icon={<MessageSquare className="h-[28px] w-[28px]" strokeWidth={2} fill="currentColor" />} />
                    <ActionButton label={t('phone.actionCall','call')}    icon={<Phone         className="h-[28px] w-[28px]" strokeWidth={2} fill="currentColor" />} />
                    <ActionButton label={t('phone.actionVideo','video')}   icon={<Video         className="h-[28px] w-[28px]" strokeWidth={2} fill="currentColor" />} />
                    <ActionButton label={t('phone.actionShare','share')}   icon={<Share         className="h-[28px] w-[28px]" strokeWidth={2} />} />
                </div>

                <div className="mb-4 rounded-[10px] bg-[#e5e5e5] px-4 py-3 dark:bg-surface">
                    <div className="text-[15px] font-semibold text-black dark:text-white">{entry.date}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[15px] text-black/60 dark:text-white/60">
                        <span>{entry.timeOfDay}</span>
                        <span>{entry.direction}</span>
                    </div>
                    {entry.duration && <div className="mt-0.5 text-[13px] text-black/45 dark:text-white/45">{entry.duration}</div>}
                </div>

                {entry.number && (
                    <>
                        <div className="mb-4 rounded-[10px] bg-[#e5e5e5] px-4 py-3 dark:bg-surface">
                            <div className="text-[13px] text-black/50 dark:text-white/50">{t('phone.phoneLabel','phone')}</div>
                            <div className="text-[19px] text-ios-blue">{formatPhone(entry.number)}</div>
                        </div>
                        <button
                            type="button"
                            onClick={onAddToContacts}
                            className="w-full rounded-[10px] bg-[#e5e5e5] px-4 py-3.5 text-left text-[19px] text-ios-blue active:bg-black/5 dark:bg-surface dark:active:bg-white/5"
                        >
                            {t('phone.addToContacts','Add to Contacts')}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

function ActionButton({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <button type="button" className="flex flex-1 flex-col items-center gap-2 rounded-[12px] bg-[#e5e5e5] py-4 text-ios-blue active:opacity-70 dark:bg-surface">
            {icon}
            <span className="text-[13px] font-medium">{label}</span>
        </button>
    );
}
