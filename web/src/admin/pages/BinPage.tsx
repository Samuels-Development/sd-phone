import { useCallback, useState } from 'react';
import { RotateCcw, UserSearch } from 'lucide-react';

import { adminBin, adminBinRestore } from '../adminApi';
import { fmtTime, type AdminBinEntry } from '../types';
import { Badge, Btn, Card, CenterNote, ConfirmModal, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';

const APP_LABEL: Record<string, string> = {
    birdy: 'Squawk', darkchat: 'Dark Chat', photogram: 'Photogram', vibez: 'Clout', marketplace: 'Marketplace',
    pages: 'Pages', gallery: 'Gallery', documents: 'Documents', weazelnews: 'Weazel News',
    voicememos: 'Voice memos',
};

export function BinPage({ onOpenPlayer, toast }: {
    onOpenPlayer: (cid: string) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [pending, setPending] = useState<AdminBinEntry | null>(null);

    const fetchPage = useCallback(async (cursor: number | null) => {
        const res = await adminBin(cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.entries, nextCursor: res.data.nextCursor };
    }, []);

    const { items, loading, hasMore, loadMore, setItems } = usePaged<AdminBinEntry, number>(fetchPage, 'bin');

    const restore = async (entry: AdminBinEntry) => {
        const res = await adminBinRestore(entry.id);
        if (!res.success) { toast(res.message ?? 'Restore failed', true); return; }
        setItems(prev => prev.map(e => e.id === entry.id
            ? { ...e, restoredAt: Math.floor(Date.now() / 1000), restoredBy: 'you' }
            : e));
        toast('Put back');
    };

    return (
        <div className="space-y-4">
            <Card>
                {items.map(entry => (
                    <div key={entry.id} className="border-t border-white/[0.05] px-4 py-3 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                                    <Badge>{APP_LABEL[entry.app] ?? entry.app}</Badge>
                                    {entry.authorCid ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <OnlineDot online={entry.authorOnline} />
                                            <span className="font-bold text-zinc-100">{entry.authorName ?? 'Unknown player'}</span>
                                        </span>
                                    ) : (
                                        <span className="font-semibold text-zinc-400">Unknown author</span>
                                    )}
                                    <span className="text-zinc-600">·</span>
                                    <span className="text-zinc-500">deleted by {entry.adminName ?? 'staff'} {fmtTime(entry.createdAt)}</span>
                                    {entry.restoredAt && (
                                        <Badge tone="green">put back by {entry.restoredBy ?? 'staff'}</Badge>
                                    )}
                                </div>
                                <div className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-snug text-zinc-200">
                                    {entry.excerpt || <span className="italic text-zinc-500">(no text)</span>}
                                </div>
                                {entry.lost && (
                                    <div className="mt-1 text-[11.5px] text-zinc-500">
                                        Putting this back does not bring back {entry.lost}.
                                    </div>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {entry.authorCid && (
                                    <Btn variant="subtle" title="Open player" onClick={() => onOpenPlayer(entry.authorCid!)}>
                                        <UserSearch size={14} />
                                    </Btn>
                                )}
                                {!entry.restoredAt && (
                                    <Btn variant="primary" onClick={() => setPending(entry)}>
                                        <RotateCcw size={13} /> Put back
                                    </Btn>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && (
                    <CenterNote>Nothing deleted recently. Content removed from the app tabs is kept here for 30 days.</CenterNote>
                )}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>

            {pending && (
                <ConfirmModal
                    title="Put this back?"
                    body={pending.lost
                        ? `The row returns to ${APP_LABEL[pending.app] ?? pending.app}. It does not bring back ${pending.lost}.`
                        : `The row returns to ${APP_LABEL[pending.app] ?? pending.app}.`}
                    confirmLabel="Put back"
                    onConfirm={() => restore(pending)}
                    onClose={() => setPending(null)}
                />
            )}
        </div>
    );
}
