import { Flame, LayoutGrid, Trophy } from 'lucide-react';

import { TabBar, type TabBarItem } from '@/ui/TabBar';
import { t } from '@/i18n';
import type { StreakTab } from './data';

export function StreaksTabBar({ tab, onTab }: { tab: StreakTab; onTab: (t: StreakTab) => void }) {
    const me:      TabBarItem<StreakTab> = { id: 'me',      label: t('streaks.tabHome', 'Home'),       icon: a => <Flame      className="h-[33px] w-[33px]" strokeWidth={a ? 2.4 : 1.9} /> };
    const gallery: TabBarItem<StreakTab> = { id: 'gallery', label: t('streaks.tabGallery', 'Gallery'), icon: a => <LayoutGrid className="h-[31px] w-[31px]" strokeWidth={a ? 2.4 : 1.9} /> };
    const board:   TabBarItem<StreakTab> = { id: 'board',   label: t('streaks.tabBoard', 'Board'),     icon: a => <Trophy     className="h-[32px] w-[32px]" strokeWidth={a ? 2.4 : 1.9} /> };
    return (
        <TabBar
            tabs={[me, gallery, board]}
            active={tab}
            onChange={onTab}
            activeClassName="text-[#FF7A1A]"
        />
    );
}
