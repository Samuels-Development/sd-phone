import { useEffect, useState } from 'react';
import { Share } from 'lucide-react';

import { t } from '@/i18n';
import { NavBar } from '@/ui/NavBar';
import { ShareSheet } from '@/shared/ShareSheet';
import { useIosPush } from '@/hooks/useIosPush';
import { IdCard } from './IdCard';
import { DetailsList } from './DetailsList';
import { idShare } from './idApi';
import { cardTitle, formatCountdown, type IdCardData, type ReceivedIdCard } from './data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

function useCountdown(expiresAt: number | undefined): string | null {
    const [left, setLeft] = useState(() => (expiresAt ? expiresAt - Date.now() : 0));
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => setLeft(expiresAt - Date.now());
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [expiresAt]);
    return expiresAt ? formatCountdown(left) : null;
}

export function CardDetail({ card, received, sharePortrait = null, onBack }: {
    card:           IdCardData;
    received?:      ReceivedIdCard;
    sharePortrait?: string | null;
    onBack:         () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [sharing, setSharing] = useState(false);
    const countdown = useCountdown(received?.expiresAt);

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-base font-sf" style={pageStyle}>
            <StatusBarSpacer />
            <NavBar backLabel={t('id.id', 'ID')} onBack={goBack} title={cardTitle(card)} />

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8 pt-2">
                {received && (
                    <div className="mb-4 text-center">
                        <div className="text-[15px] font-semibold text-ios-gray">{t('id.shownBy', 'Shown by {name}', { name: received.fromName })}</div>
                        <div className="mt-0.5 text-[13px] tabular-nums text-ios-gray">{t('id.disappearsIn', 'Disappears in {time}', { time: countdown ?? '' })}</div>
                    </div>
                )}

                <IdCard card={card} />

                <div className="mt-6">
                    <DetailsList card={card} />
                </div>

                {!received && (
                    <button
                        type="button"
                        onClick={() => setSharing(true)}
                        className="mt-7 flex w-full items-center justify-center gap-2 rounded-[14px] bg-ios-blue py-[13px] text-[17px] font-semibold text-white active:opacity-80"
                    >
                        <Share className="h-[20px] w-[20px]" strokeWidth={2.2} />
                        {t('id.showToNearby', 'Show to Nearby Phone')}
                    </button>
                )}
            </div>

            {sharing && (
                <ShareSheet
                    onClose={() => setSharing(false)}
                    onShare={target => idShare(target.id, card.key, sharePortrait)}
                />
            )}
        </div>
    );
}
