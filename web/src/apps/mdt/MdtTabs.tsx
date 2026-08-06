import { Plus, X } from 'lucide-react';

import { t } from '@/i18n';
import type { MdtSection } from './data';
import { navItems } from './mdtNav';
import { MDT_ACCENT, mdtRuleX } from './mdtTheme';
import { MDT_MAX_TABS, useMdtSession, type MdtTab } from './useMdtSession';

const NEW_REF = 'new';

function draftLabels(): Partial<Record<MdtSection, string>> {
    return {
        reports: t('mdt.tabNewReport', 'New report'),
        cases:   t('mdt.tabNewCase', 'New case'),
    };
}

export function MdtTabs() {
    const { tabs, activeTab, newTab, closeTab, selectTab, department } = useMdtSession();
    const catalog = navItems();
    const drafts = draftLabels();
    const accent = department?.accent ?? MDT_ACCENT;

    function labelOf(tab: MdtTab): string {
        const ref = tab.selection[tab.section];
        if (!ref) return catalog[tab.section].label;
        if (ref === NEW_REF) return drafts[tab.section] ?? catalog[tab.section].label;
        return ref;
    }

    return (
        <div className="shrink-0">
            <div className={mdtRuleX} />
            <div className="flex items-center gap-1 bg-black/[0.05] px-6 py-1.5 dark:bg-black/25">
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {tabs.map(tab => {
                    const Icon = catalog[tab.section].icon;
                    const isActive = tab.id === activeTab;
                    return (
                        <div
                            key={tab.id}
                            className={[
                                'group flex shrink-0 items-center gap-1.5 rounded-[9px] py-[5px] pl-2.5 transition-colors duration-150',
                                tabs.length > 1 ? 'pr-1' : 'pr-2.5',
                                isActive
                                    ? 'bg-elevated shadow-[0_1px_2px_rgba(0,0,0,0.10)] ring-1 ring-black/[0.06] dark:shadow-none dark:ring-white/[0.10]'
                                    : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]',
                            ].join(' ')}
                        >
                            <button
                                type="button"
                                onClick={() => selectTab(tab.id)}
                                aria-current={isActive}
                                className="flex min-w-0 items-center gap-1.5"
                            >
                                <Icon
                                    className="h-[14px] w-[14px] shrink-0"
                                    strokeWidth={2.2}
                                    style={{ color: isActive ? accent : undefined }}
                                />
                                <span
                                    className={[
                                        'max-w-[132px] truncate text-[13px] font-medium',
                                        isActive ? 'text-black dark:text-white' : 'text-ios-gray',
                                    ].join(' ')}
                                >
                                    {labelOf(tab)}
                                </span>
                            </button>
                            {tabs.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => closeTab(tab.id)}
                                    aria-label={t('mdt.closeTab', 'Close tab')}
                                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors hover:bg-black/[0.08] hover:text-black dark:hover:bg-white/[0.12] dark:hover:text-white"
                                >
                                    <X className="h-[12px] w-[12px]" strokeWidth={2.6} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {tabs.length < MDT_MAX_TABS && (
                <button
                    type="button"
                    onClick={newTab}
                    aria-label={t('mdt.newTab', 'New tab')}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] text-ios-gray transition-colors hover:bg-black/[0.06] hover:text-black dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                    <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
                </button>
            )}
            </div>
            <div className={mdtRuleX} />
        </div>
    );
}
