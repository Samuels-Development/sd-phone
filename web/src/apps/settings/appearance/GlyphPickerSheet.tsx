import { useState } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { resolveDraftAppearance } from '@/stores/iconThemeStore';
import type { IconThemeDraft } from '@/stores/iconThemeStore';
import { SearchBar } from '@/ui/SearchBar';
import { Sheet } from '@/ui/Sheet';
import { GLYPH_NAMES, glyphLabel } from './iconThemeCatalog';
import { ThemeTile } from './IconThemePreview';

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
    const look = resolveDraftAppearance(draft, appId, accent);

    const needle = query.trim().toLowerCase();
    const matches = needle === ''
        ? GLYPH_NAMES
        : GLYPH_NAMES.filter(name => name.includes(needle) || glyphLabel(name).toLowerCase().includes(needle));

    return (
        <Sheet
            onClose={onClose}
            fit="full"
            top={30}
            title={t('settings.iconOverrideSymbol', 'Symbol')}
            className="bg-[#d4d4d4] dark:bg-base"
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

                    <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                        <button
                            type="button"
                            onClick={() => { onClear(); close(); }}
                            className="mb-4 flex w-full items-center gap-3 rounded-[12px] bg-[#e5e5e5] px-3 py-3 text-left active:opacity-70 dark:bg-surface"
                        >
                            <ThemeTile look={look} icon={ownIcon} label={ownIcon} size={40} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[17px] font-normal text-black dark:text-white">
                                    {t('settings.iconOverrideOwnSymbol', "App's Own Symbol")}
                                </span>
                                <span className="block truncate text-[13px] text-ios-gray">
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
                            <div className="grid grid-cols-4 gap-y-4">
                                {matches.map(name => {
                                    const on = current === name;
                                    return (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => { onSelect(name); close(); }}
                                            className="flex flex-col items-center gap-1.5 active:opacity-70"
                                        >
                                            <span
                                                className="flex items-center justify-center rounded-[14px] p-[3px]"
                                                style={{ boxShadow: on ? '0 0 0 2px #0a84ff' : undefined }}
                                            >
                                                <ThemeTile look={look} icon={name} label={name} size={54} />
                                            </span>
                                            <span className={`w-full truncate px-1 text-center text-[11px] ${on ? 'font-semibold text-ios-blue' : 'text-ios-gray'}`}>
                                                {glyphLabel(name)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </Sheet>
    );
}
