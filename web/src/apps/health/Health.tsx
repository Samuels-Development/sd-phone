import { useCallback, useEffect, useRef, useState } from 'react';
import { HeartPulse, Stethoscope, Trophy } from 'lucide-react';

import { isHostMessage } from '@/core/messageSource';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { useSessionStore } from '@/stores/sessionStore';
import { dirSign } from '@/stores/directionStore';
import { t } from '@/i18n';
import { TabBar, type TabBarItem } from '@/ui/TabBar';
import { apiLeaderboard, apiSummary } from './healthApi';
import { LeaderboardTab } from './LeaderboardTab';
import { MedicalIdPage } from './MedicalIdPage';
import { Summary } from './Summary';

const SB_H = 61;

type HealthTab = 'summary' | 'board';

const live = {
    steps:     null as number | null,
    distanceM: null as number | null,
    activeMs:  null as number | null,
    heartRate: null as number | null,
};
window.addEventListener('message', (e: MessageEvent) => {
    if (!isHostMessage(e)) return;
    const msg = e.data as { action?: string; data?: Record<string, unknown> } | undefined;
    if (!msg?.data) return;
    if (msg.action === 'sd-phone:health') {
        const p = msg.data.pending as { steps?: number; distanceM?: number; activeMs?: number } | undefined;
        if (typeof p?.steps     === 'number') live.steps     = p.steps;
        if (typeof p?.distanceM === 'number') live.distanceM = p.distanceM;
        if (typeof p?.activeMs  === 'number') live.activeMs  = p.activeMs;
        if (typeof msg.data.heartRate === 'number') live.heartRate = msg.data.heartRate;
    }
});

const TAB_ORDER: HealthTab[] = ['summary', 'board'];

export function Health({ onClose }: { onClose: () => void }) {
    const [tab, setTab] = useSessionState<HealthTab>('health:tab', 'summary');
    const [tabDir, setTabDir] = useState<'left' | 'right'>('right');
    const [medicalOpen, setMedicalOpen] = useSessionState('health:medical', false);

    function goTab(next: HealthTab) {
        if (next === tab) return;
        const forward = TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab);
        setTabDir(forward === (dirSign() > 0) ? 'right' : 'left');
        setTab(next);
    }

    const storeStart = useSessionStore(s => s.startMs);
    const [fallbackStart]          = useState<number>(() => Date.now());
    const [now,       setNow]      = useState<number>(() => Date.now());
    const [steps,     setSteps]    = useState<number>(() => live.steps ?? 0);
    const [distanceM, setDistance] = useState<number>(() => live.distanceM ?? 0);
    const [activeMs,  setActive]   = useState<number>(() => live.activeMs ?? 0);
    const [hr,        setHr]       = useState<number>(() => live.heartRate ?? 70);

    const prevPending = useRef(0);
    const refetchRef   = useRef<() => void>(() => {});

    useNuiEvent('sd-phone:health', useCallback((data) => {
        if (!data) return;
        const pending = data.pending;
        const nextSteps = typeof pending?.steps === 'number' ? pending.steps : null;

        if (nextSteps !== null) {
            if (nextSteps < prevPending.current) refetchRef.current();
            prevPending.current = nextSteps;
            setSteps(nextSteps);
        }
        if (typeof pending?.distanceM === 'number') setDistance(pending.distanceM);
        if (typeof pending?.activeMs  === 'number') setActive(pending.activeMs);
        if (typeof data.heartRate === 'number') setHr(data.heartRate);
    }, []));

    const deckActive = useDeckActive();
    useEffect(() => {
        if (!deckActive) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [deckActive]);

    const { data: summary, refetch: refetchSummary } = useAsyncData(apiSummary, [deckActive], { enabled: deckActive });
    useEffect(() => { refetchRef.current = refetchSummary; }, [refetchSummary]);
    const { data: board } = useAsyncData(apiLeaderboard, [deckActive], { enabled: deckActive });

    const tabs: TabBarItem<HealthTab>[] = [
        { id: 'summary', label: t('health.summary', 'Summary'), icon: a => <HeartPulse className="h-[27px] w-[27px]" strokeWidth={a ? 2.2 : 1.9} /> },
        { id: 'board',   label: t('health.board', 'Leaderboard'), icon: a => <Trophy className="h-[27px] w-[27px]" strokeWidth={a ? 2.2 : 1.9} /> },
    ];

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base text-black dark:text-white">
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight">
                    {tab === 'summary' ? t('health.title', 'Health') : t('health.board', 'Leaderboard')}
                </h1>
                {tab === 'summary' && (
                    <button
                        type="button"
                        onClick={() => setMedicalOpen(true)}
                        aria-label={t('medical.title', 'Medical ID')}
                        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-ios-red/15 text-ios-red active:opacity-60"
                    >
                        <Stethoscope className="h-[22px] w-[22px]" strokeWidth={2.3} />
                    </button>
                )}
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto">
                <div key={tab} className={tabDir === 'right' ? 'animate-tab-in-right' : 'animate-tab-in-left'}>
                    {tab === 'summary' ? (
                        <Summary
                            summary={summary}
                            pendingSteps={steps}
                            pendingDistanceM={distanceM}
                            pendingActiveMs={activeMs}
                            hr={hr}
                            awakeMs={Math.max(0, now - (storeStart ?? fallbackStart))}
                        />
                    ) : (
                        <LeaderboardTab board={board} />
                    )}
                </div>
            </div>

            <TabBar tabs={tabs} active={tab} onChange={goTab} />

            <button
                type="button"
                onClick={onClose}
                aria-label={t('health.closeHealth', 'Close Health')}
                className="absolute inset-x-0 bottom-0 z-50 h-5 cursor-default"
            />

            {medicalOpen && <MedicalIdPage onBack={() => setMedicalOpen(false)} />}
        </div>
    );
}
