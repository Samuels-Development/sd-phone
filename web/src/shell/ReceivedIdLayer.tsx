import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { IdCard } from '@/apps/id/IdCard';
import { DetailsList } from '@/apps/id/DetailsList';
import { cardTitle, formatCountdown, type ReceivedIdCard } from '@/apps/id/data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function ReceivedIdLayer({ shown, onDone }: {
    shown:  ReceivedIdCard;
    onDone: () => void;
}) {
    const [leaving, setLeaving] = useState(false);
    const [left, setLeft] = useState(() => shown.expiresAt - Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setLeft(shown.expiresAt - Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [shown.expiresAt]);

    useEffect(() => {
        if (left > 0) return;
        onDone();
    }, [left, onDone]);

    function dismiss() {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(onDone, 260);
    }

    const card = shown.card;

    return (
        <div
            className="absolute inset-0 z-[59] flex flex-col bg-base font-sf text-black dark:text-white"
            style={{ animation: leaving
                ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)' }}
        >
            <StatusBarSpacer />

            <div className="shrink-0 px-5 pb-3 pt-2 text-center">
                <div className="text-[15px] font-semibold text-ios-gray">{t('id.shownBy', 'Shown by {name}', { name: shown.fromName })}</div>
                <div className="mt-0.5 truncate text-[22px] font-bold">{cardTitle(card)}</div>
                <div className="mt-0.5 text-[13px] tabular-nums text-ios-gray">{t('id.disappearsIn', 'Disappears in {time}', { time: formatCountdown(left) })}</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5">
                <IdCard card={card} />
                <div className="mt-6">
                    <DetailsList card={card} />
                </div>
            </div>

            <div className="shrink-0 px-5 pb-9 pt-3">
                <button
                    type="button"
                    onClick={dismiss}
                    className="w-full rounded-[14px] bg-ios-blue py-[13px] text-[17px] font-semibold text-white active:opacity-80"
                >
                    {t('common.done', 'Done')}
                </button>
            </div>
        </div>
    );
}
