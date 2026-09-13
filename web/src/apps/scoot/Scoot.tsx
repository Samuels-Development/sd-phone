import { Clock, MapPin } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { TabBar, type TabBarItem } from '@/ui/TabBar';
import { Home } from './Home';
import { Rides } from './Rides';

type Tab = 'ride' | 'rides';

export function Scoot({ onClose: _onClose }: { onClose: () => void }) {
    const [tab, setTab] = useSessionState<Tab>('scoot:tab', 'ride');
    const PUSH = 'ios-push 0.34s cubic-bezier(0.32,0.72,0,1)';
    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="relative min-h-0 flex-1">
                <div key={tab} className="absolute inset-0" style={{ animation: PUSH }}>
                    {tab === 'ride' && <Home />}
                    {tab === 'rides' && <Rides />}
                </div>
            </div>
            <TabBar tabs={scootTabs()} active={tab} onChange={setTab} activeClassName="text-[#14b8a6]" />
        </div>
    );
}

const scootTabs = (): TabBarItem<Tab>[] => [
    { id: 'ride',  label: t('scoot.tabRide', 'Ride'),   icon: a => <MapPin className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
    { id: 'rides', label: t('scoot.tabRides', 'Rides'), icon: a => <Clock  className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
];
