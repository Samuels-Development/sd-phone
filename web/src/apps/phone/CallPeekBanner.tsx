import { PhoneCall } from 'lucide-react';

import { t } from '@/i18n';
import { useMaskedPhone } from '@/stores/themeStore';

export function CallPeekBanner({ name, number }: { name?: string; number: string }) {
    const phone = useMaskedPhone();
    const who = name || phone(number) || t('phone.unknown', 'Unknown');

    return (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] z-[55] flex flex-col items-center px-2.5 font-sf">
            <div className="w-full max-w-[420px]">
                <div
                    className="flex items-center gap-3 rounded-[22px] bg-elevated px-3.5 py-3.5 shadow-[0_10px_34px_rgba(0,0,0,0.20)] ring-1 ring-black/[0.06] dark:ring-white/10"
                    style={{ animation: 'notif-in 0.5s cubic-bezier(0.16,1.16,0.3,1) both' }}
                >
                    <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[13px] bg-[#34c759]">
                        <PhoneCall className="h-[24px] w-[24px] text-white" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[16px] font-semibold leading-tight text-black/55 dark:text-white/55">
                            {t('phone.incomingCallStatus', 'Incoming call')}
                        </div>
                        <p className="mt-1 truncate text-[22px] font-semibold leading-tight text-black dark:text-white">{who}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
