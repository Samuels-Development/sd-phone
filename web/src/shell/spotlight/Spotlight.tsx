import { useEffect, useMemo, useRef, useState } from 'react';

import { device } from '@device';

import { t, appLabel, pluralSuffix } from '@/i18n';
import type { AppDef } from '@/core/types';
import { SearchBar } from '@/ui/SearchBar';
import { filterSettingsGroups, getSettingsGroups, pageForRow } from '@/apps/settings/data';
import type { SettingsRowDef } from '@/apps/settings/data';
import { useSettingsVisibility } from '@/apps/settings/useSettingsVisibility';
import { useContactsStore } from '@/stores/contactsStore';
import { useMusicLibrary } from '@/stores/musicLibraryStore';
import { useTheme } from '@/stores/themeStore';
import { shellHostsPet } from '@/shell/chassis';
import { shellFor } from '@/shell/shells';
import { requestOpenAt, requestOpenMail } from '@/shell/deeplink';
import { evaluateExpression } from './calc';
import { rankBy } from './localIndex';
import { createSearchRunner } from './searchRunner';
import { searchRemote, SOURCE_APP } from './spotlightApi';
import type { GenericHit, RemoteResults, SearchSource } from './spotlightApi';
import { SpotlightResults } from './SpotlightResults';

const SPOTLIGHT_PULL_FULL = 140;

export const SPOTLIGHT_PULL_COMMIT = 70;

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function material(reveal: number): string {
    return `blur(${(24 * reveal).toFixed(1)}px) saturate(${(100 + 80 * reveal).toFixed(0)}%)`;
}

interface SpotlightProps {
    apps:        AppDef[];
    installableApps?: AppDef[];
    open:        boolean;
    pull:        number;
    onLaunchApp: (app: AppDef, origin: { x: number; y: number }) => void;
    onClose:     () => void;
    onHidden:    () => void;
}

export function Spotlight({ apps, installableApps, open, pull, onLaunchApp, onClose, onHidden }: SpotlightProps) {
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const tracking = !open && pull > 0;
    const reveal = open ? 1 : Math.min(1, pull / SPOTLIGHT_PULL_FULL);

    useEffect(() => {
        const input = rootRef.current?.querySelector('input');
        if (open) input?.focus();
        else if (input && document.activeElement === input) input.blur();
    }, [open]);

    useEffect(() => {
        if (open || pull > 0) return;
        const id = window.setTimeout(onHidden, 440);
        return () => window.clearTimeout(id);
    }, [open, pull, onHidden]);

    const [remote, setRemote] = useState<{ q: string; results: RemoteResults | null }>({ q: '', results: null });
    const visibility = useSettingsVisibility();
    const { shell } = useTheme('shell');
    const petHost = shellHostsPet(shellFor(shell, device.id));

    const sources = useMemo<SearchSource[]>(() => {
        const installed = new Set(apps.map(a => a.id));
        return (Object.keys(SOURCE_APP) as SearchSource[]).filter(s => installed.has(SOURCE_APP[s]));
    }, [apps]);
    const sourceKey = sources.join(',');

    const queryRef = useRef(query);
    queryRef.current = query;

    const runner = useRef<{ update(q: string): void; dispose(): void } | null>(null);
    useEffect(() => {
        const list = sourceKey ? sourceKey.split(',') as SearchSource[] : [];
        const r = createSearchRunner<RemoteResults>(q => searchRemote(q, list), (q, results) => setRemote({ q, results }));
        runner.current = r;
        r.update(queryRef.current);
        return () => r.dispose();
    }, [sourceKey]);

    useEffect(() => { void useContactsStore.getState().load(); }, []);

    function onQuery(next: string) {
        setQuery(next);
        runner.current?.update(next);
    }

    const trimmed = query.trim();
    const appHits = useMemo(
        () => (trimmed ? rankBy(apps, trimmed, a => [appLabel(a)], 4) : []),
        [apps, trimmed],
    );
    const settingsHits = useMemo<SettingsRowDef[]>(() => {
        if (!trimmed || !apps.some(a => a.id === 'settings')) return [];
        const rows = filterSettingsGroups(getSettingsGroups(), visibility).flatMap(g => g.rows)
            .filter(r => petHost || r.id !== 'island-pet');
        return rankBy(rows, trimmed, r => [r.label, r.subtitle ?? '', r.keywords ?? ''], 3);
    }, [apps, trimmed, visibility, petHost]);

    const calc = useMemo(
        () => (trimmed && apps.some(a => a.id === 'calculator') ? evaluateExpression(trimmed) : null),
        [apps, trimmed],
    );

    const installableHits = useMemo<AppDef[]>(
        () => (trimmed && installableApps?.length ? rankBy(installableApps, trimmed, a => [appLabel(a)], 3) : []),
        [installableApps, trimmed],
    );

    const musicTracks = useMusicLibrary(s => s.tracks);
    const musicFolders = useMusicLibrary(s => s.folders);
    const musicHits = useMemo<GenericHit[]>(() => {
        if (!trimmed || !apps.some(a => a.id === 'music')) return [];
        const playlists = rankBy(musicFolders, trimmed, f => [f.name], 3)
            .map(f => ({ id: f.id, title: f.name, subtitle: t('music.playlistSongCount', 'Playlist · {count} song{plural}', { count: f.trackIds.length, plural: pluralSuffix(f.trackIds.length) }), extra: 'playlist' }));
        const songs = rankBy(musicTracks, trimmed, tr => [tr.title, tr.artist], 3)
            .map(tr => ({ id: tr.id, title: tr.title, subtitle: tr.artist, extra: 'song' }));
        return [...playlists, ...songs];
    }, [apps, trimmed, musicFolders, musicTracks]);

    const settled = remote.q === trimmed;

    function openAndClose(action: () => void) {
        action();
        onClose();
    }

    return (
        <div ref={rootRef} className={`absolute inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} onPointerDown={e => e.stopPropagation()}>
            <div
                className="absolute"
                style={{
                    inset: -72,
                    backdropFilter: material(reveal),
                    WebkitBackdropFilter: material(reveal),
                    transition: tracking ? 'none' : `backdrop-filter 420ms ${EASE}, -webkit-backdrop-filter 420ms ${EASE}`,
                }}
            />
            <div
                className="absolute inset-0 bg-black/[0.16] dark:bg-black/45"
                style={{ opacity: reveal, transition: tracking ? 'none' : `opacity 420ms ${EASE}` }}
            />
            <div
                className="absolute inset-0 flex flex-col"
                style={{
                    opacity: reveal,
                    transform: `translateY(${((reveal - 1) * 44).toFixed(1)}px)`,
                    transition: tracking ? 'none' : `opacity 320ms ${EASE}, transform 420ms ${EASE}`,
                }}
            >
                <div className="flex items-center gap-3 px-4 pt-[58px]">
                    <SearchBar
                        value={query}
                        onChange={onQuery}
                        className="flex-1"
                        pillClassName="h-[40px] gap-[7px] rounded-[12px] bg-white/70 px-[12px] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.65)] dark:bg-white/[0.18] dark:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.14)]"
                        iconClassName="h-[18px] w-[18px] text-black/55 dark:text-white/60"
                        textClassName="text-[17px] text-label placeholder-black/50 dark:placeholder-white/55"
                    />
                    <button type="button" onClick={onClose} className="text-[17px] text-ios-blue active:opacity-60">
                        {t('spotlight.cancel', 'Cancel')}
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
                    <SpotlightResults
                        query={trimmed}
                        apps={apps}
                        appHits={appHits}
                        settingsHits={settingsHits}
                        calc={calc}
                        installableHits={installableHits}
                        musicHits={musicHits}
                        remote={remote.results}
                        settled={trimmed.length >= 2 && settled}
                        onLaunchApp={(app, origin) => openAndClose(() => onLaunchApp(app, origin))}
                        onOpenSetting={row => openAndClose(() => requestOpenAt({ app: 'settings', page: pageForRow(row.id) }))}
                        onOpenContact={hit => openAndClose(() => requestOpenAt({ app: 'phone', contactId: hit.id }))}
                        onOpenMessage={hit => openAndClose(() => requestOpenAt({ app: 'messages', conversationId: hit.conversationId }))}
                        onOpenMail={hit => openAndClose(() => requestOpenMail({ message: { folder: hit.folder, msgId: hit.id, accountId: hit.accountId } }))}
                        onOpenNote={hit => openAndClose(() => requestOpenAt({ app: 'notes', noteId: hit.id }))}
                        onOpenInstallable={app => openAndClose(() => requestOpenAt({ app: 'appstore', appId: app.id }))}
                        onOpenHit={openAndClose}
                    />
                </div>
            </div>
        </div>
    );
}
