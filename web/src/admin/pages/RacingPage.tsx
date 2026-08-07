import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Flag, Star, Trash2 } from 'lucide-react';
import clsx from 'clsx';

import { racingAdminDelete, racingAdminSetFlag, racingAdminTracks } from '@/apps/racing/racingApi';
import type { AdminTrackRow, TrackFlag } from '@/apps/racing/data';
import { Badge, Btn, Card, CenterNote, ConfirmModal, Input, Spinner } from '../ui';

const PAGE_SIZE = 25;

function modeLabel(mode: string): string {
    return mode === 'sprint' ? 'Sprint' : 'Circuit';
}

function FlagBtn({ on, label, icon, busy, onToggle }: {
    on:       boolean;
    label:    string;
    icon:     React.ReactNode;
    busy:     boolean;
    onToggle: () => void;
}) {
    return (
        <Btn
            variant={on ? 'primary' : 'ghost'}
            disabled={busy}
            onClick={onToggle}
            title={on ? `Remove ${label.toLowerCase()}` : `Mark ${label.toLowerCase()}`}
            className="min-w-[104px]"
        >
            {icon}
            {label}
        </Btn>
    );
}

export function RacingPage({ onToast }: { onToast: (text: string, error?: boolean) => void }) {
    const [query, setQuery]     = useState('');
    const [term, setTerm]       = useState('');
    const [page, setPage]       = useState(1);
    const [rows, setRows]       = useState<AdminTrackRow[]>([]);
    const [total, setTotal]     = useState(0);
    const [loading, setLoading] = useState(true);
    const [settled, setSettled] = useState(false);
    const [busy, setBusy]       = useState<number | null>(null);
    const [confirm, setConfirm] = useState<AdminTrackRow | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => { setTerm(query.trim()); setPage(1); }, 250);
        return () => window.clearTimeout(id);
    }, [query]);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await racingAdminTracks({ query: term, page });
        setRows(res.rows);
        setTotal(res.total);
        setLoading(false);
        setSettled(true);
    }, [term, page]);

    useEffect(() => { void load(); }, [load]);

    const toggleFlag = useCallback(async (row: AdminTrackRow, flag: TrackFlag, value: boolean) => {
        setBusy(row.id);
        const res = await racingAdminSetFlag(row.id, flag, value);
        setBusy(null);
        if (!res.success) {
            onToast(res.message ?? 'That change was refused.', true);
            return;
        }
        onToast(`${row.name} ${value ? 'marked' : 'unmarked'} ${flag}.`);
        void load();
    }, [load, onToast]);

    const remove = useCallback(async (row: AdminTrackRow) => {
        setBusy(row.id);
        const res = await racingAdminDelete(row.id);
        setBusy(null);
        setConfirm(null);
        if (!res.success) {
            onToast(res.message ?? 'That track could not be deleted.', true);
            return;
        }
        onToast(`${row.name} deleted.`);
        void load();
    }, [load, onToast]);

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Input
                    value={query}
                    onChange={setQuery}
                    placeholder="Filter tracks by name or author"
                />
                <span className="shrink-0 text-[12px] text-zinc-500">{total} tracks</span>
            </div>

            {loading && !settled && <CenterNote><Spinner /></CenterNote>}

            {settled && rows.length === 0 && (
                <CenterNote>
                    <Flag size={15} className="mr-1.5 inline" />
                    {term
                        ? 'No track matches that search.'
                        : 'No tracks recorded yet. They are drawn in the world with the gate creator.'}
                </CenterNote>
            )}

            {rows.map(row => (
                <Card key={row.id}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-[14px] font-semibold text-zinc-100">{row.name}</span>
                                {row.verified && <Badge tone="green">Verified</Badge>}
                                {row.featured && <Badge tone="amber">Featured</Badge>}
                                {!row.published && <Badge tone="red">Unpublished</Badge>}
                            </span>
                            <span className="truncate text-[12px] text-zinc-500">
                                {[
                                    modeLabel(row.mode),
                                    `${row.gates} checkpoints`,
                                    `${row.plays} plays`,
                                    row.author,
                                ].filter(Boolean).join('  ·  ')}
                            </span>
                        </span>

                        <FlagBtn
                            on={row.verified}
                            label="Verified"
                            icon={<BadgeCheck size={13} />}
                            busy={busy === row.id}
                            onToggle={() => void toggleFlag(row, 'verified', !row.verified)}
                        />
                        <FlagBtn
                            on={row.featured}
                            label="Featured"
                            icon={<Star size={13} />}
                            busy={busy === row.id}
                            onToggle={() => void toggleFlag(row, 'featured', !row.featured)}
                        />
                        <Btn
                            variant="danger"
                            disabled={busy === row.id}
                            onClick={() => setConfirm(row)}
                            title="Delete this track"
                        >
                            <Trash2 size={13} />
                            Delete
                        </Btn>
                    </div>
                </Card>
            ))}

            {pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-1">
                    <Btn disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Btn>
                    <span className={clsx('text-[12px] tabular-nums text-zinc-500')}>{page} of {pages}</span>
                    <Btn disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Next</Btn>
                </div>
            )}

            {confirm && (
                <ConfirmModal
                    title={`Delete ${confirm.name}?`}
                    body="The track is removed from the board and can no longer be raced or hosted. Times already set on it are kept."
                    confirmLabel="Delete track"
                    danger
                    onConfirm={() => void remove(confirm)}
                    onClose={() => setConfirm(null)}
                />
            )}
        </div>
    );
}
