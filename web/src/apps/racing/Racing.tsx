import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Flag } from 'lucide-react';

import { device } from '@device';
import { NavContext, NOOP_NAV } from '@/hooks/useIosPush';
import { MenuRootProvider } from '@/ui/menuRoot';
import { surfaceBackdrop } from '@/ui/surfaces';
import type { RacingSection } from './data';
import { DriverPane } from './DriverPane';
import { RacesPane } from './RacesPane';
import { RankingsPane } from './RankingsPane';
import { TracksPane } from './TracksPane';
import { RacingHeader } from './RacingHeader';
import { RacingPhone } from './RacingPhone';
import { RacingRail } from './RacingRail';
import { RACING_ACCENT, RACING_STATUS_RESERVE, racingViewEnter } from './racingTheme';
import { RacingSessionProvider, useRacingSession, useRacingSessionState } from './useRacingSession';

function pane(section: RacingSection) {
    switch (section) {
        case 'tracks':   return <TracksPane />;
        case 'rankings': return <RankingsPane />;
        case 'driver':   return <DriverPane />;
        default:         return <RacesPane />;
    }
}

const COMPACT_WIDTH = 900;

function RacingTerminal() {
    const { ready, section } = useRacingSession();

    const active: RacingSection = section;

    const rootRef = useRef<HTMLDivElement | null>(null);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const [compact, setCompact] = useState(false);

    const attachRoot = useCallback((node: HTMLDivElement | null) => {
        rootRef.current = node;
        setRoot(node);
    }, []);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = () => setCompact(el.clientWidth < COMPACT_WIDTH);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <MenuRootProvider value={root}>
        <div
            ref={attachRoot}
            data-racing-root=""
            className={`absolute inset-0 z-10 flex select-none flex-col font-sf text-black dark:text-white ${surfaceBackdrop}`}
            style={{ '--racing-accent': RACING_ACCENT } as CSSProperties}
        >
            <div className="shrink-0" style={{ height: RACING_STATUS_RESERVE }} />

            {!ready ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                    <span
                        className="flex h-[72px] w-[72px] animate-pulse items-center justify-center rounded-[20px] opacity-30"
                        style={{ background: RACING_ACCENT }}
                    >
                        <Flag className="h-9 w-9 text-black" strokeWidth={2.2} />
                    </span>
                </div>
            ) : (
                <>
                    <RacingHeader compact={compact} />
                    <div className="flex min-h-0 flex-1">
                        <RacingRail compact={compact} />
                        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-6">
                            <div key={active} className={`flex min-h-0 flex-1 flex-col ${racingViewEnter}`}>
                                {pane(active)}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
        </MenuRootProvider>
    );
}

export function Racing({ onClose: _onClose }: { onClose: () => void }) {
    const session = useRacingSessionState();
    return (
        <RacingSessionProvider value={session}>
            <NavContext.Provider value={NOOP_NAV}>
                {device.id === 'phone' ? <RacingPhone pane={pane} /> : <RacingTerminal />}
            </NavContext.Provider>
        </RacingSessionProvider>
    );
}
