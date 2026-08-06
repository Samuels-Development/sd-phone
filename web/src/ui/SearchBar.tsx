import { Search } from 'lucide-react';
import type { CSSProperties } from 'react';

import { t } from '@/i18n';

interface SearchBarProps {
    value:          string;
    onChange:       (value: string) => void;
    placeholder?:   string;
    className?:     string;
    autoFocus?:     boolean;
    forceDark?:     boolean;
    pillClassName?: string;
    pillStyle?:     CSSProperties;
    iconClassName?: string;
    textClassName?: string;
    caretColor?:    string;
}

export function SearchBar({ value, onChange, placeholder = t('common.search', 'Search'), className, autoFocus, forceDark, pillClassName, pillStyle, iconClassName, textClassName, caretColor }: SearchBarProps) {
    const pillTheme = forceDark ? 'bg-surface'                     : 'bg-surface dark:bg-white/10';
    const iconTheme = forceDark ? 'text-white/60'                   : 'text-black/60 dark:text-white/60';
    const field     = forceDark ? 'text-white placeholder-white/55' : 'text-black placeholder-black/55 dark:text-white dark:placeholder-white/55';
    const clear     = forceDark ? 'text-white/45'                   : 'text-black/40 dark:text-white/45';

    const pill = pillClassName ?? `gap-2 rounded-[10px] px-3 py-[9px] ${pillTheme}`;
    const icon = iconClassName ?? `h-[18px] w-[18px] ${iconTheme}`;
    const text = textClassName ?? `text-[17px] font-medium ${field}`;

    const bar = (
        <div className={`flex items-center ${pill} ${className ?? ''}`} style={pillStyle}>
            <Search className={`shrink-0 ${icon}`} strokeWidth={2.75} />
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') onChange(''); }}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className={`min-w-0 flex-1 bg-transparent outline-none ${text}`}
                style={caretColor ? { caretColor } : undefined}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label={t('common.clearSearch', 'Clear search')}
                    className={`shrink-0 text-[24px] font-medium leading-none active:opacity-60 ${clear}`}
                >
                    ×
                </button>
            )}
        </div>
    );
    return forceDark ? <div className="dark contents">{bar}</div> : bar;
}
