import { useMemo } from 'react';
import { SearchX, SquarePen, StickyNote } from 'lucide-react';

import { useSessionState } from '@/hooks/useSessionState';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyState } from '@/ui/EmptyState';
import { formatRelativeDate, noteTitle, notePreview, noteHasContent } from './data';
import type { Note } from './data';
import { t } from '@/i18n';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

interface Props {
    notes:     Note[];
    onOpen:    (id: string) => void;
    onCompose: () => void;
}

export function NotesList({ notes, onOpen, onCompose }: Props) {
    const [query, setQuery] = useSessionState('notes:query', '');

    const sorted = useMemo(() => {
        const list = notes
            .filter(noteHasContent)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const q = query.trim().toLowerCase();
        if (!q) return list;
        return list.filter(n =>
            noteTitle(n).toLowerCase().includes(q)
            || n.body.toLowerCase().includes(q),
        );
    }, [notes, query]);

    return (
        <div className="absolute inset-0 flex flex-col bg-base text-black dark:text-white">
            <StatusBarSpacer />

            <div className="flex items-center justify-between px-5 pb-1 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight">{t('notes.appTitle', 'Notes')}</h1>
                <button type="button" onClick={onCompose} aria-label={t('notes.newNoteAria', 'New note')} className="text-ios-blue active:opacity-60">
                    <SquarePen className="h-[24px] w-[24px]" strokeWidth={2} />
                </button>
            </div>

            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-3" />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                {sorted.length === 0 ? (
                    query
                        ? <EmptyState icon={SearchX} title={t('notes.noResults', 'No Results')} subtitle={t('notes.noResultsSub', 'No notes match your search.')} />
                        : <EmptyState icon={StickyNote} title={t('notes.noNotes', 'No Notes')} subtitle={t('notes.noNotesSub', 'Tap the pencil to write your first note.')} />
                ) : (
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        {sorted.map((n, i) => (
                            <div key={n.id} className="relative">
                                <button
                                    type="button"
                                    onClick={() => onOpen(n.id)}
                                    className="flex w-full flex-col items-start gap-0.5 px-4 py-[13px] text-left active:bg-black/5 dark:active:bg-white/5"
                                >
                                    <div className="w-full truncate pr-2 text-[21px] font-semibold">
                                        {noteTitle(n)}
                                    </div>
                                    <div className="flex w-full items-baseline gap-2">
                                        <span className="shrink-0 text-[16.5px] text-ios-gray">
                                            {formatRelativeDate(n.updatedAt)}
                                        </span>
                                        <span className="truncate text-[16.5px] text-ios-gray">
                                            {notePreview(n)}
                                        </span>
                                    </div>
                                </button>
                                {i < sorted.length - 1 && (
                                    <div className="pointer-events-none mx-[6%] h-[0.4px] bg-black/15 dark:bg-white/15" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {sorted.length > 0 && (
                <div className="shrink-0 pb-14 pt-1 text-center text-[18px] font-semibold text-black dark:text-white">
                    {sorted.length} {sorted.length === 1 ? t('notes.noteSingular', 'Note') : t('notes.notePlural', 'Notes')}
                </div>
            )}
        </div>
    );
}
