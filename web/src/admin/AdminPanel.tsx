import { useCallback, useEffect, useState } from 'react';
import { Bird, LayoutDashboard, ScrollText, Search, ShieldCheck, VolumeX, X } from 'lucide-react';
import clsx from 'clsx';

import { fetchNui, isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AuditPage } from './pages/AuditPage';
import { BirdyPage } from './pages/BirdyPage';
import { Dashboard } from './pages/Dashboard';
import { MutesPage } from './pages/MutesPage';
import { PlayerDetail } from './pages/PlayerDetail';
import { PlayersPage } from './pages/PlayersPage';
import { ToastHost, useToasts } from './ui';

type PageId = 'dashboard' | 'players' | 'birdy' | 'mutes' | 'audit';

const NAV: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
    { id: 'players',   label: 'Players',   icon: <Search size={15} /> },
    { id: 'birdy',     label: 'Birdy',     icon: <Bird size={15} /> },
    { id: 'mutes',     label: 'Mutes',     icon: <VolumeX size={15} /> },
    { id: 'audit',     label: 'Audit log', icon: <ScrollText size={15} /> },
];

const PAGE_TITLE: Record<PageId, string> = {
    dashboard: 'Dashboard',
    players:   'Players',
    birdy:     'Birdy moderation',
    mutes:     'Active mutes',
    audit:     'Audit log',
};

export function AdminPanel() {
    const [open, setOpen] = useState(false);
    const [adminName, setAdminName] = useState<string | undefined>();
    const [page, setPage] = useState<PageId>('dashboard');
    const [playerCid, setPlayerCid] = useState<string | null>(null);
    const [searchSeed, setSearchSeed] = useState('');
    const { toasts, push } = useToasts();

    useNuiEvent('sd-phone:admin:open', useCallback((data) => {
        setAdminName(data?.adminName);
        setPage('dashboard');
        setPlayerCid(null);
        setSearchSeed('');
        setOpen(true);
    }, []));

    // Browser preview: vite dev + ?admin=1 opens the panel against the mock backend.
    useEffect(() => {
        if (!isFiveM && new URLSearchParams(window.location.search).has('admin')) {
            setAdminName('Admin Dev');
            setOpen(true);
        }
    }, []);

    const close = useCallback(() => {
        setOpen(false);
        void fetchNui('sd-phone:admin:close');
    }, []);

    // Capture-phase Escape so the phone's own Escape handler (close phone) never
    // fires while the panel is on top.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, close]);

    const openPlayer = useCallback((cid: string) => {
        setPage('players');
        setPlayerCid(cid);
    }, []);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/35 p-6 font-sf" onMouseDown={close}>
            <div
                className="relative flex h-[min(780px,92vh)] w-[min(1180px,94vw)] overflow-hidden rounded-2xl bg-[#101114]/[0.97] shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
                onMouseDown={e => e.stopPropagation()}
            >
                {/* Sidebar */}
                <div className="flex w-52 shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.02]">
                    <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ios-blue/20 text-ios-blue">
                            <ShieldCheck size={17} />
                        </div>
                        <div>
                            <div className="text-[13.5px] font-bold leading-tight text-zinc-100">Phone Admin</div>
                            <div className="text-[11px] text-zinc-500">sd-phone</div>
                        </div>
                    </div>
                    <nav className="flex-1 space-y-0.5 px-2.5">
                        {NAV.map(item => {
                            const active = page === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => { setPage(item.id); if (item.id !== 'players') setPlayerCid(null); }}
                                    className={clsx(
                                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                                        active ? 'bg-ios-blue/15 text-[#6db4ff]' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
                                    )}
                                >
                                    {item.icon}
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="border-t border-white/[0.06] px-4 py-3 text-[11.5px] text-zinc-500">
                        Signed in as<br /><span className="font-semibold text-zinc-300">{adminName ?? 'Admin'}</span>
                    </div>
                </div>

                {/* Main */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3">
                        <div className="text-[15px] font-bold text-zinc-100">
                            {playerCid && page === 'players' ? 'Player details' : PAGE_TITLE[page]}
                        </div>
                        <button
                            type="button"
                            onClick={close}
                            title="Close (Esc)"
                            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
                        >
                            <X size={17} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        {page === 'dashboard' && (
                            <Dashboard onSearch={q => { setSearchSeed(q); setPlayerCid(null); setPage('players'); }} />
                        )}
                        {page === 'players' && !playerCid && (
                            <PlayersPage initialQuery={searchSeed} onOpenPlayer={openPlayer} />
                        )}
                        {page === 'players' && playerCid && (
                            <PlayerDetail cid={playerCid} onBack={() => setPlayerCid(null)} toast={push} />
                        )}
                        {page === 'birdy' && <BirdyPage onOpenPlayer={openPlayer} toast={push} />}
                        {page === 'mutes' && <MutesPage onOpenPlayer={openPlayer} toast={push} />}
                        {page === 'audit' && <AuditPage onOpenPlayer={openPlayer} />}
                    </div>
                </div>

                <ToastHost toasts={toasts} />
            </div>
        </div>
    );
}
