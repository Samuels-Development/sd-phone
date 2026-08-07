import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';

import { DEFAULT_HUD, DEFAULT_LIMITS } from './data';
import type { HudSettings, RaceClass, RacingLimits, RacingMe, RacingSection } from './data';
import { CLASS_COLOR } from './racingTheme';
import { racingBootstrap } from './racingApi';

export interface RacingSessionValue {
    me:         RacingMe | null;
    hud:        HudSettings;
    admin:      boolean;
    creator:    boolean;
    classes:    Record<RaceClass, { level: number; label: string; color: string }>;
    limits:     RacingLimits;
    loading:    boolean;
    ready:      boolean;
    section:    RacingSection;
    setSection: (section: RacingSection) => void;
    selected:   string | null;
    select:     (ref: string | null) => void;
    setHud:     (hud: HudSettings) => void;
    refresh:    () => void;
}

const RacingSessionContext = createContext<RacingSessionValue | null>(null);

export const RacingSessionProvider = RacingSessionContext.Provider;

export function useRacingSession(): RacingSessionValue {
    const value = useContext(RacingSessionContext);
    if (!value) throw new Error('useRacingSession used outside the racing session provider');
    return value;
}

function fallbackClasses(): Record<RaceClass, { level: number; label: string; color: string }> {
    return {
        D: { level: 1,  label: t('racing.classD', 'Rookie'),  color: CLASS_COLOR.D },
        C: { level: 1,  label: t('racing.classC', 'Amateur'), color: CLASS_COLOR.C },
        B: { level: 5,  label: t('racing.classB', 'Pro'),     color: CLASS_COLOR.B },
        A: { level: 15, label: t('racing.classA', 'Elite'),   color: CLASS_COLOR.A },
        S: { level: 25, label: t('racing.classS', 'Legend'),  color: CLASS_COLOR.S },
    };
}

function useDeckRefresh(fn: () => void): void {
    const active = useDeckActive();
    const wasActive = useRef(active);
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        if (active && !wasActive.current) fnRef.current();
        wasActive.current = active;
    }, [active]);
}

export function useRacingSessionState(): RacingSessionValue {
    const [section, setSection] = useSessionState<RacingSection>('racing:section', 'races');
    const [selection, setSelection] = useSessionState<Partial<Record<RacingSection, string | null>>>('racing:selected', {});
    const [hudOverride, setHudOverride] = useState<HudSettings | null>(null);

    const { data, loading, refetch } = useAsyncData(() => racingBootstrap(), []);
    const [settled, setSettled] = useState(false);

    useEffect(() => {
        if (!loading) setSettled(true);
    }, [loading]);

    useDeckRefresh(refetch);

    const select = useCallback(
        (ref: string | null) => setSelection(prev => ({ ...prev, [section]: ref })),
        [section, setSelection],
    );

    const setHud = useCallback((next: HudSettings) => setHudOverride(next), []);

    const classes = useMemo(() => data?.classes ?? fallbackClasses(), [data]);
    const hud = hudOverride ?? data?.hud ?? DEFAULT_HUD;

    return useMemo(() => ({
        me:         data?.me ?? null,
        hud,
        admin:      data?.admin ?? false,
        creator:    data?.creator ?? false,
        classes,
        limits:     data?.limits ?? DEFAULT_LIMITS,
        loading,
        ready:      data !== null || settled,
        section,
        setSection,
        selected:   selection[section] ?? null,
        select,
        setHud,
        refresh:    refetch,
    }), [data, hud, classes, loading, settled, section, setSection, selection, select, setHud, refetch]);
}
