import { useCallback, useEffect, useState } from 'react';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { CompaniesTab } from './CompaniesTab';
import { JobsTab } from './JobsTab';
import { ServiceMessagesTab } from './ServiceMessagesTab';
import { ActionsTab } from './ActionsTab';
import { ServicesTabBar, type ServicesTab } from './ServicesTabBar';
import { fetchDirectory, fetchInbox, markThreadRead, type Directory, type Inbox, type MyCompany } from './servicesApi';

const EMPTY_INBOX: Inbox = { personal: [], job: [], hasJob: false };

type Scope = 'personal' | 'job';

export function Services({ onClose: _onClose }: { onClose: () => void }) {
    const [tab, setTab] = useSessionState<ServicesTab>('services:tab', 'companies');
    const [dir, setDir] = useState<Directory | null>(null);

    const [inbox, setInbox] = useState<Inbox>(EMPTY_INBOX);
    const [inboxLoaded, setInboxLoaded] = useState(false);

    const refresh = useCallback(async () => { setDir(await fetchDirectory()); }, []);
    useEffect(() => { void refresh(); }, [refresh]);

    const refreshInbox = useCallback(async () => { setInbox(await fetchInbox()); setInboxLoaded(true); }, []);
    useEffect(() => { void refreshInbox(); }, [refreshInbox]);

    useNuiEvent('sd-phone:services:rosterChanged', useCallback(() => { void refresh(); }, [refresh]));
    useNuiEvent('sd-phone:services:inbox', useCallback(() => { void refreshInbox(); }, [refreshInbox]));
    useNuiEvent('sd-phone:services:jobsChanged', useCallback(() => { void refresh(); }, [refresh]));

    const patchMyCompany = useCallback((mc: MyCompany | null | undefined) => {
        setDir(d => (d ? { ...d, myCompany: mc ?? null } : d));
    }, []);

    const markRead = useCallback((scope: Scope, key: string) => {
        setInbox(prev => {
            const zero = (list: Inbox['personal']) => list.map(t => (t.key === key && t.unread > 0 ? { ...t, unread: 0 } : t));
            return scope === 'job' ? { ...prev, job: zero(prev.job) } : { ...prev, personal: zero(prev.personal) };
        });
        void markThreadRead(scope, key);
    }, []);

    const showJobs = dir?.multijob ?? false;
    const activeTab: ServicesTab = (tab === 'jobs' && !showJobs) ? 'companies' : tab;

    const unreadMessages =
        inbox.personal.reduce((n, t) => n + (t.unread ?? 0), 0) +
        inbox.job.reduce((n, t) => n + (t.unread ?? 0), 0);

    return (
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex flex-1 flex-col overflow-hidden">
                <div key={activeTab} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                    {activeTab === 'companies'
                        ? <CompaniesTab companies={dir?.companies ?? []} onMessaged={() => setTab('messages')} />
                        : activeTab === 'jobs'
                            ? <JobsTab onJobChanged={refresh} />
                            : activeTab === 'messages'
                                ? <ServiceMessagesTab inbox={inbox} loaded={inboxLoaded} onInboxChange={setInbox} onMarkRead={markRead} />
                                : <ActionsTab myCompany={dir?.myCompany ?? null} multijob={showJobs} invoicesEnabled={dir?.invoicesEnabled ?? false} onChanged={patchMyCompany} />}
                </div>
            </div>

            <ServicesTabBar
                tab={activeTab}
                onChange={setTab}
                showJobs={showJobs}
                messagesBadge={unreadMessages}
                jobsBadge={dir?.pendingOffers ?? 0}
            />
        </div>
    );
}
