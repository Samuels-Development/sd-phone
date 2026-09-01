import { useCallback, useEffect, useRef, useState } from 'react';
import { Ellipsis, IdCard as IdCardGlyph } from 'lucide-react';

import { device } from '@device';
import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { ActionSheet } from '@/ui/ActionSheet';
import { EmptyState } from '@/ui/EmptyState';
import { PromptDialog } from '@/ui/PromptDialog';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Camera } from '@/apps/camera/Camera';
import { useIdStore } from '@/stores/idStore';
import { IdCard } from './IdCard';
import { CardDetail } from './CardDetail';
import { devCapturePortrait, idHeadshot, idList, idSetPortrait } from './idApi';
import { CARD_RATIO, cardTitle, formatCountdown, type ReceivedIdCard } from './data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';
import { Spinner } from '@/ui/Spinner';

const PEEK   = 74;
const CARD_W = device.screen.w - 40;
const CARD_H = CARD_W / CARD_RATIO;

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [active]);
    return now;
}

export function Id({ onClose: _onClose }: { onClose: () => void }) {
    const [openKey, setOpenKey]           = useSessionState<string | null>('id:openCard', null);
    const [openReceived, setOpenReceived] = useState<string | null>(null);
    const [menuOpen, setMenuOpen]         = useState(false);
    const [linkOpen, setLinkOpen]         = useState(false);
    const [capturing, setCapturing]       = useState(false);
    const [saving, setSaving]             = useState(false);
    const [headshot, setHeadshot]         = useState<string | null>(null);
    const [headshotSettled, setSettled]   = useState(false);
    const capturingRef = useRef(false);
    capturingRef.current = capturing;

    const { data, loading, refetch } = useAsyncData(idList, []);

    const wantsHeadshot = data !== null && data.portrait === null;
    useEffect(() => {
        if (!wantsHeadshot) return;
        let alive = true;
        void idHeadshot()
            .then(url => { if (alive && url) setHeadshot(url); })
            .finally(() => { if (alive) setSettled(true); });
        return () => { alive = false; };
    }, [wantsHeadshot]);

    const portrait = data?.portrait ?? headshot;
    const cards    = (data?.cards ?? []).map(c => ({ ...c, portrait }));
    const pending  = (loading && data === null) || (wantsHeadshot && !headshotSettled);

    const deckActive = useDeckActive();
    const wasActive  = useRef(deckActive);
    useEffect(() => {
        const rising = deckActive && !wasActive.current;
        wasActive.current = deckActive;
        if (!rising) return;
        const id = window.setTimeout(refetch, 420);
        return () => window.clearTimeout(id);
    }, [deckActive, refetch]);

    const savePortrait = useCallback(async (url: string | null) => {
        setSaving(true);
        try {
            if (await idSetPortrait(url)) refetch();
        } finally {
            setSaving(false);
        }
    }, [refetch]);

    const takePhoto = useCallback(async () => {
        if (!isFiveM) {
            await savePortrait(await devCapturePortrait());
            return;
        }
        setCapturing(true);
    }, [savePortrait]);

    useNuiEvent('sd-phone:photos:added', useCallback((photo) => {
        if (!capturingRef.current || !photo?.url) return;
        setCapturing(false);
        void savePortrait(photo.url);
    }, [savePortrait]));

    const received = useIdStore(s => s.received);
    const prune    = useIdStore(s => s.prune);
    const now      = useNow(received.length > 0);
    useEffect(() => { prune(now); }, [now, prune]);

    const openCard  = cards.find(c => c.key === openKey) ?? null;
    const openShown = received.find(r => r.id === openReceived) ?? null;

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <StatusBarSpacer />

            <div className="flex shrink-0 items-end justify-between px-5 pb-2 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('id.id', 'ID')}</h1>
                <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    disabled={saving}
                    aria-label={t('id.options', 'Options')}
                    className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.06] text-black active:opacity-60 disabled:opacity-40 dark:bg-white/10 dark:text-white"
                >
                    <Ellipsis className="h-5 w-5" strokeWidth={2.2} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8">
                {pending ? (
                    <div className="flex h-full items-center justify-center">
                        <Spinner />
                    </div>
                ) : cards.length === 0 ? (
                    <EmptyState center icon={IdCardGlyph} title={t('id.noCards', 'No Cards')} subtitle={t('id.noCardsSub', 'Your identity documents will appear here.')} />
                ) : (
                    <div className="relative" style={{ height: CARD_H + PEEK * (cards.length - 1) }}>
                        {cards.map((card, i) => (
                            <button
                                key={card.key}
                                type="button"
                                onClick={() => setOpenKey(card.key)}
                                aria-label={cardTitle(card)}
                                className="absolute inset-x-0 block w-full text-left transition-transform duration-200 active:scale-[0.985]"
                                style={{ top: i * PEEK, zIndex: i + 1 }}
                            >
                                <IdCard card={card} />
                            </button>
                        ))}
                    </div>
                )}

                {received.length > 0 && (
                    <div className="mt-8">
                        <ListGroup header={t('id.shownToYou', 'Shown to You')}>
                            {received.map((r, i) => (
                                <ListRow
                                    key={r.id}
                                    label={r.fromName}
                                    sub={cardTitle(r.card)}
                                    value={formatCountdown(r.expiresAt - now)}
                                    chevron
                                    divider={i < received.length - 1}
                                    onPress={() => setOpenReceived(r.id)}
                                />
                            ))}
                        </ListGroup>
                    </div>
                )}
            </div>

            {openCard && (
                <CardDetail
                    card={openCard}
                    sharePortrait={data?.portrait ? null : headshot}
                    onBack={() => setOpenKey(null)}
                />
            )}
            {openShown && <CardDetail card={openShown.card} received={openShown as ReceivedIdCard} onBack={() => setOpenReceived(null)} />}

            {menuOpen && (
                <ActionSheet
                    onClose={() => setMenuOpen(false)}
                    actions={[
                        { label: data?.portrait ? t('id.retakePhoto', 'Retake Photo') : t('id.takePhoto', 'Take Photo'), onClick: () => void takePhoto() },
                        { label: t('id.useImageLink', 'Use Image Link'), onClick: () => setLinkOpen(true) },
                        { label: t('id.useGamePhoto', 'Use Game Photo'), disabled: !data?.portrait, onClick: () => void savePortrait(null) },
                    ]}
                />
            )}

            {linkOpen && (
                <PromptDialog
                    title={t('id.imageLinkTitle', 'Image Link')}
                    message={t('id.imageLinkMessage', 'Paste a direct link to a photo. It shows on every card until you change it.')}
                    placeholder="https://"
                    inputMode="url"
                    maxLength={512}
                    validate={v => (/^https?:\/\/\S+$/i.test(v.trim()) ? null : t('id.imageLinkInvalid', 'Enter a full link starting with http'))}
                    confirmLabel={t('id.useLink', 'Use')}
                    onCancel={() => setLinkOpen(false)}
                    onConfirm={async v => {
                        setLinkOpen(false);
                        await savePortrait(v.trim());
                    }}
                />
            )}

            {capturing && (
                <div className="absolute inset-0 z-50 animate-slide-up-fade">
                    <Camera onClose={() => setCapturing(false)} photoOnly />
                </div>
            )}
        </div>
    );
}
