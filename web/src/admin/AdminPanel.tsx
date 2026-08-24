import { useCallback, useEffect, useState } from 'react';
import {
    Bird, Camera, Clapperboard, DatabaseZap, FileText, Flag, Flame, Hash, Images, LayoutDashboard, Mail, Map,
    MessageSquare, Mic, Newspaper, Rss, ScrollText, Search, ShieldCheck, ShoppingBag, Skull, Star, StickyNote,
    TriangleAlert, Users, VolumeX, X,
} from 'lucide-react';
import clsx from 'clsx';

import { demoAdminOnly } from '@/core/demo';
import { fetchNui } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AuditPage } from './pages/AuditPage';
import { BirdyPage } from './pages/BirdyPage';
import { ContentPage } from './pages/ContentPage';
import { Dashboard } from './pages/Dashboard';
import { FlagsPage } from './pages/FlagsPage';
import { MediaPage } from './pages/MediaPage';
import { MapPage } from './pages/MapPage';
import { MigrationPage } from './pages/MigrationPage';
import { MutesPage } from './pages/MutesPage';
import { NumbersPage } from './pages/NumbersPage';
import { RacingPage } from './pages/RacingPage';
import { PlayerDetail } from './pages/PlayerDetail';
import { PlayersPage } from './pages/PlayersPage';
import { ToastHost, useToasts } from './ui';

type PageId =
    | 'dashboard' | 'media' | 'map' | 'players' | 'numbers' | 'flags' | 'mutes' | 'audit' | 'migration' | 'birdy'
    | 'messages' | 'darkchat' | 'photogram' | 'vibez' | 'cherry' | 'marketplace' | 'pages' | 'gallery' | 'racing'
    | 'mail' | 'documents' | 'weazelnews' | 'review' | 'notes' | 'voicememos' | 'groups';

interface NavItem { id: PageId; label: string; icon: React.ReactNode }

const NAV_MAIN: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
    { id: 'media',     label: 'Media',     icon: <Images size={15} /> },
    { id: 'map',       label: 'Live map',  icon: <Map size={15} /> },
    { id: 'players',   label: 'Players',   icon: <Search size={15} /> },
    { id: 'numbers',   label: 'Numbers',   icon: <Hash size={15} /> },
    { id: 'flags',     label: 'Flags',     icon: <TriangleAlert size={15} /> },
    { id: 'mutes',     label: 'Mutes',     icon: <VolumeX size={15} /> },
    { id: 'audit',     label: 'Audit log', icon: <ScrollText size={15} /> },
    { id: 'migration', label: 'Migration', icon: <DatabaseZap size={15} /> },
];

const NAV_APPS: NavItem[] = [
    { id: 'birdy',       label: 'Squawk',      icon: <Bird size={15} /> },
    { id: 'messages',    label: 'Messages',    icon: <MessageSquare size={15} /> },
    { id: 'mail',        label: 'Mail',        icon: <Mail size={15} /> },
    { id: 'darkchat',    label: 'Dark Chat',   icon: <Skull size={15} /> },
    { id: 'photogram',   label: 'Photogram',   icon: <Camera size={15} /> },
    { id: 'vibez',       label: 'Clout',       icon: <Clapperboard size={15} /> },
    { id: 'cherry',      label: 'Cherry',      icon: <Flame size={15} /> },
    { id: 'marketplace', label: 'Marketplace', icon: <ShoppingBag size={15} /> },
    { id: 'pages',       label: 'Pages',       icon: <Newspaper size={15} /> },
    { id: 'weazelnews',  label: 'Weazel News', icon: <Rss size={15} /> },
    { id: 'review',      label: 'Reviews',     icon: <Star size={15} /> },
    { id: 'documents',   label: 'Documents',   icon: <FileText size={15} /> },
    { id: 'notes',       label: 'Notes',       icon: <StickyNote size={15} /> },
    { id: 'voicememos',  label: 'Voice memos', icon: <Mic size={15} /> },
    { id: 'groups',      label: 'Groups',      icon: <Users size={15} /> },
    { id: 'gallery',     label: 'Gallery',     icon: <Images size={15} /> },
    { id: 'racing',      label: 'Racing',      icon: <Flag size={15} /> },
];

const PAGE_TITLE: Record<PageId, string> = {
    dashboard:   'Dashboard',
    media:       'Media - everything posted',
    map:         'Live map - players online now',
    players:     'Players',
    numbers:     'Numbers — SIM registry',
    flags:       'Flags — watchlist queue',
    birdy:       'Squawk moderation',
    mutes:       'Active mutes',
    audit:       'Audit log',
    migration:   'Migration - lb-phone import',
    messages:    'Messages (read-only)',
    darkchat:    'Dark Chat moderation',
    photogram:   'Photogram moderation',
    vibez:       'Clout moderation',
    cherry:      'Cherry profiles',
    marketplace: 'Marketplace moderation',
    pages:       'Pages moderation',
    gallery:     'Gallery — player photos',
    racing:      'Racing — track board',
    mail:        'Mail — mailboxes and their messages',
    documents:   'Documents — files and who signed them',
    weazelnews:  'Weazel News — published articles',
    review:      'Reviews — business ratings',
    notes:       'Notes (read-only)',
    voicememos:  'Voice memos',
    groups:      'Groups',
};

// Per-app config for the generic content browser.
const CONTENT_PAGES: Record<string, { search: string; empty: string; deleteBody: string; thread: string; grid?: boolean }> = {
    messages:    { search: 'Filter sent texts by content or number',      empty: 'No messages yet.',            deleteBody: '',                                                             thread: 'Conversation' },
    darkchat:    { search: 'Filter messages by content, alias or room',   empty: 'No Dark Chat messages yet.',  deleteBody: 'The message and its reactions are permanently removed.',       thread: 'Room context' },
    photogram:   { search: 'Filter posts by caption or username',         empty: 'No Photogram posts yet.',     deleteBody: 'The post, its comments, likes and saves are permanently removed.', thread: 'Comments' },
    vibez:       { search: 'Filter posts by caption or username',         empty: 'No Clout posts yet.',         deleteBody: 'The post, its comments, likes and saves are permanently removed.', thread: 'Comments' },
    cherry:      { search: 'Filter profiles by username, name or bio',    empty: 'No Cherry profiles yet.',     deleteBody: '',                                                             thread: '' },
    marketplace: { search: 'Filter listings by title or description',     empty: 'No listings yet.',            deleteBody: 'The listing is permanently removed.',                          thread: '' },
    pages:       { search: 'Filter posts by title or description',        empty: 'No posts yet.',               deleteBody: 'The post is permanently removed.',                             thread: '' },
    gallery:     { search: 'Filter photos by citizen ID',                 empty: 'No photos yet.',              deleteBody: 'The photo is removed from the player’s gallery and any albums.', thread: '', grid: true },
    mail:        { search: 'Filter mailboxes by address, name or message text', empty: 'No mailboxes yet.',     deleteBody: '',                                                             thread: 'Messages' },
    documents:   { search: 'Filter documents by name, content or citizen ID',   empty: 'No documents yet.',     deleteBody: 'The document and every signature on it are permanently removed.', thread: 'Signatures' },
    weazelnews:  { search: 'Filter articles by headline, body or author', empty: 'No articles published yet.',  deleteBody: 'The article is permanently removed.',                          thread: '' },
    review:      { search: 'Filter reviews by text, author or business',  empty: 'No reviews yet.',             deleteBody: 'The review and its helpful votes are permanently removed.',    thread: '' },
    notes:       { search: 'Filter notes by content or citizen ID',       empty: 'No notes yet.',               deleteBody: '',                                                             thread: '' },
    voicememos:  { search: 'Filter memos by name or citizen ID',          empty: 'No voice memos yet.',         deleteBody: 'The recording is permanently removed.',                        thread: '' },
    groups:      { search: 'Filter groups by name or leader',             empty: 'No groups yet.',              deleteBody: '',                                                             thread: '' },
};

export function AdminPanel() {
    // Open on the first paint in the website's admin view, so the panel is what
    // renders rather than something that appears a moment after the phone.
    const [open, setOpen] = useState(demoAdminOnly);
    const [adminName, setAdminName] = useState<string | undefined>(demoAdminOnly ? 'Demo Admin' : undefined);
    const [simEnabled, setSimEnabled] = useState(false);
    const [racingEnabled, setRacingEnabled] = useState(demoAdminOnly);
    const [page, setPage] = useState<PageId>('dashboard');
    const [playerCid, setPlayerCid] = useState<string | null>(null);
    const [searchSeed, setSearchSeed] = useState('');
    const { toasts, push } = useToasts();

    useNuiEvent('sd-phone:admin:open', useCallback((data) => {
        setAdminName(data?.adminName);
        setSimEnabled(data?.sim === true);
        setRacingEnabled(data?.racing === true);
        setPage('dashboard');
        setPlayerCid(null);
        setSearchSeed('');
        setOpen(true);
    }, []));

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

    // Jump to the Gallery pre-filtered to one player's photos (uploads + camera shots).
    const [gallerySeed, setGallerySeed] = useState('');
    const openGallery = useCallback((cid: string) => {
        setGallerySeed(cid);
        setPage('gallery');
    }, []);

    const [contentSeed, setContentSeed] = useState<{ app: string; q: string } | null>(null);
    const openContent = useCallback((app: string, q: string) => {
        setContentSeed({ app, q });
        setPage(app as PageId);
    }, []);

    const [openFlags, setOpenFlags] = useState(0);

    if (!open) return null;

    const renderNavItem = (item: NavItem) => {
        const active = page === item.id;
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => {
                    setPage(item.id);
                    if (item.id !== 'players') setPlayerCid(null);
                    if (item.id === 'gallery') setGallerySeed('');
                    if (item.id !== contentSeed?.app) setContentSeed(null);
                }}
                className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                    active ? 'bg-ios-blue/15 text-[#6db4ff]' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
                )}
            >
                {item.icon}
                {item.label}
                {item.id === 'flags' && openFlags > 0 && (
                    <span className="ml-auto rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-amber-300">
                        {openFlags}
                    </span>
                )}
            </button>
        );
    };

    const contentCfg = CONTENT_PAGES[page];

    return (
        <div
            className="admin-scrim-in fixed inset-0 z-[400] flex items-center justify-center p-6 font-sf"
            onMouseDown={demoAdminOnly ? undefined : close}
        >
            {/* No backdrop-filter here: FiveM's CEF can't sample the game feed behind a
                transparent NUI page, so backdrop-blur paints a huge black region instead.
                In the website's admin view there is nothing behind it either, so the panel
                fills the frame instead of floating at a capped size: the padding above is
                the same 24px inset the device chassis sits at, which keeps it clear of the
                bench's registration marks. */}
            <div
                data-admin-surface
                className={`admin-panel-in relative flex overflow-hidden bg-[#101114] ${
                    demoAdminOnly
                        ? 'h-full w-full rounded-xl'
                        : 'h-[min(780px,92vh)] w-[min(1180px,94vw)] rounded-2xl shadow-2xl ring-1 ring-white/10'
                }`}
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
                    <nav className="admin-scroll flex-1 space-y-0.5 overflow-y-auto px-2.5">
                        {NAV_MAIN.filter(item => item.id !== 'numbers' || simEnabled).map(item => renderNavItem(item))}
                        <div className="px-3 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-widest text-zinc-600">Apps</div>
                        {NAV_APPS.filter(item => item.id !== 'racing' || racingEnabled).map(item => renderNavItem(item))}
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
                    <div className="admin-scroll min-h-0 flex-1 overflow-y-auto p-5">
                        {page === 'dashboard' && (
                            <Dashboard onSearch={q => { setSearchSeed(q); setPlayerCid(null); setPage('players'); }} />
                        )}
                        {page === 'players' && !playerCid && (
                            <PlayersPage initialQuery={searchSeed} onOpenPlayer={openPlayer} />
                        )}
                        {page === 'players' && playerCid && (
                            <PlayerDetail cid={playerCid} onBack={() => setPlayerCid(null)} toast={push} onOpenGallery={openGallery} />
                        )}
                        {page === 'media' && <MediaPage onOpenPlayer={openPlayer} />}
                        {page === 'map' && <MapPage onOpenPlayer={openPlayer} />}
                        {page === 'numbers' && <NumbersPage onOpenPlayer={openPlayer} />}
                        {page === 'birdy' && (
                            <BirdyPage
                                key={contentSeed?.app === 'birdy' ? `birdy:${contentSeed.q}` : 'birdy'}
                                initialQuery={contentSeed?.app === 'birdy' ? contentSeed.q : undefined}
                                onOpenPlayer={openPlayer}
                                toast={push}
                            />
                        )}
                        {page === 'mutes' && <MutesPage onOpenPlayer={openPlayer} toast={push} />}
                        {page === 'audit' && <AuditPage onOpenPlayer={openPlayer} />}
                        {page === 'flags' && (
                            <FlagsPage
                                onOpenPlayer={openPlayer}
                                onOpenContent={openContent}
                                onCount={setOpenFlags}
                                toast={push}
                            />
                        )}
                        {page === 'racing' && <RacingPage onToast={push} />}
                        {page === 'migration' && <MigrationPage toast={push} />}
                        {contentCfg && (
                            <ContentPage
                                key={page === 'gallery' ? `gallery:${gallerySeed}` : contentSeed?.app === page ? `${page}:${contentSeed.q}` : page}
                                app={page}
                                initialQuery={page === 'gallery' ? gallerySeed : contentSeed?.app === page ? contentSeed.q : undefined}
                                searchPlaceholder={contentCfg.search}
                                emptyLabel={contentCfg.empty}
                                deleteBody={contentCfg.deleteBody}
                                threadLabel={contentCfg.thread}
                                grid={contentCfg.grid}
                                onOpenPlayer={openPlayer}
                                toast={push}
                            />
                        )}
                    </div>
                </div>

                <ToastHost toasts={toasts} />
            </div>
        </div>
    );
}
