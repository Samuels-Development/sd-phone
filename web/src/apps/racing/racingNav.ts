import { Flag, Route, ShieldCheck, Trophy, UserRound, type LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import type { RacingSection } from './data';

export interface RacingNavItem {
    id:    RacingSection;
    label: string;
    icon:  LucideIcon;
}

export function navItems(): Record<RacingSection, RacingNavItem> {
    return {
        races:    { id: 'races',    label: t('racing.navRaces', 'Races'),       icon: Flag },
        tracks:   { id: 'tracks',   label: t('racing.navTracks', 'Tracks'),     icon: Route },
        rankings: { id: 'rankings', label: t('racing.navRankings', 'Rankings'), icon: Trophy },
        driver:   { id: 'driver',   label: t('racing.navDriver', 'Driver'),     icon: UserRound },
        admin:    { id: 'admin',    label: t('racing.navAdmin', 'Admin'),       icon: ShieldCheck },
    };
}
