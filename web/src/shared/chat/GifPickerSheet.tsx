import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Sheet } from '@/ui/Sheet';
import { SearchBar } from '@/ui/SearchBar';
import { FadeImage } from '@/ui/FadeImage';
import { useTheme } from '@/stores/themeStore';
import { t } from '@/i18n';
import { fetchFeaturedGifs, fetchGifCategories, searchGifs, type GifCategory, type GifItem } from './gifsApi';

type View = 'browse' | 'featured' | 'search';

// Every keystroke used to be its own GIPHY search; let the typing settle first. Kept above the
// 300 ms server-side cooldown so a settled search is never answered with the previous payload.
const SEARCH_DEBOUNCE_MS = 350;

function tileGradient(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return `linear-gradient(135deg, hsl(${hue} 58% 56%), hsl(${(hue + 38) % 360} 60% 46%))`;
}

export function GifPickerSheet({ onSelect, onClose, forceDark = false }: {
    onSelect: (url: string) => void;
    onClose:  () => void;
    forceDark?: boolean;
}) {
    const { theme } = useTheme('theme');
    const isDark = forceDark || theme === 'dark';

    const [query,      setQuery]      = useState('');
    // What the search actually runs on: `query` follows the keystrokes, `term` only settles.
    const [term,       setTerm]       = useState('');
    const [view,       setView]       = useState<View>('browse');
    const [categories, setCategories] = useState<GifCategory[] | null | undefined>(undefined);
    const [gifs,       setGifs]       = useState<GifItem[]>([]);
    const [loading,    setLoading]    = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => { void fetchGifCategories().then(setCategories); }, []);

    useEffect(() => {
        if (view === 'browse') return;
        let active = true;
        setLoading(true);
        const run = view === 'featured' ? fetchFeaturedGifs() : searchGifs(term);
        void run.then(res => { if (active) { setGifs(res); setLoading(false); } });
        return () => { active = false; };
    }, [view, term]);

    useEffect(() => () => clearTimeout(debounce.current), []);

    function onType(value: string) {
        clearTimeout(debounce.current);
        setQuery(value);
        const next = value.trim();
        if (!next) { setView('browse'); return; }
        debounce.current = setTimeout(() => { setTerm(next); setView('search'); }, SEARCH_DEBOUNCE_MS);
    }

    // Both cancel a pending debounce: a tile tapped a keystroke later must not be overridden by
    // the half-typed term still in flight.
    function openCategory(value: string) { clearTimeout(debounce.current); setQuery(value); setTerm(value); setView('search'); }
    function openFeatured() { clearTimeout(debounce.current); setQuery('Featured'); setView('featured'); }

    const col0 = gifs.filter((_, i) => i % 2 === 0);
    const col1 = gifs.filter((_, i) => i % 2 !== 0);

    return (
        <Sheet onClose={onClose} forceDark={forceDark} className="font-sf bg-[#f2f2f2] dark:bg-surface">
            {() => (
                <>
                    <div className="shrink-0 px-3 pb-2 pt-5">
                        <SearchBar value={query} onChange={onType} placeholder={t('messages.searchGiphyPlaceholder', 'Search GIPHY')} />
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
                        {view === 'browse' ? (
                            categories === null ? (
                                <SetupHint isDark={isDark} />
                            ) : categories === undefined ? (
                                <Centered isDark={isDark}>{t('messages.loadingGifs', 'Loading…')}</Centered>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <SpecialTile label={t('messages.gifFeatured', 'Featured')} color="#34A0A4" onClick={openFeatured} />
                                    <SpecialTile label={t('messages.gifTrending', 'Trending')} color="#5B8DEF" onClick={() => openCategory('trending')} />
                                    {categories.map(cat => (
                                        <button
                                            key={cat.name}
                                            type="button"
                                            onClick={() => openCategory(cat.term)}
                                            className="relative h-[108px] overflow-hidden rounded-[12px] active:opacity-80"
                                            style={{ background: tileGradient(cat.name) }}
                                        >
                                            {cat.image && (
                                                <FadeImage src={cat.image} className="absolute inset-0 h-full w-full object-cover" />
                                            )}
                                            <div className="absolute inset-0 bg-black/30" />
                                            <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[16px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                                                {`#${cat.name.replace(/^#+/, '')}`}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )
                        ) : loading ? (
                            <Centered isDark={isDark}>{t('messages.loadingGifs', 'Loading…')}</Centered>
                        ) : gifs.length === 0 ? (
                            <Centered isDark={isDark}>{t('messages.noGifsFound', 'No GIFs found')}</Centered>
                        ) : (
                            <div className="flex gap-2">
                                {[col0, col1].map((col, ci) => (
                                    <div key={ci} className="flex flex-1 flex-col gap-2">
                                        {col.map(gif => (
                                            <button
                                                key={gif.id}
                                                type="button"
                                                onClick={() => gif.full && onSelect(gif.full)}
                                                className="block w-full overflow-hidden rounded-[8px] active:opacity-70"
                                                style={gif.preview ? undefined : { background: tileGradient(gif.id), height: 84 }}
                                            >
                                                {gif.preview && (
                                                    <FadeImage src={gif.preview} className="w-full object-cover" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </Sheet>
    );
}

function SpecialTile({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-[108px] items-center justify-center rounded-[12px] text-[17px] font-semibold text-white active:opacity-80"
            style={{ background: color }}
        >
            {label}
        </button>
    );
}

function Centered({ children, isDark }: { children: ReactNode; isDark: boolean }) {
    return (
        <div className="flex h-full items-center justify-center">
            <span className={`text-[13px] ${isDark ? 'text-white/35' : 'text-black/35'}`}>{children}</span>
        </div>
    );
}

function SetupHint({ isDark }: { isDark: boolean }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-8 text-center">
            <span className={`text-[14px] font-semibold ${isDark ? 'text-white/55' : 'text-black/55'}`}>{t('messages.gifSetupTitle', 'GIFs need a GIPHY key')}</span>
            <span className={`text-[12px] leading-snug ${isDark ? 'text-white/35' : 'text-black/40'}`}>
                {t('messages.gifSetupBody', 'Add a free GIPHY API key to {configPath} to enable the GIF picker.', { configPath: 'configs/server/apikeys.lua' })}
            </span>
        </div>
    );
}
