import { useMemo, useState } from 'react';
import { Music2 } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyState } from '@/ui/EmptyState';
import { t } from '@/i18n';
import { loadTracks, youtubeId, youtubeThumb, type Track } from '@/apps/music/data';
import { FadeImg } from './ui';

export function MusicPickerSheet({ myHandle, onSelect, onClose }: {
    myHandle?: string;
    onSelect:  (sound: string) => void;
    onClose:   () => void;
}) {
    const [query, setQuery] = useState('');
    const tracks = useMemo(() => loadTracks(), []);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return tracks;
        return tracks.filter(tr =>
            tr.title.toLowerCase().includes(q) || tr.artist.toLowerCase().includes(q));
    }, [tracks, query]);

    return (
        <Sheet
            onClose={onClose}
            forceDark
            top="18%"
            title={t('vibez.chooseSound', 'Choose a sound')}
            className="font-sf bg-[#141416]"
        >
            {({ close }) => (
                <>
                    <div className="shrink-0 px-4 pb-2">
                        <SearchBar
                            forceDark
                            value={query}
                            onChange={setQuery}
                            placeholder={t('vibez.searchLibrary', 'Search your library')}
                            pillClassName="gap-2 rounded-full bg-white/10 px-4 py-2.5"
                            iconClassName="h-4 w-4 text-white/60"
                            textClassName="text-[14px] text-white placeholder-white/45"
                        />
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2 pb-6">
                        <button
                            type="button"
                            onClick={() => {
                                onSelect(t('vibez.originalSound', 'original sound — {handle}', { handle: myHandle ?? 'you' }));
                                close();
                            }}
                            className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors active:bg-white/[0.06]"
                        >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] ring-1 ring-white/10">
                                <Music2 className="h-5 w-5 text-white" strokeWidth={2} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold text-white">
                                    {t('vibez.useOriginalSound', 'Use original sound')}
                                </span>
                                <span className="block truncate text-[13px] text-white/50">
                                    {t('vibez.recordedWithClip', 'The audio recorded with your clip')}
                                </span>
                            </span>
                        </button>

                        {tracks.length === 0 ? (
                            <div className="dark">
                                <EmptyState
                                    icon={Music2}
                                    title={t('vibez.noTracksTitle', 'No music yet')}
                                    subtitle={t('vibez.noTracks', 'Add tracks in the Music app and they will show up here.')}
                                    circleClassName="bg-white/10"
                                />
                            </div>
                        ) : shown.length === 0 ? (
                            <p className="px-4 pt-8 text-center text-[14px] text-white/45">
                                {t('vibez.noTracksMatch', 'Nothing matches that.')}
                            </p>
                        ) : shown.map(tr => (
                            <TrackRow
                                key={tr.id}
                                track={tr}
                                onPick={() => { onSelect(`${tr.title} — ${tr.artist}`); close(); }}
                            />
                        ))}
                    </div>
                </>
            )}
        </Sheet>
    );
}

function TrackRow({ track, onPick }: { track: Track; onPick: () => void }) {
    const vid = youtubeId(track.url);
    const art = track.thumb ?? (vid ? youtubeThumb(vid) : null);
    return (
        <button
            type="button"
            onClick={onPick}
            className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors active:bg-white/[0.06]"
        >
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.08] ring-1 ring-white/10">
                {art
                    ? <FadeImg src={art} className="h-full w-full object-cover" />
                    : (
                        <span className="flex h-full w-full items-center justify-center">
                            <Music2 className="h-5 w-5 text-white/60" strokeWidth={2} />
                        </span>
                    )}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">{track.title}</span>
                <span className="block truncate text-[13px] text-white/50">{track.artist}</span>
            </span>
        </button>
    );
}
