import { useCallback, useState } from 'react';
import { ArrowUpRight, Check, Search, Undo2, UserSearch, X } from 'lucide-react';
import clsx from 'clsx';

import { adminFlagResolve, adminFlags, adminFlagsScan } from '../adminApi';
import { fmtTime, type AdminFlag, type AdminFlagStatus } from '../types';
import { Badge, Btn, Card, CenterNote, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';

const APP_LABEL: Record<string, string> = {
    birdy: 'Squawk', messages: 'Messages', darkchat: 'Dark Chat', photogram: 'Photogram',
    vibez: 'Clout', marketplace: 'Marketplace', pages: 'Pages', cherry: 'Cherry',
    weazelnews: 'Weazel News', notes: 'Notes',
};

const TABS: { id: string; label: string }[] = [
    { id: 'open',      label: 'Open' },
    { id: 'actioned',  label: 'Actioned' },
    { id: 'dismissed', label: 'Dismissed' },
    { id: 'all',       label: 'All' },
];

function Excerpt({ text, matched }: { text: string; matched: string }) {
    const at = matched ? text.toLowerCase().indexOf(matched.toLowerCase()) : -1;
    if (at < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, at)}
            <mark className="rounded bg-amber-400/25 px-0.5 text-amber-200">{text.slice(at, at + matched.length)}</mark>
            {text.slice(at + matched.length)}
        </>
    );
}

export function FlagsPage({ onOpenPlayer, onOpenContent, onCount, toast }: {
    onOpenPlayer: (cid: string) => void;
    onOpenContent: (app: string, query: string) => void;
    onCount: (open: number) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [status, setStatus] = useState('open');
    const [scanning, setScanning] = useState(false);

    const fetchPage = useCallback(async (cursor: number | null) => {
        const res = await adminFlags(status, cursor);
        if (!res.success || !res.data) return null;
        onCount(res.data.openCount);
        return { items: res.data.flags, nextCursor: res.data.nextCursor };
    }, [status, onCount]);

    const { items, loading, hasMore, loadMore, setItems, reload } = usePaged<AdminFlag, number>(fetchPage, `flags:${status}`);

    const resolve = async (flag: AdminFlag, next: AdminFlagStatus) => {
        const res = await adminFlagResolve(flag.id, next);
        if (!res.success) { toast(res.message ?? 'Failed', true); return; }
        onCount(res.data?.openCount ?? 0);
        setItems(prev => status === 'all'
            ? prev.map(f => f.id === flag.id ? { ...f, status: next } : f)
            : prev.filter(f => f.id !== flag.id));
        toast(next === 'actioned' ? 'Marked actioned' : next === 'dismissed' ? 'Dismissed' : 'Reopened');
    };

    const scan = async () => {
        setScanning(true);
        const res = await adminFlagsScan();
        setScanning(false);
        if (!res.success) { toast(res.message ?? 'Scan failed', true); return; }
        onCount(res.data?.openCount ?? 0);
        toast(res.data?.filed
            ? `${res.data.filed} new flag${res.data.filed === 1 ? '' : 's'} from ${res.data.scanned.toLocaleString()} rows`
            : `Nothing new across ${(res.data?.scanned ?? 0).toLocaleString()} rows`);
        reload();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setStatus(t.id)}
                            className={clsx(
                                'rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors',
                                status === t.id
                                    ? 'bg-white/[0.12] text-zinc-100 ring-white/[0.14]'
                                    : 'bg-white/[0.035] text-zinc-400 ring-white/[0.06] hover:bg-white/[0.06]',
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <Btn variant="primary" onClick={() => void scan()} busy={scanning} disabled={scanning}>
                    <Search size={13} /> Scan now
                </Btn>
            </div>

            <Card>
                {items.map(flag => (
                    <div key={flag.id} className="border-t border-white/[0.05] px-4 py-3 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                                    <Badge tone="amber">{flag.ruleLabel}</Badge>
                                    <Badge>{APP_LABEL[flag.app] ?? flag.app}</Badge>
                                    {flag.authorCid ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <OnlineDot online={flag.authorOnline} />
                                            <span className="font-bold text-zinc-100">{flag.authorName ?? 'Unknown player'}</span>
                                            <span className="font-mono text-[11px] text-zinc-500">{flag.authorCid}</span>
                                        </span>
                                    ) : (
                                        <span className="font-semibold text-zinc-400">Unknown author</span>
                                    )}
                                    <span className="text-zinc-600">·</span>
                                    <span className="text-zinc-500">{fmtTime(flag.createdAt)}</span>
                                    {flag.status !== 'open' && (
                                        <Badge tone={flag.status === 'actioned' ? 'green' : 'neutral'}>
                                            {flag.status} by {flag.handledName ?? 'staff'}
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug text-zinc-200">
                                    <Excerpt text={flag.excerpt} matched={flag.matched} />
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                <Btn variant="subtle" title="Find this in its app" onClick={() => onOpenContent(flag.app, flag.matched)}>
                                    <ArrowUpRight size={14} />
                                </Btn>
                                {flag.authorCid && (
                                    <Btn variant="subtle" title="Open player" onClick={() => onOpenPlayer(flag.authorCid!)}>
                                        <UserSearch size={14} />
                                    </Btn>
                                )}
                                {flag.status === 'open' ? (
                                    <>
                                        <Btn variant="primary" title="Mark actioned" onClick={() => void resolve(flag, 'actioned')}>
                                            <Check size={14} />
                                        </Btn>
                                        <Btn variant="ghost" title="Dismiss" onClick={() => void resolve(flag, 'dismissed')}>
                                            <X size={14} />
                                        </Btn>
                                    </>
                                ) : (
                                    <Btn variant="ghost" title="Put back in the queue" onClick={() => void resolve(flag, 'open')}>
                                        <Undo2 size={14} />
                                    </Btn>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && (
                    <CenterNote>
                        {status === 'open'
                            ? 'Nothing waiting. Flags appear here when the watchlist matches something a player posted.'
                            : 'Nothing here.'}
                    </CenterNote>
                )}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>

            <Card className="p-4 text-[12.5px] leading-relaxed text-zinc-500">
                <span className="font-semibold text-zinc-400">How this works.</span> A sweep reads recent posts, texts and
                listings across the apps and files anything matching a rule in configs/moderation.lua. Nothing is hidden or
                removed automatically: a flag is a queue entry, and what happens next is your call. Marking one actioned or
                dismissed closes it and writes an audit row.
            </Card>
        </div>
    );
}
