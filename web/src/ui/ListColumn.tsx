import { Children, type ReactNode } from 'react';

import { SearchBar } from '@/ui/SearchBar';
import { Scroller } from '@/ui/Scroller';
import { columnTitle } from './surfaces';

export interface ListColumnSearch {
    value:        string;
    onChange:     (value: string) => void;
    placeholder?: string;
}

export function ListColumn({
    title, count, action, search, query, onQuery, placeholder, isEmpty, empty, footer,
    minWidth = 268, className = '', children,
}: {
    title:        string;
    count?:       number;
    action?:      ReactNode;
    search?:      ListColumnSearch;
    query?:       string;
    onQuery?:     (value: string) => void;
    placeholder?: string;
    isEmpty?:     boolean;
    empty?:       ReactNode;
    footer?:      ReactNode;
    minWidth?:    number;
    className?:   string;
    children:     ReactNode;
}) {
    const field: ListColumnSearch | undefined = search
        ?? (query !== undefined && onQuery !== undefined
            ? { value: query, onChange: onQuery, placeholder }
            : undefined);

    const showEmpty = !!empty && (isEmpty ?? Children.count(children) === 0);

    return (
        <div className={`flex min-h-0 flex-1 flex-col ${className}`} style={{ minWidth }}>
            <div className="flex min-h-[26px] shrink-0 items-center gap-2 px-4 pt-4">
                <h2 className={`min-w-0 truncate ${columnTitle}`}>{title}</h2>
                {count !== undefined && (
                    <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-[1px] text-[12px] font-semibold tabular-nums text-ios-gray dark:bg-white/[0.10]">
                        {count}
                    </span>
                )}
                <span className="flex-1" />
                {action}
            </div>

            {field && (
                <div className="shrink-0 px-4 pt-2.5">
                    <SearchBar
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={field.placeholder}
                        pillClassName="gap-2 rounded-[9px] bg-black/[0.05] px-2.5 py-[6px] dark:bg-white/[0.08]"
                        iconClassName="h-[15px] w-[15px] text-black/45 dark:text-white/45"
                        textClassName="text-[14px] font-medium text-black placeholder-black/40 dark:text-white dark:placeholder-white/40"
                    />
                </div>
            )}

            {showEmpty ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">{empty}</div>
            ) : (
                <Scroller className="min-h-0 flex-1 pb-2 pt-2">{children}</Scroller>
            )}

            {footer}
        </div>
    );
}
