import { useState } from 'react';
import { Clock } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { GroupCard } from '@/ui/ListGroup';
import { SearchBar } from '@/ui/SearchBar';
import { FileRow } from './DocRow';
import { RECENTS_LIMIT, type DocFile, type DocList } from './data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

interface Props {
    list:      DocList;
    onOpenDoc: (doc: DocFile) => void;
    onMoreDoc: (doc: DocFile) => void;
}

export function Recents({ list, onOpenDoc, onMoreDoc }: Props) {
    const [query, setQuery] = useState('');

    const recents = [...list.docs]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, RECENTS_LIMIT);

    const q = query.trim().toLowerCase();
    const shown = q ? recents.filter(d => d.name.toLowerCase().includes(q)) : recents;

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base text-black dark:text-white">
            <StatusBarSpacer />

            <div className="px-4 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight">{t('documents.recents', 'Recents')}</h1>
            </div>
            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-3 mt-2" />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                {shown.length === 0 ? (
                    <EmptyState
                        icon={Clock}
                        title={q ? t('documents.noResults', 'No Results') : t('documents.noRecents', 'No Recents')}
                        subtitle={q
                            ? t('documents.noResultsSub', 'No documents match "{q}".', { q: query.trim() })
                            : t('documents.noRecentsSub', 'Recently edited documents will show up here.')}
                    />
                ) : (
                    <GroupCard>
                        {shown.map((doc, i) => (
                            <FileRow
                                key={doc.id}
                                doc={doc}
                                onOpen={() => onOpenDoc(doc)}
                                onMore={() => onMoreDoc(doc)}
                                divider={i < shown.length - 1}
                            />
                        ))}
                    </GroupCard>
                )}
            </div>
        </div>
    );
}
