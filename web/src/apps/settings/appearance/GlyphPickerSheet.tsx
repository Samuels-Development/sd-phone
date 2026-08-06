import { memo, useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { UIEvent } from 'react';

import { t } from '@/i18n';
import { resolveDraftAppearance } from '@/stores/iconThemeStore';
import type { IconAppearance, IconThemeDraft } from '@/stores/iconThemeStore';
import { SearchBar } from '@/ui/SearchBar';
import { Sheet } from '@/ui/Sheet';
import { GLYPH_NAMES, glyphLabel } from './iconThemeCatalog';
import { ThemeTile } from './IconThemePreview';

const TILE = 66;
const STEP = 36;
const GROW_MS = 48;
const NEAR_END = 420;

const GlyphCell = memo(function GlyphCell({ name, look, selected }: {
    name:     string;
    look:     IconAppearance;
    selected: boolean;
}) {
    return (
        <>
            <span
                className="flex items-center justify-center rounded-[17px] p-[3px]"
                style={{ boxShadow: selected ? '0 0 0 2px #0a84ff' : undefined }}
            >
                <ThemeTile look={look} icon={name} label={name} size={TILE} />
            </span>
            <span
                className={`line-clamp-2 w-full px-1 text-center text-[13px] leading-[1.25] ${
                    selected ? 'font-semibold text-ios-blue' : 'text-ios-gray'
                }`}
            >
                {glyphLabel(name)}
            </span>
        </>
    );
});

export function GlyphPickerSheet({ draft, appId, accent, ownIcon, current, onSelect, onClear, onClose }: {
    draft:    IconThemeDraft;
    appId:    string;
    accent:   string;
    ownIcon:  string;
    current:  string | undefined;
    onSelect: (name: string) => void;
    onClear:  () => void;
    onClose:  () => void;
}) {
    const [query, setQuery] = useState('');
    const [cap, setCap] = useState(STEP);

    const look = useMemo(
        () => resolveDraftAppearance(draft, appId, accent),
        [draft, appId, accent],
    );

    const needle = query.trim().toLowerCase();
    const matches = useMemo(
        () => (needle === ''
            ? GLYPH_NAMES
            : GLYPH_NAMES.filter(name => name.includes(needle) || glyphLabel(name).toLowerCase().includes(needle))),
        [needle],
    );

    useEffect(() => { setCap(STEP); }, [needle]);

    useEffect(() => {
        if (cap >= matches.length) return;
        const id = window.setTimeout(() => setCap(c => c + STEP), GROW_MS);
        return () => window.clearTimeout(id);
    }, [cap, matches.length]);

    function onScroll(e: UIEvent<HTMLDivElement>) {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END) {
            setCap(c => (c < matches.length ? c + STEP : c));
        }
    }

    const shown = cap >= matches.length ? matches : matches.slice(0, cap);

    return (
        <Sheet
            onClose={onClose}
            fit="full"
            top={30}
            title={t('settings.iconOverrideSymbol', 'Symbol')}
            className="bg-base"
        >
            {({ close }) => (
                <>
                    <div className="shrink-0 px-4 pb-3">
                        <SearchBar
                            value={query}
                            onChange={setQuery}
                            placeholder={t('settings.iconOverrideSymbolSearch', 'Search symbols')}
                        />
                    </div>

                    <div onScroll={onScroll} className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                        <button
                            type="button"
                            onClick={() => { onClear(); close(); }}
                            className="mb-4 flex w-full items-center gap-3 rounded-[12px] bg-surface px-3 py-3 text-left active:opacity-70"
                        >
                            <ThemeTile look={look} icon={ownIcon} label={ownIcon} size={44} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[17px] font-normal text-black dark:text-white">
                                    {t('settings.iconOverrideOwnSymbol', "App's Own Symbol")}
                                </span>
                                <span className="block truncate text-[14px] text-ios-gray">
                                    {glyphLabel(ownIcon)}
                                </span>
                            </span>
                            {current === undefined && (
                                <Check className="h-[17px] w-[17px] shrink-0 text-ios-blue" strokeWidth={2.5} />
                            )}
                        </button>

                        {matches.length === 0 ? (
                            <p className="py-10 text-center text-[15px] text-ios-gray">
                                {t('settings.iconOverrideNoSymbols', 'No symbols match that search.')}
                            </p>
                        ) : (
                            <div className="grid grid-cols-3 gap-x-2 gap-y-5">
                                {shown.map(name => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => { onSelect(name); close(); }}
                                        className="flex flex-col items-center gap-2 active:opacity-70"
                                    >
                                        <GlyphCell name={name} look={look} selected={current === name} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </Sheet>
    );
}
