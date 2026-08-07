import { useState, type ReactNode } from 'react';

import { t } from '@/i18n';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { sectionsFor, type MdtSection } from './data';
import { navItems } from './mdtNav';
import { mdtDispatchState, mdtWarrants } from './mdtApi';
import { MDT_ACCENT } from './mdtTheme';
import { useDeckRefresh, useMdtSession } from './useMdtSession';

interface MenuGroup {
    id:       string;
    header:   string;
    tone:     string | null;
    sections: readonly MdtSection[];
}

function menuGroups(): readonly MenuGroup[] {
    return [
        {
            id:       'operations',
            header:   t('mdt.menuOperations', 'Operations'),
            tone:     null,
            sections: ['home', 'dispatch', 'chat', 'phone'],
        },
        {
            id:       'records',
            header:   t('mdt.menuRecords', 'Records'),
            tone:     '#0A84FF',
            sections: ['profiles', 'patients', 'vehicles', 'warrants', 'jail'],
        },
        {
            id:       'paperwork',
            header:   t('mdt.menuPaperwork', 'Paperwork'),
            tone:     '#30B0C7',
            sections: ['reports', 'cases', 'court', 'expunge'],
        },
        {
            id:       'reference',
            header:   t('mdt.menuReference', 'Reference'),
            tone:     '#A2845E',
            sections: ['offences', 'protocols', 'sops'],
        },
        {
            id:       'oversight',
            header:   t('mdt.menuOversight', 'Oversight'),
            tone:     '#636366',
            sections: ['employees', 'affairs', 'logs'],
        },
    ];
}

function CountBadge({ count, label }: { count: number; label: string }) {
    return (
        <span
            aria-label={label}
            className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-ios-red px-1.5 text-[12px] font-semibold tabular-nums text-white"
        >
            {count > 99 ? '99+' : count}
        </span>
    );
}

export function MdtMenu({ onOpen }: { onOpen: (section: MdtSection) => void }) {
    const { canOpen, department } = useMdtSession();

    const accent  = department?.accent ?? MDT_ACCENT;
    const catalog = navItems();
    const allowed = sectionsFor(department?.type).filter(id => id === 'home' || canOpen(id));

    const wantsCalls    = allowed.includes('dispatch');
    const wantsWarrants = allowed.includes('warrants');

    const [calls, setCalls]       = useState<number | null>(null);
    const [warrants, setWarrants] = useState<number | null>(null);

    const { refetch: refetchCalls } = useAsyncData(
        async () => (await mdtDispatchState()).calls.length,
        [],
        { enabled: wantsCalls, onData: setCalls },
    );

    const { refetch: refetchWarrants } = useAsyncData(
        async () => (await mdtWarrants({ status: 'active' })).total,
        [],
        { enabled: wantsWarrants, onData: setWarrants },
    );

    useNuiEvent('sd-phone:mdt:dispatch', data => setCalls(data.calls.length));

    useDeckRefresh(() => {
        refetchCalls();
        refetchWarrants();
    });

    function badgeFor(id: MdtSection): ReactNode {
        if (id === 'dispatch' && calls !== null && calls > 0) {
            return (
                <CountBadge
                    count={calls}
                    label={t('mdt.openCallsBadge', '{count} open calls', { count: calls })}
                />
            );
        }
        if (id === 'warrants' && warrants !== null && warrants > 0) {
            return (
                <span
                    aria-label={t('mdt.activeWarrantsBadge', '{count} active warrants', { count: warrants })}
                    className="text-[16px] font-normal tabular-nums text-ios-gray"
                >
                    {warrants > 99 ? '99+' : warrants}
                </span>
            );
        }
        return undefined;
    }

    return (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div
                className="flex flex-col gap-6 pt-4"
                style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
            >
                {menuGroups().map(group => {
                    const rows = group.sections.filter(id => allowed.includes(id));
                    if (rows.length === 0) return null;
                    const tone = group.tone ?? accent;

                    return (
                        <ListGroup key={group.id} header={group.header}>
                            {rows.map((id, i) => {
                                const item = catalog[id];
                                const Icon = item.icon;
                                return (
                                    <ListRow
                                        key={id}
                                        label={item.label}
                                        divider={i < rows.length - 1}
                                        left={(
                                            <span
                                                className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px]"
                                                style={{ background: tone }}
                                            >
                                                <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
                                            </span>
                                        )}
                                        right={badgeFor(id)}
                                        onPress={() => onOpen(id)}
                                    />
                                );
                            })}
                        </ListGroup>
                    );
                })}
            </div>
        </div>
    );
}
