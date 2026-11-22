import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleAlert, Info } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { frameHex } from '@/shell/frameColors';
import { EmptyState } from '@/ui/EmptyState';
import { NavBar } from '@/ui/NavBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Spinner } from '@/ui/Spinner';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';
import { preloadLayers } from './CasePreview';
import { cleanDesign, fetchCasesState, previewCase, type CasesState, type Design } from './casesApi';
import { MyCases } from './MyCases';
import { PhoneTab } from './PhoneTab';
import { Studio } from './Studio';

type Tab = 'design' | 'mine' | 'phone';

/** Where the studio starts: the case being worn, else the newest one owned, else a plain shell. */
function startDesign(s: CasesState): Design {
    if (s.equipped) return s.equipped;
    if (s.owned.length) return s.owned[s.owned.length - 1];
    return { style: s.catalog.styles[0]?.id ?? 'slim', color: Math.min(22, Math.max(0, s.catalog.palette.length - 1)) };
}

function BlockedNotice() {
    return (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-[14px] bg-[#F59E0B]/[0.14] px-3.5 py-3">
            <Info className="mt-[1px] h-[18px] w-[18px] shrink-0 text-[#D97706]" strokeWidth={2.4} />
            <div className="min-w-0 text-[14px] leading-snug">
                <div className="font-semibold">{t('cases.blockedTitle', 'This phone comes in its own case')}</div>
                <div className="mt-0.5 text-black/70 dark:text-white/70">
                    {t('cases.blockedBody', 'You can still design cases and look through yours, but buying or wearing one needs a phone without a built-in case.')}
                </div>
            </div>
        </div>
    );
}

export function Cases({ onClose: _onClose }: { onClose: () => void }) {
    const [stored, setTab] = useSessionState<Tab>('cases:tab', 'design');
    const [draft, setDraft] = useSessionState<Design | null>('cases:draft', null);
    const [state, setState] = useState<CasesState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const tab: Tab = stored === 'phone' && !state?.phone?.enabled ? 'design' : stored;
    const deckActive = useDeckActive();

    const load = useCallback(async () => {
        const res = await fetchCasesState();
        const data = res.data;
        if (!res.success || !data) {
            setLoadError(failText(res, t('cases.loadFailed', 'Your cases could not be loaded')));
            return;
        }
        setLoadError(null);
        setState(data);
        setDraft(d => (d && data.catalog.styles.some(s => s.id === d.style) ? d : startDesign(data)));
    }, [setDraft]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { preloadLayers(); }, []);

    const wasActive = useRef(deckActive);
    useEffect(() => {
        const rising = deckActive && !wasActive.current;
        wasActive.current = deckActive;
        if (!rising) return;
        const id = window.setTimeout(() => void load(), 420);
        return () => window.clearTimeout(id);
    }, [deckActive, load]);

    const tryOn = tab === 'design' && deckActive && state && !state.blocked && draft
        ? JSON.stringify(cleanDesign(state.catalog, draft))
        : '';
    const tryingOn = useRef(false);
    useEffect(() => {
        if (!tryOn) {
            if (tryingOn.current) { tryingOn.current = false; previewCase(null); }
            return;
        }
        const id = window.setTimeout(() => { tryingOn.current = true; previewCase(JSON.parse(tryOn) as Design); }, 150);
        return () => window.clearTimeout(id);
    }, [tryOn]);
    useEffect(() => () => previewCase(null), []);

    const patch = useCallback((p: Partial<CasesState>) => setState(s => (s ? { ...s, ...p } : s)), []);
    const TABS = [
        { value: 'design' as const, label: t('cases.tabDesign', 'Design') },
        { value: 'mine' as const,   label: t('cases.tabMine', 'My Cases') },
        ...(state?.phone?.enabled ? [{ value: 'phone' as const, label: t('cases.tabPhone', 'Phone') }] : []),
    ];
    const hex = frameHex(state?.frame ?? '');

    let body: ReactNode;
    if (!state) {
        body = loadError ? (
            <EmptyState
                icon={CircleAlert}
                title={t('cases.loadFailedTitle', 'Something Went Wrong')}
                subtitle={loadError}
                action={(
                    <button type="button" onClick={() => { setLoadError(null); void load(); }} className="text-[17px] font-semibold text-ios-blue active:opacity-60">
                        {t('cases.tryAgain', 'Try Again')}
                    </button>
                )}
            />
        ) : (
            <div className="flex flex-1 items-center justify-center pb-24"><Spinner /></div>
        );
    } else if (tab === 'design') {
        body = draft && state.catalog.styles.length ? (
            <Studio
                state={state}
                draft={draft}
                frameHex={hex}
                onChange={setDraft}
                onPatch={patch}
                onBought={data => {
                    patch({ owned: data.owned, equipped: data.equipped, balance: data.balance });
                    setTab('mine');
                }}
            />
        ) : (
            <EmptyState icon={CircleAlert} title={t('cases.nothingForSale', 'Nothing for Sale')} subtitle={t('cases.nothingForSaleBody', 'There are no cases to design right now.')} />
        );
    } else if (tab === 'phone') {
        body = <PhoneTab state={state} frameHex={hex} onPatch={patch} />;
    } else {
        body = (
            <MyCases
                state={state}
                frameHex={hex}
                onPatch={patch}
                onEdit={d => { setDraft({ ...d }); setTab('design'); }}
                onDesign={() => setTab('design')}
            />
        );
    }

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base text-black dark:text-white">
            <StatusBarSpacer />
            <NavBar title={t('cases.title', 'Cases')} />

            <div className="px-4 pb-1">
                <SegmentedControl value={tab} onChange={setTab} options={TABS} slide />
            </div>

            {state?.blocked && tab !== 'phone' && <BlockedNotice />}

            <div className="relative flex min-h-0 flex-1 flex-col">{body}</div>
        </div>
    );
}
