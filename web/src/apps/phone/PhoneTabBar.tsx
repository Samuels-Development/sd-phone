import { AudioLines, Clock, Grid3x3, Star, UserRound } from 'lucide-react';

import { TabBar, type TabBarItem } from '@/ui/TabBar';
import { t } from '@/i18n';

export type PhoneTab = 'favorites' | 'recents' | 'contacts' | 'keypad' | 'recordings';

export function PhoneTabBar({ tab, onChange, showRecordings }: { tab: PhoneTab; onChange: (t: PhoneTab) => void; showRecordings?: boolean }) {
    const tabs: TabBarItem<PhoneTab>[] = [
        { id: 'favorites', label: t('phone.favorites','Favorites'), icon: a => <Star      className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} fill={a ? 'currentColor' : 'none'} /> },
        { id: 'recents',   label: t('phone.recents','Recents'),   icon: a => <Clock     className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
        { id: 'contacts',  label: t('phone.contacts','Contacts'),  icon: a => <UserRound className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} fill={a ? 'currentColor' : 'none'} /> },
        { id: 'keypad',    label: t('phone.keypad','Keypad'),    icon: a => <Grid3x3   className="h-[33px] w-[33px]" strokeWidth={a ? 2.4 : 2.0} /> },
    ];
    if (showRecordings) {
        tabs.push({ id: 'recordings', label: t('phone.recordings','Recordings'), icon: a => <AudioLines className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> });
    }
    return <TabBar tabs={tabs} active={tab} onChange={onChange} />;
}
