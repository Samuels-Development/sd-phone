import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, Download, MapPin, Plus, Route, Search, Star } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Select, type SelectOption } from '@/ui/Select';
import { Sheet } from '@/ui/Sheet';
import { cardRow, cardRowPad, listStack, rowHover, rowMeta, rowTitle } from '@/ui/surfaces';
import { device } from '@device';

const isPhone = device.id === 'phone';

import { TrackDetail, modeLabel } from './TrackDetail';
import { racingImportTracks, racingStartCreator, racingTracks, racingWaypoint } from './racingApi';
import { RACING_ACCENT, racingAccentFill, racingAccentText, racingJsonField, racingJsonPlaceholder, racingSheetHint } from './racingTheme';
import { useRacingSession } from './useRacingSession';
import { TRACKS_PER_PAGE, type TrackRow, type TrackSort } from './data';

const MASTER_WIDTH = 408;

function sortOptions(): SelectOption<TrackSort>[] {
    return [
        { value: 'newest', label: t('racing.sortNewest', 'Newest first') },
        { value: 'name',   label: t('racing.sortName', 'Name A to Z') },
        { value: 'plays',  label: t('racing.sortPlays', 'Most played') },
        { value: 'gates',  label: t('racing.sortGates', 'Most checkpoints') },
    ];
}

function FilterChip({ label, on, onChange }: {
    label:    string;
    on:       boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={() => onChange(!on)}
            className={`flex shrink-0 items-center gap-1 rounded-[9px] px-2 py-1 text-[13px] font-medium transition-colors duration-150 ${on
                ? racingAccentFill
                : 'bg-black/[0.05] text-ios-gray ring-1 ring-inset ring-black/[0.07] hover:bg-black/[0.08] dark:bg-white/[0.07] dark:ring-white/[0.10] dark:hover:bg-white/[0.10]'}`}
        >
            <Check className="h-[13px] w-[13px] shrink-0" strokeWidth={2.6} />
            {label}
        </button>
    );
}

function TrackListRow({ track, selected, onPress, onWaypoint }: {
    track:      TrackRow;
    selected:   boolean;
    onPress:    () => void;
    onWaypoint: () => void;
}) {
    const meta = [
        modeLabel(track.mode),
        t('racing.checkpointCount', '{n} CP', { n: track.gates }),
        t('racing.playCount', '{n} plays', { n: track.plays }),
        track.author,
    ].filter(Boolean).join('  ·  ');

    return (
        <div className={`flex w-full items-center ${
            isPhone ? cardRow : `rounded-[10px] ${rowHover}`
        } ${selected ? 'bg-ios-blue/10' : ''}`}>
            <button
                type="button"
                onClick={onPress}
                className={`flex min-w-0 flex-1 items-center gap-2.5 text-left ${cardRowPad}`}
            >
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`min-w-0 truncate ${rowTitle}`}>{track.name}</span>
                        {track.verified && (
                            <BadgeCheck
                                className={`h-[15px] w-[15px] shrink-0 ${racingAccentText}`}
                                strokeWidth={2.4}
                                aria-label={t('racing.verified', 'Verified')}
                            />
                        )}
                        {track.featured && (
                            <Star
                                className="h-[13px] w-[13px] shrink-0 fill-ios-orange text-ios-orange"
                                strokeWidth={2.2}
                                aria-label={t('racing.featured', 'Featured')}
                            />
                        )}
                    </span>
                    <span className={`mt-0.5 block truncate ${rowMeta}`}>{meta}</span>
                </span>
            </button>
            <button
                type="button"
                disabled={!track.coords}
                onClick={onWaypoint}
                aria-label={t('racing.setWaypoint', 'Set waypoint')}
                className="mr-1.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors duration-150 hover:bg-black/[0.06] hover:text-black active:opacity-60 disabled:cursor-default disabled:opacity-30 dark:hover:bg-white/[0.10] dark:hover:text-white"
            >
                <MapPin className="h-[15px] w-[15px]" strokeWidth={2.2} />
            </button>
        </div>
    );
}

const PLACEHOLDER_JSON = `{
  "name": "Vinewood Sprint",
  "mode": "circuit",
  "gates": [ ... ]
}`;

function CreateTrackSheet({ onClose, needsApproval }: { onClose: () => void; needsApproval: boolean }) {
    const [busy, setBusy] = useState(false);

    async function start() {
        setBusy(true);
        await racingStartCreator();
        setBusy(false);
        onClose();
    }

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            title={t('racing.createTrack', 'Create track')}
            className="font-sf bg-base text-black dark:text-white"
        >
            {() => (
                <div className="flex flex-col gap-3 px-4 pb-5">
                    <p className={racingSheetHint}>
                        {t('racing.createTrackHint', 'You will place gates in the world to define your track. Drive to a start line and begin placing checkpoints with E, undo with X, and save when done.')}
                    </p>
                    {needsApproval && (
                        <p className={racingSheetHint}>
                            {t('racing.createTrackApprovalHint', 'Your track will be reviewed by an admin before other players can race it.')}
                        </p>
                    )}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => { void start(); }}
                        className="h-[44px] w-full rounded-[12px] text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-40"
                        style={{ backgroundColor: RACING_ACCENT }}
                    >
                        {busy ? t('racing.starting', 'Starting…') : t('racing.startCreator', 'Start creating')}
                    </button>
                </div>
            )}
        </Sheet>
    );
}

function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [text, setText]     = useState('');
    const [busy, setBusy]     = useState(false);
    const [error, setError]   = useState('');
    const [failed, setFailed] = useState<{ index: number; name: string; reason: string }[]>([]);

    async function submit(close: () => void) {
        if (busy || !text.trim()) return;
        setBusy(true);
        setError('');
        setFailed([]);

        const res = await racingImportTracks(text);
        setBusy(false);
        if (!res.success) {
            setError(res.message ?? t('racing.importFailed', 'Nothing could be imported.'));
            return;
        }
        if (res.data && res.data.failed.length > 0) setFailed(res.data.failed);
        onDone();
        if (!res.data || res.data.failed.length === 0) close();
    }

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            title={t('racing.importTracks', 'Import tracks')}
            className="font-sf bg-base text-black dark:text-white"
        >
            {({ close }) => (
                <div className="flex flex-col gap-3 px-4 pb-5">
                    <p className={racingSheetHint}>
                        {t('racing.importHint', 'Paste a single track, or a whole list of them. To get this format, open any track and tap JSON.')}
                    </p>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        spellCheck={false}
                        placeholder={PLACEHOLDER_JSON}
                        className={`${racingJsonField} ${racingJsonPlaceholder}`}
                    />
                    {error && <p className="text-[13px] text-ios-red">{error}</p>}
                    {failed.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {failed.map(f => (
                                <p key={`${f.index}-${f.name}`} className="text-[12.5px] text-ios-orange">
                                    {f.name || `#${f.index}`}: {f.reason}
                                </p>
                            ))}
                        </div>
                    )}
                    <button
                        type="button"
                        disabled={busy || !text.trim()}
                        onClick={() => { void submit(close); }}
                        className="h-[44px] w-full rounded-[12px] text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-40"
                        style={{ backgroundColor: RACING_ACCENT }}
                    >
                        {busy ? t('racing.importing', 'Importing…') : t('racing.import', 'Import')}
                    </button>
                </div>
            )}
        </Sheet>
    );
}

export function TracksPane() {
    const { creator, creatorNeedsApproval } = useRacingSession();
    const [query, setQuery]       = useSessionState('racing:tracks:query', '');
    const [sort, setSort]         = useSessionState<TrackSort>('racing:tracks:sort', 'newest');
    const [verified, setVerified] = useSessionState('racing:tracks:verified', false);
    const [page, setPage]         = useSessionState('racing:tracks:page', 1);
    const [selected, setSelected] = useSessionState<number | null>('racing:tracks:selected', null);
    const [term, setTerm]         = useState(query.trim());
    const [creating, setCreating] = useState(false);
    const [importing, setImporting] = useState(false);
    const [reload, setReload]       = useState(0);

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, sort, verified, setPage]);

    const { data, loading, settled } = useAsyncData(
        () => racingTracks({ query: term, sort, verifiedOnly: verified, page }),
        [term, sort, verified, page, reload],
    );

    const rows  = data?.rows ?? [];
    const total = data?.total ?? 0;

    const options = useMemo(sortOptions, []);

    const empty = (
        <EmptyState
            center
            icon={loading ? Route : Search}
            title={loading
                ? t('racing.loading', 'Loading')
                : term
                    ? t('racing.noTrackMatches', 'No matches')
                    : verified
                        ? t('racing.noVerifiedTracks', 'No verified tracks yet')
                        : t('racing.noTracks', 'No tracks recorded yet')}
            subtitle={loading
                ? undefined
                : term
                    ? t('racing.noTrackMatchesSub', 'No track on the board matches that search.')
                    : verified
                        ? t('racing.noVerifiedTracksSub', 'Turn the verified filter off to see tracks that are still waiting on review.')
                        : t('racing.noTracksSub', 'Tracks are recorded in the world with the gate creator, then published here.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('racing.tracks', 'Tracks')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('racing.searchTracks', 'Track or author')}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            action={
                <div className="flex gap-1">
                    {creator && (
                        <button
                            type="button"
                            onClick={() => setCreating(true)}
                            aria-label={t('racing.createTrack', 'Create track')}
                            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors duration-150 hover:bg-black/[0.06] hover:text-black active:opacity-60 dark:hover:bg-white/[0.10] dark:hover:text-white"
                        >
                            <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setImporting(true)}
                        aria-label={t('racing.importTracks', 'Import tracks')}
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors duration-150 hover:bg-black/[0.06] hover:text-black active:opacity-60 dark:hover:bg-white/[0.10] dark:hover:text-white"
                    >
                        <Download className="h-[15px] w-[15px]" strokeWidth={2.2} />
                    </button>
                </div>
            }
            filters={
                <>
                    <Select
                        size="xs"
                        value={sort}
                        onChange={setSort}
                        options={options}
                        className={isPhone ? 'w-[128px]' : 'w-[136px]'}
                        ariaLabel={t('racing.sortTracks', 'Sort tracks')}
                    />
                    <FilterChip
                        label={t('racing.verifiedOnly', 'Verified')}
                        on={verified}
                        onChange={setVerified}
                    />
                </>
            }
            footer={<Pager page={page} pageSize={TRACKS_PER_PAGE} total={total} onPage={setPage} />}
        >
            <div className={isPhone ? listStack : "flex flex-col gap-0.5"}>
                {rows.map(row => (
                    <TrackListRow
                        key={row.id}
                        track={row}
                        selected={row.id === selected}
                        onPress={() => setSelected(row.id)}
                        onWaypoint={() => { if (row.coords) void racingWaypoint(row.coords.x, row.coords.y); }}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <>
            <MasterDetail
                master={master}
                masterWidth={MASTER_WIDTH}
                hasDetail={selected !== null}
                detail={selected !== null ? <TrackDetail key={selected} trackId={selected} /> : undefined}
                placeholder={
                    <EmptyState
                        center
                        icon={Route}
                        title={t('racing.pickTrack', 'No track selected')}
                        subtitle={t('racing.pickTrackSub', 'Pick a track to see its record board, its route on the map, and to open a race on it.')}
                    />
                }
                onCloseDetail={() => setSelected(null)}
            />
            {creating && (
                <CreateTrackSheet
                    onClose={() => setCreating(false)}
                    needsApproval={creatorNeedsApproval}
                />
            )}
            {importing && (
                <ImportSheet
                    onClose={() => setImporting(false)}
                    onDone={() => { setPage(1); setReload(n => n + 1); }}
                />
            )}
        </>
    );
}
