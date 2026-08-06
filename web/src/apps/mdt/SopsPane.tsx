import { useMemo } from 'react';
import { BookText } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { Scroller } from '@/ui/Scroller';

import type { Sop } from './data';
import { mdtSops } from './mdtApi';
import { useViewEnter } from './useMdtSession';
import { mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtSectionHeader } from './mdtTheme';
import { MdtCard } from './ui/MdtCard';
import { MdtColumn } from './ui/MdtColumn';
import { MdtMaster } from './ui/MdtMaster';
import { MdtRichText } from './ui/MdtRichText';

export function SopsPane() {
    const [query, setQuery] = useSessionState('mdt:sops:query', '');
    const [code, setCode] = useSessionState<string | null>('mdt:sops:code', null);

    const { data, loading, settled } = useAsyncData(mdtSops, []);
    const sops = useMemo(() => data ?? [], [data]);

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const hits = needle.length === 0
            ? sops
            : sops.filter(s =>
                s.code.toLowerCase().includes(needle)
                || s.title.toLowerCase().includes(needle)
                || s.summary.toLowerCase().includes(needle)
                || s.body.toLowerCase().includes(needle));

        const order: string[] = [];
        const byCategory = new Map<string, Sop[]>();
        for (const sop of hits) {
            if (!byCategory.has(sop.category)) { byCategory.set(sop.category, []); order.push(sop.category); }
            byCategory.get(sop.category)!.push(sop);
        }
        return order.map(category => ({ category, rows: byCategory.get(category)! }));
    }, [sops, query]);

    const selected = useMemo(() => sops.find(s => s.code === code) ?? null, [sops, code]);

    const empty = (
        <EmptyState
            center
            icon={BookText}
            title={loading ? t('mdt.sopsLoading', 'Loading SOPs') : t('mdt.sopsNone', 'No SOPs')}
            subtitle={loading
                ? undefined
                : query.trim()
                    ? t('mdt.sopsNoMatch', 'No SOP matches that search.')
                    : t('mdt.sopsNoneSub', 'Standing orders are published from configs/sops.lua.')}
        />
    );

    const master = (
        <MdtColumn
            className="flex-1"
            title={t('mdt.sops', 'SOPs')}
            count={sops.length}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.sopsSearch', 'Code, title or wording')}
            isEmpty={settled && groups.length === 0}
            empty={empty}
        >
            {groups.map(group => (
                <div key={group.category}>
                    <div className="sticky top-0 z-10 bg-base/95 px-4 py-1 backdrop-blur-sm">
                        <span className={mdtSectionHeader}>{group.category}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-1">
                        {group.rows.map(sop => (
                            <button
                                key={sop.code}
                                type="button"
                                onClick={() => setCode(sop.code)}
                                className={`flex w-full flex-col gap-0.5 rounded-[10px] px-3 py-2 text-left ${
                                    sop.code === code ? 'bg-ios-blue/10' : mdtRowHover
                                }`}
                            >
                                <span className="flex w-full items-center gap-2">
                                    <span className={`shrink-0 ${mdtRef}`}>{sop.code}</span>
                                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-black dark:text-white">
                                        {sop.title}
                                    </span>
                                </span>
                                <span className={`w-full truncate ${mdtRowMeta}`}>{sop.summary}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </MdtColumn>
    );

    return (
        <MdtMaster
            master={master}
            hasDetail={selected !== null}
            detail={selected ? <SopDetail key={selected.code} sop={selected} /> : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={BookText}
                    title={t('mdt.sopsPick', 'No SOP selected')}
                    subtitle={t('mdt.sopsPickSub', 'Open a standing order to read it in full.')}
                />
            }
            onCloseDetail={() => setCode(null)}
        />
    );
}

function SopDetail({ sop }: { sop: Sop }) {
    const enter = useViewEnter(sop.code);

    return (
        <Scroller className={`h-full ${mdtPanePad} ${enter}`}>
            <span className={mdtRef}>{sop.code}</span>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                {sop.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ios-gray">
                <span>{sop.category}</span>
                {sop.revised && <><span>·</span><span>{sop.revised}</span></>}
            </div>

            {sop.summary && (
                <p className="mt-4 text-[15px] leading-relaxed text-black/70 dark:text-white/70">{sop.summary}</p>
            )}

            <MdtCard className="mt-4 p-5">
                <MdtRichText text={sop.body} className="text-[15px] leading-relaxed text-black dark:text-white" />
            </MdtCard>

            <div className="h-6" />
        </Scroller>
    );
}
