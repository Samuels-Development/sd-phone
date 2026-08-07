import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { Flag } from 'lucide-react';

import { MenuRootProvider } from '@/ui/menuRoot';
import { surfaceBackdrop } from '@/ui/surfaces';
import { TabBar, type TabBarItem } from '@/ui/TabBar';

import { RACING_SECTIONS, type RacingSection } from './data';
import { navItems } from './racingNav';
import { RacingHeader } from './RacingHeader';
import { RACING_ACCENT, RACING_STATUS_RESERVE, racingAccentText, racingViewEnter } from './racingTheme';
import { useRacingSession } from './useRacingSession';

const TAB_ICON = 'h-[33px] w-[33px]';

function tabsFor(): TabBarItem<RacingSection>[] {
    const catalog = navItems();
    return RACING_SECTIONS
        .map(id => {
            const Icon = catalog[id].icon;
            return {
                id,
                label: catalog[id].label,
                icon:  (active: boolean) => <Icon className={TAB_ICON} strokeWidth={active ? 2.2 : 1.9} />,
            };
        });
}

export function RacingPhone({ pane }: { pane: (section: RacingSection) => ReactNode }) {
    const { ready, section, setSection } = useRacingSession();
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const attachRoot = useCallback((node: HTMLDivElement | null) => { setRoot(node); }, []);

    const active: RacingSection = section;

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
                    <RacingHeader phone />

                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                        <div key={active} className={`flex min-h-0 flex-1 flex-col ${racingViewEnter}`}>
                            {pane(active)}
                        </div>
                    </div>

                    <TabBar
                        tabs={tabsFor()}
                        active={active}
                        onChange={setSection}
                        activeClassName={racingAccentText}
                    />
                </>
            )}
        </div>
        </MenuRootProvider>
    );
}
