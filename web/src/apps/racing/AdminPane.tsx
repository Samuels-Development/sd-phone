import { useEffect, useState } from 'react';
import { Route, ShieldAlert, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Toggle } from '@/ui/Toggle';
import { cardSurface, panePad, rowMeta, rowTitle } from '@/ui/surfaces';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';

import { TRACKS_PER_PAGE } from './data';
import type { AdminTrackRow, TrackFlag } from './data';
import { racingAdminDelete, racingAdminSetFlag, racingAdminTracks } from './racingApi';
import { RACING_ACCENT } from './racingTheme';
import { useRacingSession } from './useRacingSession';

const DISARM_MS = 3000;

function FlagToggle({ label, on, disabled, onChange }: {
    label:    string;
    on:       boolean;
    disabled: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <span className="flex shrink-0 flex-col items-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ios-gray">{label}</span>
            <Toggle
                on={on}
                scale={0.62}
                disabled={disabled}
                activeColor={RACING_ACCENT}
                ariaLabel={label}
                onChange={onChange}
            />
        </span>
    );
}

function AdminTrackListRow({ row, busy, armed, onFlag, onDelete }: {
    row:      AdminTrackRow;
    busy:     boolean;
    armed:    boolean;
    onFlag:   (flag: TrackFlag, value: boolean) => void;
    onDelete: () => void;
}) {
    const meta = [
        row.author || t('racing.unknownAuthor', 'Unknown author'),
        t('racing.gateCount', '{gates} gates', { gates: row.gates }),
        t('racing.playCount', '{plays} plays', { plays: row.plays }),
        relTimeCompact(row.createdAt * 1000),
    ].join('  ·  ');

    return (
        <div className="flex w-full items-center gap-4 rounded-[10px] px-3 py-2.5">
            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`min-w-0 truncate ${rowTitle}`}>{row.name}</span>
                    <Pill tone="blue">
                        {row.mode === 'sprint' ? t('racing.sprint', 'Sprint') : t('racing.circuit', 'Circuit')}
                    </Pill>
                    {!row.published && <Pill tone="orange">{t('racing.hidden', 'Hidden')}</Pill>}
                </span>
                <span className={`block truncate ${rowMeta}`}>{meta}</span>
            </span>

            <FlagToggle
                label={t('racing.verified', 'Verified')}
                on={row.verified}
                disabled={busy}
                onChange={value => onFlag('verified', value)}
            />
            <FlagToggle
                label={t('racing.featured', 'Featured')}
                on={row.featured}
                disabled={busy}
                onChange={value => onFlag('featured', value)}
            />

            <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className={`inline-flex w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-[6px] text-[13px] font-semibold transition-colors duration-150 disabled:opacity-40 ${
                    armed
                        ? 'bg-ios-red text-white'
                        : 'text-ios-red hover:bg-ios-red/10 active:bg-ios-red/15'
                }`}
            >
                <Trash2 className="h-[13px] w-[13px]" strokeWidth={2.4} />
                {armed ? t('racing.confirmDelete', 'Confirm') : t('racing.delete', 'Delete')}
            </button>
        </div>
    );
}

export function AdminPane() {
    const { admin } = useRacingSession();

    const [query, setQuery] = useSessionState('racing:admin:query', '');
    const [page, setPage]   = useSessionState('racing:admin:page', 1);
    const [term, setTerm]   = useState(query.trim());
    const [armed, setArmed] = useState<number | null>(null);
    const [busy, setBusy]   = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, setPage]);

    useEffect(() => {
        if (armed === null) return;
        const id = window.setTimeout(() => setArmed(null), DISARM_MS);
        return () => window.clearTimeout(id);
    }, [armed]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => racingAdminTracks({ query: term, page }),
        [term, page],
        { enabled: admin },
    );

    const rows  = data?.rows ?? [];
    const total = data?.total ?? 0;

    if (!admin) {
        return (
            <div className={`flex min-h-0 flex-1 flex-col ${panePad}`}>
                <div className={`${cardSurface} flex min-h-0 flex-1 items-center justify-center`}>
                    <EmptyState
                        center
                        icon={ShieldAlert}
                        title={t('racing.adminOnly', 'Admins only')}
                        subtitle={t('racing.adminOnlySub', 'This tab needs racing admin permission on your account.')}
                    />
                </div>
            </div>
        );
    }

    async function setFlag(row: AdminTrackRow, flag: TrackFlag, value: boolean) {
        if (busy !== null) return;
        setArmed(null);
        setBusy(row.id);
        const envelope = await racingAdminSetFlag(row.id, flag, value);
        setBusy(null);
        if (!envelope.success) {
            setError(envelope.message ?? t('racing.adminFailed', 'That change could not be applied.'));
            return;
        }
        setError(null);
        refetch();
    }

    async function removeTrack(row: AdminTrackRow) {
        if (busy !== null) return;
        if (armed !== row.id) {
            setArmed(row.id);
            return;
        }
        setArmed(null);
        setBusy(row.id);
        const envelope = await racingAdminDelete(row.id);
        setBusy(null);
        if (!envelope.success) {
            setError(envelope.message ?? t('racing.adminFailed', 'That change could not be applied.'));
            return;
        }
        setError(null);
        refetch();
    }

    const empty = (
        <EmptyState
            center
            icon={Route}
            title={loading
                ? t('racing.loading', 'Loading')
                : term ? t('racing.noTrackMatches', 'No matches') : t('racing.noTracks', 'No tracks yet')}
            subtitle={loading
                ? undefined
                : term
                    ? t('racing.noTrackMatchesSub', 'No track matches that search.')
                    : t('racing.noTracksSub', 'Tracks built with the gate creator show up here, published or not.')}
        />
    );

    return (
        <div className={`flex min-h-0 flex-1 flex-col ${panePad}`}>
            <div className={`${cardSurface} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                <ListColumn
                    className="flex-1"
                    title={t('racing.allTracks', 'All tracks')}
                    count={total}
                    query={query}
                    onQuery={setQuery}
                    placeholder={t('racing.searchTracks', 'Track or author')}
                    isEmpty={settled && rows.length === 0}
                    empty={empty}
                    footer={(
                        <div className="shrink-0">
                            {error && (
                                <div className="px-4 pb-1.5 text-[12.5px] font-medium text-ios-red">{error}</div>
                            )}
                            <Pager page={page} pageSize={TRACKS_PER_PAGE} total={total} onPage={setPage} />
                        </div>
                    )}
                >
                    <div className="flex flex-col gap-0.5 px-2">
                        {rows.map(row => (
                            <AdminTrackListRow
                                key={row.id}
                                row={row}
                                busy={busy === row.id}
                                armed={armed === row.id}
                                onFlag={(flag, value) => { void setFlag(row, flag, value); }}
                                onDelete={() => { void removeTrack(row); }}
                            />
                        ))}
                    </div>
                </ListColumn>
            </div>
        </div>
    );
}
