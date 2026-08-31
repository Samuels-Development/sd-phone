import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { LayoutGrid, Minus, Plus } from 'lucide-react';

import { device } from '@device';
import { DOCK_BOTTOM, DOCK_PAD_Y, DOTS_GAP, getDensity, getGrid, stripReserve, useGrid } from '@/device/grid';
import { APP_LABEL_CLASS, appLabelStyle } from './appLabel';
import type { AppDef } from '@/core/types';
import { useTheme } from '@/stores/themeStore';
import { resolveWallpaper } from './wallpapers';
import { ART, AppIcon, TILE_SHADOW, radiusPct } from './AppIcon';
import { AppIconSVG } from './AppIconSVG';
import { AppGlyph } from './AppGlyphs';
import { AppBadge } from './AppBadge';
import { useBadges } from '@/stores/badgeStore';
import { useIconAppearance, useShowAppNames } from '@/stores/iconThemeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import type { SavedLayout, WidgetAlign, WidgetPlacement, WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import type { DockDrag, DockPlan } from './dockMoves';
import { DOCK_MAX, planDockDrag } from './dockMoves';
import { coveredCells, firstFit, jiggleDeg, landingCell, pageMoves, placeNewApps, reflowAround, spanOf, trySwap, widgetPx } from './widgets/geometry';
import { useDockReflow } from './useDockReflow';
import { PARALLAX_SCALE, PARALLAX_SHIFT, type DockStyle } from './shellLook';
import { widgetByKind } from './widgets/registry';
import { launchOriginFrom } from './launchOrigin';
import { WidgetGallery } from './widgets/WidgetGallery';
import { WidgetStack } from './widgets/WidgetStack';
import { addCard, cardsOf, patchCard, removeCard } from './widgets/stack';
import { t, appLabel } from '@/i18n';


const { w: SCREEN_W, h: SCREEN_H } = device.screen;

// A phone dock spans the screen and spreads its icons over it. A tablet dock is a floating tray
// sized to its contents, so the slots stop stretching and the row is centred instead.
const DOCK_FILL = device.screen.dockFill ?? true;

const DOCK_TRAY: Record<DockStyle, string> = {
    glass:   'border border-white/20 bg-white/15 backdrop-blur-2xl',
    tinted:  'border border-white/20 bg-ios-blue/35 backdrop-blur-2xl',
    solid:   'border border-white/10 bg-black/45',
    outline: 'border border-white/35',
    clear:   '',
    hidden:  '',
};
const DOCK_SLOT = DOCK_FILL ? 'relative flex flex-1 justify-center' : 'relative flex justify-center';
const COMMIT_THRESHOLD = SCREEN_W * 0.2;
const FLICK_VELOCITY = 0.4;

function itemsPerPage(): number {
    const g = getGrid();
    return g.cols * g.rows;
}
function dotsBottom(icon: number, dockHidden: boolean): number {
    return dockHidden ? DOCK_BOTTOM + DOTS_GAP : DOCK_BOTTOM + icon + DOCK_PAD_Y + DOTS_GAP;
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
function slot(localCell: number) {
    const g = getGrid();
    return { x: g.padX + (localCell % g.cols) * g.colStride, y: g.rowY0 + Math.floor(localCell / g.cols) * g.rowStride };
}
function cellFromCenter(cx: number, cy: number) {
    const g = getGrid();
    const c = Math.max(0, Math.min(g.cols - 1, Math.round((cx - g.padX - g.icon / 2) / g.colStride)));
    const r = Math.max(0, Math.min(g.rows - 1, Math.round((cy - g.rowY0 - g.icon / 2) / g.rowStride)));
    return r * g.cols + c;
}
function offsetWithin(el: HTMLElement | null, root: HTMLElement | null): { x: number; y: number } {
    let x = 0, y = 0;
    for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
        x += n.offsetLeft;
        y += n.offsetTop;
    }
    return { x, y };
}
function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}
function lastFilledIndex(arr: (string | null)[]): number {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return i;
    return -1;
}
function normalize(arr: (string | null)[]): (string | null)[] {
    const per = itemsPerPage();
    const filledPages = Math.floor(lastFilledIndex(arr) / per) + 1;
    const want = (filledPages + 1) * per;
    const out = arr.slice(0, want);
    while (out.length < want) out.push(null);
    return out;
}
function jiggleDelay(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return -(h % 180);
}
function bloomDelay(id: string): number {
    return Math.abs(jiggleDelay(id));
}

function widgetClash(widgets: WidgetPlacement[], uid: string | undefined, size: WidgetSize, page: number, col: number, row: number): boolean {
    const target = new Set(coveredCells({ size, col, row }));
    return widgets.some(o => o.uid !== uid && o.page === page && coveredCells(o).some(c => target.has(c)));
}

function widgetsAfterDrop(widgets: WidgetPlacement[], uid: string | undefined, page: number, col: number, row: number): WidgetPlacement[] | null {
    const held = widgets.find(w => w.uid === uid);
    if (!held) return null;
    if (!widgetClash(widgets, uid, held.size, page, col, row)) {
        return widgets.map(o => (o.uid === uid ? { ...o, page, col, row } : o));
    }
    return trySwap(widgets, held.uid, { page, col, row });
}

function pillSpot(x: number, y: number, size: WidgetSize): { x: number; y: number } {
    const g = getGrid();
    const { width, height } = widgetPx(size);
    const gridH = g.rows * g.rowStride + g.rowY0;
    const below = y + height + 10;
    return {
        x: Math.max(96, Math.min(SCREEN_W - 96, x + width / 2)),
        y: below + 32 > gridH ? Math.max(0, y - 38) : below,
    };
}

const FOLDER_PREFIX = 'folder:';
const isFolderId  = (id: string) => id.startsWith(FOLDER_PREFIX);
const folderKeyOf = (id: string) => id.slice(FOLDER_PREFIX.length);
let folderSeq = 0;
function newFolderKey(): string { folderSeq += 1; return `f${Date.now().toString(36)}${folderSeq}`; }

export interface HomescreenProps {
    apps:         AppDef[];
    dock:         string[];
    firstPageApps?: number;
    wallpaper:    string;
    onLaunchApp:  (app: AppDef, origin: { x: number; y: number }) => void;
    onUninstall?: (id: string) => void;
    savedLayout?: SavedLayout | null;
    onLayoutChange?: (layout: SavedLayout) => void;
    onEditingChange?: (editing: boolean) => void;
    homeActive?: boolean;
    /** Play the icon bloom on mount; false when the phone is revealed with an app on top. */
    bloomOnMount?: boolean;
}

export function Homescreen({ apps, dock, firstPageApps, wallpaper, onLaunchApp, onUninstall, savedLayout, onLayoutChange, onEditingChange, homeActive = true, bloomOnMount = true }: HomescreenProps) {
    const { blurHome, dockStyle, wallpaperParallax } = useTheme('blurHome', 'dockStyle', 'wallpaperParallax');
    const grid = useGrid();
    const { cols: COLS, rows: ROWS, icon: ICON, rowY0: ROW_Y0, rowStride: ROW_STRIDE, stripTop } = grid;
    const TILE = ICON;
    const dockHidden = dockStyle === 'hidden';
    const DOTS_BOTTOM = dotsBottom(ICON, dockHidden);
    const densityRef = useRef(getDensity());
    const badges = useBadges();
    // The homescreen mounts exactly when the phone content is revealed (open without a lock,
    // or the unlock swipe finishing), so a mount-triggered bloom staggers the icons in like
    // iOS. Skipped when an app is revealed on top (the icons would flash through its resume
    // zoom); cleared after the longest delay + duration so the animations drop off the tiles.
    const [bloom, setBloom] = useState(bloomOnMount);
    useEffect(() => {
        if (!bloomOnMount) return;
        const t = window.setTimeout(() => setBloom(false), 950);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const appMap   = useMemo(() => new Map(apps.map(a => [a.id, a])), [apps]);
    // Tile elements keyed by widget uid, so an interactive custom widget's "open" postMessage
    // (no MouseEvent to read a launch origin from) can still zoom the app open from its own tile.
    const widgetTileRefs = useRef<Record<string, HTMLElement>>({});

    const [dockIds, setDockIds] = useState<string[]>(() => savedLayout?.dock ?? dock);
    const dockApps = useMemo(
        () => dockIds.map(id => apps.find(a => a.id === id)).filter((a): a is AppDef => !!a),
        [apps, dockIds],
    );
    const dockShown = useMemo(() => dockApps.map(a => a.id), [dockApps]);
    const dockShownRef = useRef(dockShown);
    dockShownRef.current = dockShown;

    const [folders, setFolders] = useState<Record<string, { name: string; appIds: string[] }>>(() => {
        const out: Record<string, { name: string; appIds: string[] }> = {};
        for (const f of savedLayout?.folders ?? []) out[f.key] = { name: f.name, appIds: [...f.appIds] };
        return out;
    });
    const folderedIds = useMemo(() => new Set(Object.values(folders).flatMap(f => f.appIds)), [folders]);

    const [widgets, setWidgets] = useState<WidgetPlacement[]>(() => savedLayout?.widgets ?? []);

    const [slots, setSlots] = useState<(string | null)[]>(() => {
        if (savedLayout && savedLayout.slots.length) return normalize(savedLayout.slots);
        const seeded = new Set(Object.values(folders).flatMap(f => f.appIds));
        const loose = apps.filter(a => !dockIds.includes(a.id) && !seeded.has(a.id)).map(a => a.id);
        // A seeding count, not a grid measure: how many apps land on page one before it spills.
        const wanted = firstPageApps ?? 12;
        const FIRST_PAGE = Math.min(wanted > 0 ? wanted : itemsPerPage(), itemsPerPage());
        const pages = Math.max(2, Math.ceil(loose.length / itemsPerPage()) + 1);
        const arr: (string | null)[] = Array(itemsPerPage() * pages).fill(null);
        loose.slice(0, FIRST_PAGE).forEach((id, i) => { arr[i] = id; });
        loose.slice(FIRST_PAGE).forEach((id, i) => { arr[itemsPerPage() + i] = id; });
        return normalize(arr);
    });

    useEffect(() => {
        const known = new Set(apps.map(a => a.id));
        setFolders(prev => {
            let changed = false;
            const next: typeof prev = {};
            for (const [key, f] of Object.entries(prev)) {
                const kept = f.appIds.filter(id => known.has(id));
                if (kept.length !== f.appIds.length) changed = true;
                if (kept.length >= 2) next[key] = kept.length === f.appIds.length ? f : { ...f, appIds: kept };
                else changed = true;
            }
            return changed ? next : prev;
        });
    }, [apps]);

    useEffect(() => {
        const known = new Set(apps.map(a => a.id));
        const folderKeys = new Set(Object.keys(folders));
        const docked = new Set(dockIds);
        setSlots(prev => {
            const cleaned = prev.map(id => {
                if (!id) return id;
                if (isFolderId(id)) return folderKeys.has(folderKeyOf(id)) ? id : null;
                if (folderedIds.has(id)) return null;
                if (docked.has(id)) return null;
                return known.has(id) ? id : null;
            });
            const placed = new Set(cleaned.filter((x): x is string => !!x && !isFolderId(x)));
            const missing = apps
                .filter(a => !docked.has(a.id) && !folderedIds.has(a.id) && !placed.has(a.id))
                .map(a => a.id);
            if (!missing.length && cleaned.every((v, i) => v === prev[i])) return prev;
            return normalize(placeNewApps(cleaned, missing, widgets, itemsPerPage()));
        });
    }, [apps, dockIds, folders, folderedIds, widgets]);

    // Read by the drag listeners, which are bound once per drag and would otherwise close over
    // the widget list as it was when the drag started.
    const widgetsRef = useRef(widgets);
    widgetsRef.current = widgets;

    const latestRef = useRef<SavedLayout>({ slots, folders: [], widgets: [], dock: dockIds });
    latestRef.current = {
        slots,
        folders: Object.entries(folders).map(([key, f]) => ({ key, name: f.name, appIds: f.appIds })),
        widgets,
        dock: dockIds,
        density: densityRef.current,
        rows: ROWS,
    };
    const onLayoutChangeRef = useRef(onLayoutChange);
    onLayoutChangeRef.current = onLayoutChange;
    const firstLayoutRun = useRef(true);
    const layoutSaveTimer = useRef<number | null>(null);
    useEffect(() => {
        if (firstLayoutRun.current) { firstLayoutRun.current = false; return; }
        if (layoutSaveTimer.current) window.clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = window.setTimeout(() => {
            layoutSaveTimer.current = null;
            onLayoutChangeRef.current?.(latestRef.current);
        }, 500);
    }, [slots, folders, widgets, dockIds]);
    useEffect(() => () => {
        if (layoutSaveTimer.current) {
            window.clearTimeout(layoutSaveTimer.current);
            onLayoutChangeRef.current?.(latestRef.current);
        }
    }, []);

    const folderApps = (key: string): AppDef[] =>
        (folders[key]?.appIds ?? []).map(id => appMap.get(id)).filter((a): a is AppDef => !!a);
    const folderBadge = (key: string): number =>
        (folders[key]?.appIds ?? []).reduce((n, id) => n + (badges?.[id] ?? 0), 0);

    const [galleryOpen, setGalleryOpen] = useState(false);

    /** Places a widget on the current page, or reports back that it would not fit. */
    const addWidget = useCallback((kind: string, size: WidgetSize, align: WidgetAlign, theme: WidgetTheme, picks?: string[]): boolean => {
        const spot = firstFit(size, pageRef.current, slots, widgets, itemsPerPage());
        if (!spot) return false;
        const next: WidgetPlacement[] = [...widgets, {
            uid: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
            kind, size, align, theme, page: pageRef.current, col: spot.col, row: spot.row,
            ...(picks?.length ? { picks } : {}),
        }];
        setWidgets(next);
        setSlots(prev => normalize(reflowAround(prev, next, itemsPerPage())));
        setGalleryOpen(false);
        return true;
    }, [slots, widgets]);

    const removeWidget = useCallback((uid: string) => {
        setWidgets(prev => prev.filter(w => w.uid !== uid));
    }, []);

    // Which card each stack is showing. Deliberately not persisted: a swipe is cheap to redo and
    // writing the layout on every one would churn phone_settings for a purely visual preference.
    const [stackAt, setStackAt] = useState<Record<string, number>>({});

    // uid the gallery is adding a card to, rather than placing a new widget.
    const [stackFor, setStackFor] = useState<string | null>(null);

    /** Drops one card off a stack, or the whole widget when it was the last one. */
    const dropCard = useCallback((uid: string, index: number) => {
        setWidgets(prev => prev.flatMap(w => {
            if (w.uid !== uid) return [w];
            const next = removeCard(w, index);
            return next ? [next] : [];
        }));
        setStackAt(prev => ({ ...prev, [uid]: Math.max(0, index - 1) }));
    }, []);

    /** Appends a card to an existing stack. Same footprint, so size is fixed by the placement. */
    const addToStack = useCallback((uid: string, kind: string, align: WidgetAlign, theme: WidgetTheme): boolean => {
        setWidgets(prev => prev.map(w => (w.uid === uid ? addCard(w, { kind, align, theme }) : w)));
        setStackFor(null);
        return true;
    }, []);

    // Widget dragging is deliberately separate from the icon drag above. Icons swap, fold into
    // folders and reflow; a widget just moves to a free rectangle, so sharing that machinery
    // would mean threading multi-cell cases through every branch of it.
    const [dragW, setDragW] = useState<{ uid: string; x: number; y: number } | null>(null);
    const dragWStart = useRef({ px: 0, py: 0, x: 0, y: 0, zoom: 1 });
    const dropSpot   = useRef<{ col: number; row: number } | null>(null);
    const [dropPreview, setDropPreview] = useState<{ page: number; col: number; row: number } | null>(null);

    /** Nearest legal top-left cell for a widget dragged to (x, y), clamped inside the grid. */
    const cellFor = useCallback((size: WidgetSize, x: number, y: number) => {
        const g = getGrid();
        const span = spanOf(size);
        const col = Math.max(0, Math.min(g.cols - span.w, Math.round((x - g.padX) / g.colStride)));
        const row = Math.max(0, Math.min(g.rows - span.h, Math.round((y - g.rowY0) / g.rowStride)));
        return { col, row };
    }, []);

    /** Page the widget will land on. Follows the visible page while an edge-flip is dragging it. */
    const dropPageRef = useRef(0);
    const dragSizeRef = useRef<WidgetSize>('sm');

    function onWidgetDown(e: ReactPointerEvent, w: WidgetPlacement) {
        if (!editingRef.current) return;
        e.stopPropagation();
        const s = slot(w.row * COLS + w.col);
        dragWStart.current = { px: e.clientX, py: e.clientY, x: s.x, y: s.y, zoom: ancestorZoom(stripRef.current) };
        dropSpot.current = { col: w.col, row: w.row };
        dropPageRef.current = w.page;
        dragSizeRef.current = w.size;
        setDropPreview({ page: w.page, col: w.col, row: w.row });
        setDragW({ uid: w.uid, x: s.x, y: s.y });
        // No setPointerCapture: the dragged tile is re-parented into whichever page is showing,
        // and capture does not survive that. The window listeners below own the gesture instead.
    }

    /**
     * Widget drag, driven from the WINDOW rather than the tile.
     *
     * Dragging a widget to another page means it has to be rendered on the page that is currently
     * visible, which unmounts it from the page it started on. Pointer capture and element
     * handlers both die with that unmount, so the move and release are tracked globally and the
     * tile stays a passive thing to look at.
     */
    useEffect(() => {
        const uid = dragW?.uid;
        if (!uid) return;

        function move(e: PointerEvent) {
            const g = dragWStart.current;
            const x = g.x + (e.clientX - g.px) / g.zoom;
            const y = g.y + (e.clientY - g.py) / g.zoom;
            setDragW(d => (d && d.uid === uid ? { uid, x, y } : d));
            const spot = cellFor(dragSizeRef.current, x, y);
            dropSpot.current = spot;
            setDropPreview(p => (p && p.page === dropPageRef.current && p.col === spot.col && p.row === spot.row
                ? p
                : { page: dropPageRef.current, col: spot.col, row: spot.row }));

            // Same edge-hold as the icon drag, so carrying a widget between pages feels identical
            // to carrying an icon: hover near an edge and the page turns under you.
            const stripW = stripRef.current?.offsetWidth ?? 0;
            const span = spanOf(dragSizeRef.current);
            const px = x + (span.w * getGrid().colStride) / 2;
            const EDGE = 44;
            const dir: 'l' | 'r' | null = px < EDGE ? 'l' : px > stripW - EDGE ? 'r' : null;
            const canFlip = dir === 'l' ? pageRef.current > 0
                : dir === 'r' ? pageRef.current < visiblePagesRef.current - 1 : false;
            if (dir && canFlip) {
                if (edgeDir.current !== dir) {
                    clearEdge();
                    edgeDir.current = dir;
                    edgeTimer.current = window.setTimeout(() => {
                        const next = Math.max(0, Math.min(visiblePagesRef.current - 1, pageRef.current + (dir === 'l' ? -1 : 1)));
                        dropPageRef.current = next;
                        setPage(next);
                        setDropPreview(p => (p && p.page !== next ? { ...p, page: next } : p));
                        edgeDir.current = null; edgeTimer.current = null;
                    }, 600);
                }
            } else {
                clearEdge();
            }
        }

        function up() {
            clearEdge();
            const spot = dropSpot.current;
            const toPage = dropPageRef.current;
            setDragW(null);
            setDropPreview(null);
            if (!spot) return;

            const next = widgetsAfterDrop(widgetsRef.current, uid, toPage, spot.col, spot.row);
            if (!next) return;
            setWidgets(next);
            setSlots(prev => normalize(reflowAround(prev, next, itemsPerPage())));
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
        // Only the identity of the dragged widget matters; everything else is read from refs so
        // the listeners are attached once per drag rather than re-bound on every pointer move.
    }, [dragW?.uid, cellFor]);

    const previewWidgets = useMemo(() => {
        const uid = dragW?.uid;
        if (!uid || !dropPreview) return widgets;
        const held = widgets.find(w => w.uid === uid);
        if (!held) return widgets;
        if (held.page === dropPreview.page && held.col === dropPreview.col && held.row === dropPreview.row) return widgets;
        return widgetsAfterDrop(widgets, uid, dropPreview.page, dropPreview.col, dropPreview.row) ?? widgets;
    }, [widgets, dragW?.uid, dropPreview]);

    const previewSlots = useMemo(
        () => (previewWidgets === widgets ? slots : reflowAround(slots, previewWidgets, itemsPerPage())),
        [slots, widgets, previewWidgets],
    );

    const reflowNote = useMemo(() => pageMoves(slots, previewSlots, itemsPerPage()), [slots, previewSlots]);

    /** page -> cells hidden beneath a widget, so an icon is never drawn under one. */
    const coveredByPage = useMemo(() => {
        const m = new Map<number, Set<number>>();
        for (const w of previewWidgets) {
            const set = m.get(w.page) ?? new Set<number>();
            coveredCells(w).forEach(c => set.add(c));
            m.set(w.page, set);
        }
        return m;
    }, [previewWidgets]);

    const [page, setPage]   = useState(0);
    const [dragX, setDragX] = useState(0);
    const [editing, setEditing] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<AppDef | null>(null);
    const [openFolder, setOpenFolder] = useState<string | null>(null);
    const [renameFolder, setRenameFolder] = useState<string | null>(null);
    const [mergeCell, setMergeCell] = useState<number | null>(null);
    const homeActiveRef = useRef(homeActive);
    homeActiveRef.current = homeActive;
    const editingRef = useRef(false);
    editingRef.current = editing;

    const onEditingChangeRef = useRef(onEditingChange);
    onEditingChangeRef.current = onEditingChange;
    useEffect(() => { onEditingChangeRef.current?.(editing); }, [editing]);
    useEffect(() => () => { onEditingChangeRef.current?.(false); }, []);

    const isDraggingRef = useRef(false);
    const startXRef = useRef(0); const startYRef = useRef(0);
    const capturedRef = useRef(false); const lockedAxis = useRef<'h' | 'v' | null>(null);
    const pageRef = useRef(0); const dragXRef = useRef(0);
    const lastXRef = useRef(0); const lastTRef = useRef(0); const velRef = useRef(0);
    pageRef.current = page;

    const lpTimer = useRef<number | null>(null);
    const clearLP = () => { if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null; } };
    useEffect(() => () => {
        clearLP();
        if (plopTimer.current) window.clearTimeout(plopTimer.current);
        if (edgeTimer.current) window.clearTimeout(edgeTimer.current);
        if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    }, []);

    const stripRef = useRef<HTMLDivElement>(null);
    const rootRef  = useRef<HTMLDivElement>(null);
    const dockRef  = useRef<HTMLDivElement>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [overCell, setOverCell] = useState<number | null>(null);
    const [dockOver, setDockOver] = useState<number | null>(null);
    const dockOverRef = useRef<number | null>(null);
    const [dragFromDock, setDragFromDock] = useState(false);
    const fromDockRef = useRef(false);
    const startClient = useRef({ x: 0, y: 0 });
    const grabSlot = useRef({ x: 0, y: 0 });
    const grabZoom = useRef(1);
    const fromCell = useRef(0);
    const overCellRef = useRef(0);
    const [plopIds, setPlopIds] = useState<Set<string>>(() => new Set());
    const plopTimer = useRef<number | null>(null);

    const fromPageRef = useRef(0);
    const edgeTimer = useRef<number | null>(null);
    const edgeDir = useRef<'l' | 'r' | null>(null);
    const clearEdge = () => { if (edgeTimer.current) { window.clearTimeout(edgeTimer.current); edgeTimer.current = null; } edgeDir.current = null; };

    const blockedCells = useCallback((pg: number) => {
        const set = new Set(coveredByPage.get(pg) ?? []);
        const base = pg * itemsPerPage();
        for (let i = 0; i < itemsPerPage(); i++) {
            const v = slots[base + i];
            if (v && isFolderId(v)) set.add(i);
        }
        return set;
    }, [coveredByPage, slots]);

    const dockDragOf = useCallback((id: string, dockIndex: number | null, fromDock: boolean, fromIndex: number, pg: number, cell: number, armed: number | null): DockDrag => ({
        id,
        dock:         dockShown,
        slots,
        dockIndex,
        fromDock,
        fromIndex,
        page:         pg,
        overCell:     cell,
        blocked:      blockedCells(pg),
        merge:        armed !== null && armed === cell && !!slots[pg * itemsPerPage() + armed],
        itemsPerPage: itemsPerPage(),
    }), [dockShown, slots, blockedCells]);

    const dockPlan = useMemo(() => {
        if (!dragId) return null;
        if (dockOver === null && (!dragFromDock || overCell === null)) return null;
        const fromIndex = fromPageRef.current * itemsPerPage() + fromCell.current;
        return planDockDrag(dockDragOf(dragId, dockOver, dragFromDock, fromIndex, page, overCell ?? 0, mergeCell));
    }, [dragId, dockOver, dragFromDock, overCell, page, mergeCell, dockDragOf]);

    const dockView = useMemo(
        () => (dockPlan ? dockPlan.dock.map(id => appMap.get(id)).filter((a): a is AppDef => !!a) : dockApps),
        [dockPlan, dockApps, appMap],
    );

    const dockRowRef = useDockReflow<HTMLDivElement>(dockView.map(a => a.id).join('|'));

    const pages = useMemo(
        () => chunk(dockPlan ? normalize(dockPlan.slots) : previewSlots, itemsPerPage()),
        [dockPlan, previewSlots],
    );

    const mergeCellRef = useRef<number | null>(null);
    mergeCellRef.current = mergeCell;
    const dwellTimer = useRef<number | null>(null);
    const dwellCell = useRef<number | null>(null);
    const clearDwell = () => {
        if (dwellTimer.current) { window.clearTimeout(dwellTimer.current); dwellTimer.current = null; }
        dwellCell.current = null;
        if (mergeCellRef.current !== null) setMergeCell(null);
    };

    // A page counts as used if it holds an icon OR a widget. Counting only icons made a page
    // holding nothing but a widget collapse the moment the drag ended: the page stopped being
    // rendered and took the widget with it, which looked exactly like the widget was deleted.
    const lastIconPage   = Math.floor(lastFilledIndex(slots) / itemsPerPage());
    const lastWidgetPage = widgets.reduce((m, w) => Math.max(m, w.page), -1);
    const filledPages = Math.max(lastIconPage, lastWidgetPage) + 1;
    const visiblePages = editing ? Math.max(1, filledPages + 1) : Math.max(1, filledPages);
    const visiblePagesRef = useRef(1);
    visiblePagesRef.current = visiblePages;
    // `pages` is chunked from the ICON array, so a widget-only page has no chunk to render into.
    // Pad with empty pages up to visiblePages so every page that exists gets a container - this
    // is also what provides the spare trailing page to drag onto in edit mode.
    const renderPages = useMemo(() => {
        const out = pages.slice(0, visiblePages);
        while (out.length < visiblePages) out.push(Array<string | null>(itemsPerPage()).fill(null));
        return out;
    }, [pages, visiblePages]);
    useEffect(() => { if (page > visiblePages - 1) setPage(visiblePages - 1); }, [visiblePages, page]);

    /**
     * True while the page strip is sliding, so glass widgets can drop their blur for the duration.
     *
     * Covers both halves of the gesture: the finger drag, and the settle transition that plays
     * afterwards. The window is a hair longer than the 380ms transition so the blur returns to a
     * stationary tile rather than a still-moving one.
     */
    const [pageMoving, setPageMoving] = useState(false);
    const settleRef = useRef<number | null>(null);
    const markPageMotion = useCallback(() => {
        setPageMoving(true);
        if (settleRef.current) window.clearTimeout(settleRef.current);
        settleRef.current = window.setTimeout(() => { setPageMoving(false); settleRef.current = null; }, 430);
    }, []);
    useEffect(() => () => { if (settleRef.current) window.clearTimeout(settleRef.current); }, []);

    const swiping = dragX !== 0;
    useEffect(() => { if (swiping) markPageMotion(); }, [swiping, markPageMotion]);
    // Compares the PREVIOUS page rather than skipping the first run: StrictMode double-invokes
    // effects in dev, which defeats a "first run" ref and would suspend the blur on mount.
    const prevPageRef = useRef(page);
    useEffect(() => {
        if (prevPageRef.current === page) return;
        prevPageRef.current = page;
        markPageMotion();
    }, [page, markPageMotion]);

    function armLongPress(e: ReactPointerEvent) {
        startXRef.current = e.clientX; startYRef.current = e.clientY;
        clearLP();
        if (!editingRef.current) lpTimer.current = window.setTimeout(() => setEditing(true), 450);
    }
    function longPressMove(e: ReactPointerEvent) {
        if (lpTimer.current === null) return;
        if (Math.abs(e.clientX - startXRef.current) > 8 || Math.abs(e.clientY - startYRef.current) > 8) clearLP();
    }

    function onPointerDown(e: ReactPointerEvent) {
        armLongPress(e);
        lastXRef.current = e.clientX; lastTRef.current = e.timeStamp; velRef.current = 0;
        lockedAxis.current = null; capturedRef.current = false; isDraggingRef.current = true;
    }
    function onPointerMove(e: ReactPointerEvent) {
        if (dragId) { onIconMove(e); return; }
        if (!isDraggingRef.current) return;
        longPressMove(e);
        const dx = e.clientX - startXRef.current, dy = e.clientY - startYRef.current;
        if (!lockedAxis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) lockedAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        if (lockedAxis.current !== 'h') return;
        if (!capturedRef.current) { capturedRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
        const dt = e.timeStamp - lastTRef.current;
        if (dt > 0) velRef.current = (e.clientX - lastXRef.current) / dt;
        lastXRef.current = e.clientX; lastTRef.current = e.timeStamp;
        const pg = pageRef.current;
        const clamped = Math.max(-(visiblePages - 1 - pg) * SCREEN_W, Math.min(pg * SCREEN_W, dx));
        dragXRef.current = clamped; setDragX(clamped);
    }
    function onPointerUp() {
        if (dragId) { onIconUp(); return; }
        clearLP();
        if (lockedAxis.current === 'h') {
            const dx = dragXRef.current, vel = velRef.current, pg = pageRef.current, last = visiblePages - 1;
            if ((dx < -COMMIT_THRESHOLD || vel < -FLICK_VELOCITY) && pg < last) setPage(pg + 1);
            else if ((dx > COMMIT_THRESHOLD || vel > FLICK_VELOCITY) && pg > 0) setPage(pg - 1);
        }
        setDragX(0); dragXRef.current = 0; isDraggingRef.current = false; lockedAxis.current = null; capturedRef.current = false;
    }

    function launch(app: AppDef, origin: { x: number; y: number }) {
        if (editingRef.current) return;
        onLaunchApp(app, origin);
    }

    function onIconDown(e: ReactPointerEvent, id: string, localCell: number) {
        e.stopPropagation();
        const s = slot(localCell);
        grabSlot.current = s;
        startClient.current = { x: e.clientX, y: e.clientY };
        grabZoom.current = ancestorZoom(stripRef.current);
        fromCell.current = localCell;
        fromPageRef.current = pageRef.current;
        overCellRef.current = localCell;
        fromDockRef.current = false;
        dockOverRef.current = null;
        setDragFromDock(false); setDockOver(null);
        setDragId(id); setDragPos(s); setOverCell(localCell);
        stripRef.current?.setPointerCapture(e.pointerId);
    }

    function onDockIconDown(e: ReactPointerEvent, id: string, index: number) {
        if (!editingRef.current) return;
        e.stopPropagation();
        const zone = e.currentTarget as HTMLElement;
        const p = offsetWithin(zone, rootRef.current);
        const s = { x: p.x + Math.max(0, (zone.offsetWidth - ICON) / 2), y: p.y - stripTop };
        grabSlot.current = s;
        startClient.current = { x: e.clientX, y: e.clientY };
        grabZoom.current = ancestorZoom(stripRef.current);
        fromCell.current = -1;
        fromPageRef.current = pageRef.current;
        overCellRef.current = 0;
        fromDockRef.current = true;
        dockOverRef.current = index;
        setDragFromDock(true); setDockOver(index);
        setDragId(id); setDragPos(s); setOverCell(null);
        stripRef.current?.setPointerCapture(e.pointerId);
    }

    function dockHitAt(clientX: number, clientY: number): number | null {
        const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        if (!el || !dockRef.current?.contains(el)) return null;
        const idx = el.closest('[data-dock-idx]')?.getAttribute('data-dock-idx');
        if (idx != null) return Number(idx);
        return dockOverRef.current ?? dockShownRef.current.length;
    }

    function onIconMove(e: ReactPointerEvent) {
        if (!dragId) return;
        const z = grabZoom.current;
        const x = grabSlot.current.x + (e.clientX - startClient.current.x) / z;
        const y = grabSlot.current.y + (e.clientY - startClient.current.y) / z;
        setDragPos({ x, y });
        const onDock = isFolderId(dragId) ? null : dockHitAt(e.clientX, e.clientY);
        if (onDock !== dockOverRef.current) { dockOverRef.current = onDock; setDockOver(onDock); }
        if (onDock !== null) {
            clearDwell();
            clearEdge();
            setOverCell(null);
            return;
        }
        const over = cellFromCenter(x + ICON / 2, y + ICON / 2);
        overCellRef.current = over;
        setOverCell(over);
        const targetId = slots[pageRef.current * itemsPerPage() + over] ?? null;
        const sameAsOrigin = pageRef.current === fromPageRef.current && over === fromCell.current;
        if (!isFolderId(dragId) && !fromDockRef.current && targetId && !sameAsOrigin) {
            if (dwellCell.current !== over) {
                dwellCell.current = over;
                if (mergeCellRef.current !== null) setMergeCell(null);
                if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
                dwellTimer.current = window.setTimeout(() => setMergeCell(over), 550);
            }
        } else {
            clearDwell();
        }
        const stripW = stripRef.current?.offsetWidth ?? 0;
        const px = x + ICON / 2;
        const EDGE = 44;
        const dir: 'l' | 'r' | null = px < EDGE ? 'l' : px > stripW - EDGE ? 'r' : null;
        const canFlip = dir === 'l' ? pageRef.current > 0 : dir === 'r' ? pageRef.current < visiblePagesRef.current - 1 : false;
        if (dir && canFlip) {
            if (edgeDir.current !== dir) {
                clearEdge();
                edgeDir.current = dir;
                edgeTimer.current = window.setTimeout(() => {
                    setPage(p => Math.max(0, Math.min(visiblePagesRef.current - 1, p + (dir === 'l' ? -1 : 1))));
                    edgeDir.current = null; edgeTimer.current = null;
                }, 600);
            }
        } else {
            clearEdge();
        }
    }
    function plop(ids: (string | null)[]) {
        setPlopIds(new Set(ids.filter((x): x is string => !!x)));
        if (plopTimer.current) window.clearTimeout(plopTimer.current);
        plopTimer.current = window.setTimeout(() => setPlopIds(new Set()), 460);
    }
    function endIconDrag() {
        dockOverRef.current = null;
        fromDockRef.current = false;
        setDragId(null); setOverCell(null); setDockOver(null); setDragFromDock(false);
    }
    function applyDockPlan(plan: DockPlan) {
        setDockIds(prev => (prev.length === plan.dock.length && prev.every((x, i) => x === plan.dock[i]) ? prev : plan.dock));
        setSlots(prev => (plan.slots === prev ? prev : normalize(plan.slots)));
    }
    function onIconUp() {
        if (!dragId) return;
        clearEdge();
        const armed = mergeCellRef.current;
        clearDwell();
        const dragged = dragId;
        const fromDock = fromDockRef.current;
        const onDock = dockOverRef.current;
        const from = fromPageRef.current * itemsPerPage() + fromCell.current;
        const to   = pageRef.current * itemsPerPage() + overCellRef.current;

        if (onDock !== null && !isFolderId(dragged)) {
            const plan = planDockDrag(dockDragOf(dragged, onDock, fromDock, from, pageRef.current, overCellRef.current, armed));
            if (plan) {
                applyDockPlan(plan);
                if (!fromDock) plop([dragged, plan.displaced]);
            }
            endIconDrag();
            return;
        }

        if (armed !== null && !isFolderId(dragged) && to !== from) {
            const targetId = slots[to];
            if (targetId) {
                if (isFolderId(targetId)) {
                    const key = folderKeyOf(targetId);
                    setFolders(prev => ({ ...prev, [key]: { ...prev[key], appIds: [...prev[key].appIds, dragged] } }));
                    if (!fromDock) setSlots(prev => normalize(prev.map((x, i) => (i === from ? null : x))));
                } else {
                    const key = newFolderKey();
                    setFolders(prev => ({ ...prev, [key]: { name: t('shell.folderDefaultName', 'Folder'), appIds: [targetId, dragged] } }));
                    setSlots(prev => normalize(prev.map((x, i) => (i === to ? FOLDER_PREFIX + key : (!fromDock && i === from) ? null : x))));
                    setOpenFolder(key); setRenameFolder(key);
                }
                if (fromDock) setDockIds(prev => prev.filter(x => x !== dragged));
                endIconDrag();
                return;
            }
        }

        if (fromDock) {
            const plan = planDockDrag(dockDragOf(dragged, null, true, from, pageRef.current, overCellRef.current, armed));
            if (plan && plan.landedCell !== null) {
                applyDockPlan(plan);
                plop([dragged, plan.intoDock]);
            }
            endIconDrag();
            return;
        }

        if (isFolderId(dragged) && to === from) {
            setOpenFolder(folderKeyOf(dragged));
            endIconDrag();
            return;
        }

        const dest = landingCell(slots, coveredByPage.get(pageRef.current), pageRef.current, overCellRef.current, itemsPerPage());
        if (dest === null) { endIconDrag(); return; }

        if (dest !== from) {
            const displaced = slots[dest] ?? null;
            setSlots(prev => {
                const n = [...prev];
                while (n.length <= dest) n.push(null);
                if (n[dest] === null) { n[dest] = n[from]; n[from] = null; }
                else { const t = n[dest]; n[dest] = n[from]; n[from] = t; }
                return normalize(n);
            });
            plop([dragged, displaced]);
        }
        endIconDrag();
    }

    function removeApp(id: string) {
        setSlots(prev => normalize(prev.map(x => (x === id ? null : x))));
        setDockIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev));
    }

    function ejectFromFolder(key: string, appId: string) {
        const f = folders[key];
        if (!f) return;
        const remaining = f.appIds.filter(id => id !== appId);
        if (remaining.length >= 2) {
            setFolders(prev => ({ ...prev, [key]: { ...prev[key], appIds: remaining } }));
        } else {
            const last = remaining[0] ?? null;
            setFolders(prev => { const n = { ...prev }; delete n[key]; return n; });
            setSlots(prev => normalize(prev.map(x => (x === FOLDER_PREFIX + key ? last : x))));
            setOpenFolder(null);
            setRenameFolder(null);
        }
    }
    function openAppStore() {
        const store = apps.find(a => a.id === 'appstore');
        setEditing(false);
        if (store) onLaunchApp(store, { x: 0.92, y: 0.08 });
    }

    const tx = -(page * SCREEN_W) + dragX;
    const padCell = dockPlan?.landedCell != null ? dockPlan.landedCell - page * itemsPerPage() : overCell;

    const parallaxOn = wallpaperParallax;
    const fracPage = page - dragX / SCREEN_W;
    const parallaxSpan = Math.max(1, visiblePages - 1);
    const parallaxTransform = `translateX(${(1 - (fracPage / parallaxSpan) * 2) * PARALLAX_SHIFT}px) scale(${blurHome ? 1.08 : PARALLAX_SCALE})`;

    const parallaxReady = useRef(false);
    useEffect(() => { parallaxReady.current = parallaxOn; }, [parallaxOn]);

    const dragWidget = dragW ? previewWidgets.find(w => w.uid === dragW.uid) : undefined;
    const dragWidgetDef = dragWidget ? widgetByKind(dragWidget.kind) : undefined;
    const dragWidgetBox = dragWidget ? widgetPx(dragWidget.size) : null;
    const dragWidgetPos = dragWidget ? slot(dragWidget.row * COLS + dragWidget.col) : null;
    const pillAt = dragW && dragWidget && reflowNote.count > 0 ? pillSpot(dragW.x, dragW.y, dragWidget.size) : null;


    return (
        <div ref={rootRef} className="absolute inset-0 select-none">
            <div
                className="wallpaper absolute inset-0"
                style={{
                    backgroundImage: `url(${resolveWallpaper(wallpaper)})`,
                    filter:    blurHome ? 'blur(28px) saturate(0.85)' : undefined,
                    transform: parallaxOn ? parallaxTransform : (blurHome ? 'scale(1.08)' : undefined),
                    transition: parallaxOn && parallaxReady.current && !isDraggingRef.current
                        ? 'transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94)'
                        : undefined,
                }}
            />
            <div className="pointer-events-none absolute inset-0 z-0 bg-black/20" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-52 bg-gradient-to-t from-black/40 to-transparent" />

            {galleryOpen && <WidgetGallery onAdd={addWidget} onClose={() => setGalleryOpen(false)} wallpaper={wallpaper} />}

            {stackFor && (() => {
                const host = widgets.find(w => w.uid === stackFor);
                if (!host) return null;
                return (
                    <WidgetGallery
                        lockSize={host.size}
                        onAdd={(kind, _size, align, theme) => addToStack(host.uid, kind, align, theme)}
                        onClose={() => setStackFor(null)}
                        wallpaper={wallpaper}
                    />
                );
            })()}

            {editing && (
                <div className="absolute left-0 right-0 top-[10px] z-50 flex items-center justify-between px-5">
                    <div className="flex items-center gap-2">
                        <button type="button" aria-label={t('shell.getApps','Get apps')} onClick={openAppStore} className="flex h-[34px] w-[42px] items-center justify-center rounded-full border border-white/25 bg-white/20 backdrop-blur-md active:opacity-70">
                            <Plus className="h-5 w-5 text-white" strokeWidth={2.6} />
                        </button>
                        <button type="button" aria-label={t('widgets.title','Add Widget')} onClick={() => setGalleryOpen(true)} className="flex h-[34px] w-[42px] items-center justify-center rounded-full border border-white/25 bg-white/20 backdrop-blur-md active:opacity-70">
                            <LayoutGrid className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />
                        </button>
                    </div>
                    <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-white/25 bg-white/20 px-4 py-1.5 text-[15px] font-semibold text-white backdrop-blur-md active:opacity-70">
                        {t('shell.done','Done')}
                    </button>
                </div>
            )}

            <div
                ref={stripRef}
                className="relative z-10 overflow-hidden"
                data-page-motion={pageMoving || undefined}
                style={{ marginTop: stripTop, height: `calc(100% - ${stripTop}px - ${stripReserve(grid, dockHidden)}px)` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <div
                    style={{
                        display: 'flex',
                        width: `${renderPages.length * SCREEN_W}px`,
                        transform: `translateX(${tx}px)`,
                        transition: isDraggingRef.current ? 'none' : 'transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94)',
                        willChange: 'transform',
                    }}
                >
                    {renderPages.map((cells, pi) => (
                        <div key={pi} style={{ width: SCREEN_W, flexShrink: 0, position: 'relative', height: ROWS * ROW_STRIDE + ROW_Y0 }}>
                            {editing && dragId && pi === page && padCell !== null && !(pi === fromPageRef.current && padCell === fromCell.current) && (
                                <div
                                    className="pointer-events-none absolute rounded-[18px] border border-white/40 bg-white/15"
                                    style={{ left: 0, top: 0, width: ICON, height: ICON, transform: `translate(${slot(padCell).x}px, ${slot(padCell).y}px)` }}
                                />
                            )}
                            {/* Landing pad under the dragged widget, so the snap target is visible. */}
                            {dragW && dropPreview && dragWidgetBox && pi === page && (
                                <div
                                    className="pointer-events-none absolute rounded-[22px] border border-white/40 bg-white/10"
                                    style={{
                                        left: 0, top: 0, width: dragWidgetBox.width, height: dragWidgetBox.height,
                                        transform: `translate(${slot(dropPreview.row * COLS + dropPreview.col).x}px, ${slot(dropPreview.row * COLS + dropPreview.col).y}px)`,
                                    }}
                                />
                            )}
                            {previewWidgets.filter(w => w.uid !== dragW?.uid && w.page === pi).map(w => {
                                const cards = cardsOf(w);
                                const at = Math.min(stackAt[w.uid] ?? 0, cards.length - 1);
                                const def = widgetByKind(cards[at].kind);
                                if (!def) return null;
                                const pos = slot(w.row * COLS + w.col);
                                const { width, height } = widgetPx(w.size);
                                return (
                                    <div key={w.uid}>
                                    <div
                                        onPointerDown={e => onWidgetDown(e, w)}
                                        style={{
                                            position: 'absolute', left: 0, top: 0,
                                            transform: `translate(${pos.x}px, ${pos.y}px)`,
                                            transition: 'transform 0.26s cubic-bezier(0.2,0.8,0.3,1)',
                                            zIndex: 1,
                                            touchAction: 'none',
                                            // Where this tile sits on the SCREEN, so a glass widget can crop its own
                                            // copy of the wallpaper to match the one behind it. Page index is absent
                                            // deliberately: the wallpaper does not scroll with the pages, so the same
                                            // cell on every page sits over the same part of it.
                                            '--glass-img': `url(${resolveWallpaper(wallpaper)})`,
                                            '--glass-w': `${SCREEN_W}px`,
                                            '--glass-h': `${SCREEN_H}px`,
                                            '--glass-x': `${-pos.x}px`,
                                            '--glass-y': `${-(stripTop + pos.y)}px`,
                                        } as CSSProperties}
                                    >
                                        <div
                                            ref={el => { if (el) widgetTileRefs.current[w.uid] = el; else delete widgetTileRefs.current[w.uid]; }}
                                            className={editing ? 'animate-app-jiggle' : ''}
                                            // --jiggle scales the wobble down for bigger tiles so a
                                            // 4x4 does not swing five times as far as an icon.
                                            style={editing
                                                ? { animationDelay: `${jiggleDelay(w.uid)}ms`, '--jiggle': `${jiggleDeg(w.size)}deg` } as CSSProperties
                                                : (bloom
                                                    ? { animation: 'home-icon-in 0.38s cubic-bezier(0.34,1.3,0.64,1) both', animationDelay: `${bloomDelay(w.uid)}ms` }
                                                    : undefined)}
                                            onClick={e => {
                                                if (editing) return;
                                                const a = appMap.get(def.appId);
                                                if (!a) return;
                                                // Zoom the app open from the widget itself, not the grid origin. Must
                                                // be SCREEN FRACTIONS like every other launch site - passing client
                                                // pixels here put the origin off-screen, so the app appeared with no
                                                // transition at all.
                                                launch(a, launchOriginFrom(e.currentTarget as HTMLElement));
                                            }}
                                        >
                                            <WidgetStack
                                                cards={cards}
                                                active={at}
                                                onActive={i => setStackAt(prev => ({ ...prev, [w.uid]: i }))}
                                                height={height}
                                                editing={editing}
                                                render={(card, ci) => {
                                                    const cd = widgetByKind(card.kind);
                                                    if (!cd) return null;
                                                    return cd.render({ size: w.size, width, height, align: card.align ?? 'left', theme: card.theme ?? 'dark', picks: card.picks,
                                                        onPicks: ids => setWidgets(prev => prev.map(o => (o.uid === w.uid ? patchCard(o, ci, { picks: ids.length ? ids : undefined }) : o))),
                                                        editing,
                                                        // Interactive custom widgets are real pointer targets, so their own
                                                        // clicks/long-presses no longer bubble out of the (cross-origin)
                                                        // iframe into this tile - they ask for the same behavior explicitly.
                                                        onOpen: () => {
                                                            if (editingRef.current || !homeActiveRef.current) return;
                                                            const a = appMap.get(cd.appId);
                                                            if (!a) return;
                                                            launch(a, launchOriginFrom(widgetTileRefs.current[w.uid] ?? null));
                                                        },
                                                        onLongPress: () => {
                                                            if (!homeActiveRef.current) return;
                                                            if (!editingRef.current) setEditing(true);
                                                        },
                                                    });
                                                }}
                                            />
                                        </div>
                                        {editing && (
                                            <>
                                            <button
                                                type="button"
                                                aria-label={cards.length > 1 ? t('widgets.removeCard', 'Remove from stack') : t('widgets.remove', 'Remove widget')}
                                                onPointerDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); dropCard(w.uid, at); }}
                                                className="absolute -left-1.5 -top-1.5 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#1c1c1e] text-white shadow-lg"
                                                style={{ border: '0.5px solid rgba(255,255,255,0.25)' }}
                                            >
                                                <Minus className="h-[15px] w-[15px]" strokeWidth={3} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={t('widgets.addToStack', 'Add to stack')}
                                                onPointerDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); setStackFor(w.uid); }}
                                                className="absolute -right-1.5 -top-1.5 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#1c1c1e] text-white shadow-lg"
                                                style={{ border: '0.5px solid rgba(255,255,255,0.25)' }}
                                            >
                                                <Plus className="h-[15px] w-[15px]" strokeWidth={3} />
                                            </button>
                                            </>
                                        )}
                                    </div>
                                    </div>
                                );
                            })}
                            {cells.map((id, li) => {
                                if (!id) return null;
                                if (coveredByPage.get(pi)?.has(li)) return null;
                                const s = slot(li);
                                const folder = isFolderId(id);
                                const fkey = folder ? folderKeyOf(id) : '';
                                const def = folder ? folders[fkey] : null;
                                const app = folder ? null : appMap.get(id);
                                if (folder ? !def : !app) return null;

                                if (!editing) {
                                    return (
                                        <div key={id} style={{ position: 'absolute', left: 0, top: 0, width: ICON, transform: `translate(${s.x}px, ${s.y}px)` }}>
                                            {/* Scale/opacity live on this inner div so the positioned parent's translate is untouched. */}
                                            <div style={bloom ? { animation: `${folder ? 'home-folder-in' : 'home-icon-in'} 0.38s cubic-bezier(0.34,1.3,0.64,1) both`, animationDelay: `${li * 20}ms` } : undefined}>
                                                {folder
                                                    ? <FolderTile label={def!.name} apps={folderApps(fkey)} badge={folderBadge(fkey)} onOpen={() => setOpenFolder(fkey)} />
                                                    : <AppIcon app={app!} onOpen={launch} badge={badges?.[app!.id]} />}
                                            </div>
                                        </div>
                                    );
                                }
                                if (id === dragId) return null;

                                if (folder) {
                                    const isMergeTarget = mergeCell !== null && pi === page && li === mergeCell;
                                    const isSwapTarget = !!dragId && pi === page && overCell !== null && li === overCell
                                        && !(pi === fromPageRef.current && overCell === fromCell.current) && !isMergeTarget;
                                    const slidePreview = isSwapTarget && page === fromPageRef.current && fromCell.current >= 0;
                                    const pos = slidePreview ? slot(fromCell.current) : s;
                                    return (
                                        <div
                                            key={id}
                                            onPointerDown={e => onIconDown(e, id, li)}
                                            style={{ position: 'absolute', left: 0, top: 0, width: ICON, transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'transform 0.26s cubic-bezier(0.2,0.8,0.3,1)', zIndex: isMergeTarget ? 2 : 1 }}
                                        >
                                            <div className="animate-app-jiggle" style={{ animationDelay: `${jiggleDelay(id)}ms` }}>
                                                <FolderTile label={def!.name} apps={folderApps(fkey)} badge={folderBadge(fkey)} merging={isMergeTarget} onOpen={() => { /* edit mode: drag, don't open */ }} />
                                            </div>
                                        </div>
                                    );
                                }
                                const isMergeTarget = mergeCell !== null && pi === page && li === mergeCell;
                                const isSwapTarget = !!dragId && pi === page && overCell !== null && li === overCell
                                    && !(pi === fromPageRef.current && overCell === fromCell.current) && !isMergeTarget;
                                const isDisplaced = dockPlan?.displacedCell === pi * itemsPerPage() + li;
                                const slidePreview = isSwapTarget && page === fromPageRef.current && fromCell.current >= 0;
                                const pos = slidePreview ? slot(fromCell.current) : s;
                                return (
                                    <div
                                        key={id}
                                        onPointerDown={e => onIconDown(e, id, li)}
                                        style={{
                                            position: 'absolute', left: 0, top: 0, width: ICON,
                                            transform: `translate(${pos.x}px, ${pos.y}px)`,
                                            transition: 'transform 0.26s cubic-bezier(0.2,0.8,0.3,1)',
                                            zIndex: 1,
                                        }}
                                    >
                                        <EditTile app={app!} dragging={false} swapTarget={isSwapTarget || isDisplaced} plopping={plopIds.has(id)} removable={!app!.base} merging={isMergeTarget} badge={badges?.[app!.id]} onRemove={() => setConfirmRemove(app!)} />
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                {pillAt && (
                    <div
                        className="pointer-events-none absolute left-0 top-0 z-[60] whitespace-nowrap rounded-full bg-black/85 px-3.5 py-2 font-sf text-[14px] font-semibold leading-none tracking-[-0.01em] text-white backdrop-blur-xl"
                        style={{
                            transform: `translate(${pillAt.x}px, ${pillAt.y}px) translateX(-50%)`,
                            border: '0.5px solid rgba(255,255,255,0.28)',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
                        }}
                    >
                        {reflowNote.count === 1
                            ? t('home.widgetMovesApp', '1 app moves to page {page}', { page: reflowNote.page + 1 })
                            : t('home.widgetMovesApps', '{count} apps move to page {page}', { count: reflowNote.count, page: reflowNote.page + 1 })}
                    </div>
                )}

            </div>

            {editing && dragId && (
                <div className="pointer-events-none absolute left-0 top-0 z-[60]" style={{ width: ICON, transform: `translate(${dragPos.x}px, ${stripTop + dragPos.y}px)` }}>
                    {isFolderId(dragId)
                        ? <div style={{ transform: 'scale(1.1)' }}><FolderTile label={folders[folderKeyOf(dragId)]?.name ?? ''} apps={folderApps(folderKeyOf(dragId))} badge={folderBadge(folderKeyOf(dragId))} onOpen={() => { /* lifted */ }} /></div>
                        : appMap.get(dragId) && <EditTile app={appMap.get(dragId)!} dragging swapTarget={false} plopping={false} removable={false} merging={false} onRemove={() => { /* lifted */ }} />}
                </div>
            )}

            {dragW && dragWidget && dragWidgetDef && dragWidgetBox && dragWidgetPos && (
                <div
                    className="absolute left-0 top-0 z-[60]"
                    style={{
                        transform: `translate(${dragW.x}px, ${stripTop + dragW.y}px) scale(1.06)`,
                        touchAction: 'none',
                        filter: 'drop-shadow(0 12px 22px rgba(0,0,0,0.45))',
                        '--glass-img': `url(${resolveWallpaper(wallpaper)})`,
                        '--glass-w': `${SCREEN_W}px`,
                        '--glass-h': `${SCREEN_H}px`,
                        '--glass-x': `${-dragWidgetPos.x}px`,
                        '--glass-y': `${-(stripTop + dragWidgetPos.y)}px`,
                    } as CSSProperties}
                >
                    <div>
                        {dragWidgetDef.render({ size: dragWidget.size, width: dragWidgetBox.width, height: dragWidgetBox.height, align: dragWidget.align ?? 'left', theme: dragWidget.theme ?? 'dark', picks: dragWidget.picks, editing,
                            onPicks: ids => setWidgets(prev => prev.map(o => (o.uid === dragWidget.uid ? { ...o, picks: ids.length ? ids : undefined } : o))) })}
                    </div>
                    {editing && (
                        <button
                            type="button"
                            aria-label={t('widgets.remove', 'Remove widget')}
                            onPointerDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); removeWidget(dragWidget.uid); }}
                            className="absolute -left-1.5 -top-1.5 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#1c1c1e] text-white shadow-lg"
                            style={{ border: '0.5px solid rgba(255,255,255,0.25)' }}
                        >
                            <Minus className="h-[15px] w-[15px]" strokeWidth={3} />
                        </button>
                    )}
                </div>
            )}

            <div className="absolute left-0 right-0 z-10 flex justify-center" style={{ bottom: DOTS_BOTTOM }}>
                {visiblePages > 1 && (
                    <div className="flex items-center gap-[7px] rounded-full bg-black/35 px-2.5 py-[7px] shadow-sm backdrop-blur-md">
                        {renderPages.map((_, i) => {
                            const dist = Math.min(1, Math.abs(i - (page - dragX / SCREEN_W)));
                            return <div key={i} style={{ opacity: 1 - dist * 0.62, transition: isDraggingRef.current ? 'none' : 'opacity 0.3s ease' }} className="h-[7px] w-[7px] rounded-full bg-white" />;
                        })}
                    </div>
                )}
            </div>

            {dockStyle !== 'hidden' && (
            <div
                ref={dockRef}
                className={DOCK_FILL
                    ? 'absolute bottom-5 left-4 right-4 z-10'
                    : 'absolute bottom-5 left-1/2 z-10 -translate-x-1/2'}
                onPointerDown={armLongPress}
                onPointerMove={longPressMove}
                onPointerUp={clearLP}
                onPointerCancel={clearLP}
            >
                <div
                    ref={dockRowRef}
                    className={`flex items-center rounded-[28px] py-3.5 ${DOCK_TRAY[dockStyle]} ${DOCK_FILL ? 'px-4' : 'gap-5 px-5'}`}
                >
                    {dockView.map((app, di) => (
                        <div
                            key={app.id}
                            data-dock-idx={di}
                            data-dock-id={app.id}
                            onPointerDown={e => onDockIconDown(e, app.id, di)}
                            className={DOCK_SLOT}
                            style={DOCK_FILL ? { touchAction: 'none' } : { touchAction: 'none', width: TILE }}
                        >
                            {!!dragId && (dockOver === di || app.id === dockPlan?.intoDock) && (
                                <div
                                    className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
                                    style={{ width: TILE, height: TILE, borderRadius: '27.6%', boxShadow: '0 0 0 3.5px rgba(255,255,255,0.92), 0 2px 12px rgba(0,0,0,0.42)' }}
                                />
                            )}
                            {app.id === dragId
                                ? <div style={{ width: TILE, height: TILE }} />
                                : (
                                    <div
                                        className={editing ? 'animate-app-jiggle' : ''}
                                        style={editing
                                            ? { animationDelay: `${jiggleDelay(app.id)}ms` }
                                            : (bloom ? { animation: 'home-icon-in 0.38s cubic-bezier(0.34,1.3,0.64,1) both', animationDelay: `${140 + di * 25}ms` } : undefined)}
                                    >
                                        <AppIcon app={app} label={false} onOpen={launch} badge={badges?.[app.id]} />
                                        {editing && !app.base && (
                                            <button
                                                type="button"
                                                aria-label={t('shell.removeApp','Remove {label}', { label: appLabel(app) })}
                                                onPointerDown={e => e.stopPropagation()}
                                                onClick={() => setConfirmRemove(app)}
                                                className="absolute z-10 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#e4e4e6] shadow-[0_1px_3px_rgba(0,0,0,0.4)] active:scale-90"
                                                style={{ left: `calc(50% - ${TILE / 2 + 7}px)`, top: -7 }}
                                            >
                                                <Minus className="h-[16px] w-[16px] text-black/75" strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>
                                )}
                        </div>
                    ))}
                    {dockOver !== null && !dragFromDock && dockView.length < DOCK_MAX && (
                        <div
                            data-dock-idx={dockView.length}
                            className={DOCK_SLOT}
                            style={DOCK_FILL ? { touchAction: 'none' } : { touchAction: 'none', width: TILE }}
                        >
                            <div
                                className="border border-white/40 bg-white/10"
                                style={{ width: TILE, height: TILE, borderRadius: '27.6%', boxShadow: dockOver === dockView.length ? '0 0 0 3.5px rgba(255,255,255,0.92)' : undefined }}
                            />
                        </div>
                    )}
                </div>
            </div>
            )}

            {openFolder && folders[openFolder] && (
                <FolderOverlay
                    name={folders[openFolder].name}
                    apps={folderApps(openFolder)}
                    badges={badges}
                    editing={editing}
                    autoEdit={renameFolder === openFolder}
                    wallpaper={wallpaper}
                    onRename={(name) => setFolders(prev => ({ ...prev, [openFolder]: { ...prev[openFolder], name: name.trim() || t('shell.folderDefaultName', 'Folder') } }))}
                    onSwap={(a, b) => setFolders(prev => {
                        const ids = [...prev[openFolder].appIds];
                        [ids[a], ids[b]] = [ids[b], ids[a]];
                        return { ...prev, [openFolder]: { ...prev[openFolder], appIds: ids } };
                    })}
                    onEject={(appId) => ejectFromFolder(openFolder, appId)}
                    onLaunch={onLaunchApp}
                    onClose={() => { setOpenFolder(null); setRenameFolder(null); }}
                />
            )}

            {confirmRemove && (
                <AlertDialog
                    title={t('shell.removeAppTitle','Remove “{label}”?', { label: appLabel(confirmRemove) })}
                    message={t('shell.removeAppMessage','It stays available in the App Store and can be added back later.')}
                    confirmLabel={t('shell.remove','Remove')}
                    destructive
                    onCancel={() => setConfirmRemove(null)}
                    onConfirm={() => { removeApp(confirmRemove.id); onUninstall?.(confirmRemove.id); setConfirmRemove(null); }}
                />
            )}
        </div>
    );
}

function EditTile({ app, dragging, swapTarget, plopping, removable, merging, badge, onRemove }: { app: AppDef; dragging: boolean; swapTarget: boolean; plopping: boolean; removable: boolean; merging: boolean; badge?: number; onRemove: () => void }): ReactNode {
    const grid = useGrid();
    const TILE = grid.icon;
    const showNames = useShowAppNames();
    const {
        background, glyph, art, radius, glyphSize, glyphWeight, boxShadow,
        labelColor, labelWeight, labelShow, icon: glyphOverride,
    } = useIconAppearance(app.id, app.accent);
    const showLabel = labelShow ?? showNames;
    return (
        <div className={dragging ? '' : 'animate-app-jiggle'} style={{ animationDelay: `${jiggleDelay(app.id)}ms` }}>
            <div className="relative">
                {merging && <div className="pointer-events-none absolute -inset-[8px] rounded-[30%] bg-white/25 backdrop-blur-sm" />}
                <div className={`relative overflow-hidden transition-[box-shadow,transform] duration-150 ${plopping ? 'animate-plop' : ''}`} style={{ width: TILE, height: TILE, borderRadius: radiusPct(radius), boxShadow: [swapTarget ? '0 2px 12px rgba(0,0,0,0.42), 0 0 0 3.5px rgba(255,255,255,0.92)' : TILE_SHADOW, boxShadow].filter(Boolean).join(', '), transform: dragging || merging ? 'scale(1.12)' : undefined }}>
                    {art === 'native' ? (
                        <div style={{ width: ART, height: ART, transform: `scale(${TILE / ART})`, transformOrigin: '0 0' }}>
                            <AppIconSVG icon={app.icon} />
                        </div>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center" style={{ background }}>
                            <AppGlyph icon={app.icon} override={glyphOverride} label={appLabel(app)} color={glyph} size={glyphSize} strokeWidth={glyphWeight} />
                        </div>
                    )}
                    {boxShadow !== '' && (
                        <div className="pointer-events-none absolute inset-0" style={{ borderRadius: radiusPct(radius), boxShadow }} />
                    )}
                </div>
                {!dragging && <AppBadge count={badge} />}
                {removable && (
                    <button type="button" aria-label={t('shell.removeApp','Remove {label}', { label: appLabel(app) })} onPointerDown={e => e.stopPropagation()} onClick={onRemove} className="absolute -left-[7px] -top-[7px] flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#e4e4e6] shadow-[0_1px_3px_rgba(0,0,0,0.4)] active:scale-90">
                        <Minus className="h-[16px] w-[16px] text-black/75" strokeWidth={3} />
                    </button>
                )}
            </div>
            {showLabel && <span className={`mt-[7px] block ${APP_LABEL_CLASS}`} style={{ ...appLabelStyle(grid), color: labelColor, fontWeight: labelWeight }}>{appLabel(app)}</span>}
        </div>
    );
}

const TILE_RADIUS = 0.276;
const MINI_RADIUS = 0.30;
const TILE_GLYPH  = 40;
const MINI_GLYPH  = 10;
// One cell of the folder's 3x3 preview: the tile less its 9px padding and two 3px gutters. Derived
// rather than fixed so a native mini keeps filling its cell when the tile follows a bigger profile.
function miniOf(tile: number): number {
    return (tile - 9 * 2 - 3 * 2) / 3;
}

function FolderMini({ app }: { app: AppDef }): ReactNode {
    const MINI = miniOf(useGrid().icon);
    const { background, glyph, art, radius, glyphSize, glyphWeight, icon: glyphOverride } = useIconAppearance(app.id, app.accent);
    return (
        <div className="overflow-hidden" style={{ borderRadius: radiusPct(radius * (MINI_RADIUS / TILE_RADIUS)) }}>
            {art === 'native' ? (
                <div style={{ width: ART, height: ART, transform: `scale(${MINI / ART})`, transformOrigin: '0 0' }}>
                    <AppIconSVG icon={app.icon} />
                </div>
            ) : (
                <div className="flex h-full w-full items-center justify-center" style={{ background }}>
                    <AppGlyph
                        icon={app.icon}
                        override={glyphOverride}
                        label={appLabel(app)}
                        color={glyph}
                        size={Math.round(glyphSize * (MINI_GLYPH / TILE_GLYPH))}
                        strokeWidth={glyphWeight}
                    />
                </div>
            )}
        </div>
    );
}

function FolderTile({ label, apps, onOpen, merging = false, badge }: { label: string; apps: AppDef[]; onOpen: () => void; merging?: boolean; badge?: number }): ReactNode {
    const grid = useGrid();
    const TILE = grid.icon;
    const showNames = useShowAppNames();
    return (
        <button type="button" onClick={onOpen} className="group block" style={{ width: TILE }}>
            <div className="relative">
                <div
                    className="grid grid-cols-3 grid-rows-3 gap-[3px] overflow-hidden p-[9px] backdrop-blur-xl transition-[transform,box-shadow] duration-150 group-active:scale-[0.94]"
                    style={{
                        width:        TILE,
                        height:       TILE,
                        borderRadius: '27.6%',
                        background: merging ? 'rgba(118,122,132,0.6)' : 'rgba(70,70,78,0.42)',
                        boxShadow: merging
                            ? 'inset 0 0 0 0.5px rgba(255,255,255,0.3), 0 3px 16px rgba(0,0,0,0.45), 0 0 0 3.5px rgba(255,255,255,0.92)'
                            : 'inset 0 0 0 0.5px rgba(255,255,255,0.18), 0 2px 10px rgba(0,0,0,0.4)',
                        transform: merging ? 'scale(1.14)' : undefined,
                    }}
                >
                    {apps.slice(0, 9).map(a => <FolderMini key={a.id} app={a} />)}
                </div>
                <AppBadge count={badge} />
            </div>
            {showNames && <span className={`mt-[7px] block ${APP_LABEL_CLASS}`} style={appLabelStyle(grid)}>{label}</span>}
        </button>
    );
}

function FolderOverlay({ name, apps, badges, editing: homeEditing, autoEdit, wallpaper, onRename, onSwap, onEject, onLaunch, onClose }: {
    name: string;
    apps: AppDef[];
    badges?: Record<string, number>;
    editing: boolean;
    autoEdit: boolean;
    wallpaper: string;
    onRename: (name: string) => void;
    onSwap: (a: number, b: number) => void;
    onEject: (appId: string) => void;
    onLaunch: (app: AppDef, origin: { x: number; y: number }) => void;
    onClose: () => void;
}): ReactNode {
    const TILE = useGrid().icon;
    const panelRef = useRef<HTMLDivElement>(null);
    const [localEdit, setLocalEdit] = useState(false);
    const editing = homeEditing || localEdit;
    const editingRef = useRef(editing);
    editingRef.current = editing;

    const [editName, setEditName] = useState(autoEdit);
    const [draft, setDraft] = useState(name);
    function commitName() { setEditName(false); const n = draft.trim() || t('shell.folderDefaultName', 'Folder'); if (n !== name) onRename(n); }

    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
    const [overIdx, setOverIdx] = useState<number | null>(null);
    const [plopIds, setPlopIds] = useState<Set<string>>(() => new Set());
    const dragIdxRef = useRef<number | null>(null);
    const startRef = useRef({ x: 0, y: 0 });
    const grabZoom = useRef(1);
    const movedRef = useRef(false);
    const overRef = useRef<number | null>(null);
    const outsideRef = useRef(false);
    const lpTimer = useRef<number | null>(null);
    const lpFired = useRef(false);
    const plopTimer = useRef<number | null>(null);
    const capPid = useRef(0);
    const downIdxRef = useRef<number | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const posRef = useRef<{ left: number; top: number }[]>([]);
    const clearLP = () => { if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null; } };
    useEffect(() => () => { clearLP(); if (plopTimer.current) window.clearTimeout(plopTimer.current); }, []);

    function hitTest(cx: number, cy: number) {
        const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
        const inside = !!el && !!panelRef.current && panelRef.current.contains(el);
        const fidx = el?.closest('[data-fidx]')?.getAttribute('data-fidx');
        return { inside, over: inside && fidx != null ? Number(fidx) : null };
    }
    function beginDrag(idx: number) {
        const cells = gridRef.current?.children;
        posRef.current = cells ? Array.from(cells).map(c => { const el = c as HTMLElement; return { left: el.offsetLeft, top: el.offsetTop }; }) : [];
        grabZoom.current = ancestorZoom(panelRef.current);
        dragIdxRef.current = idx; overRef.current = null; outsideRef.current = false;
        setDragIdx(idx); setDragDelta({ x: 0, y: 0 }); setOverIdx(null);
        try { panelRef.current?.setPointerCapture(capPid.current); } catch { /* ignore */ }
    }
    function onCellDown(e: ReactPointerEvent, idx: number) {
        e.stopPropagation();
        capPid.current = e.pointerId;
        downIdxRef.current = idx;
        startRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false; lpFired.current = false;
        if (editingRef.current) {
            beginDrag(idx);
        } else {
            clearLP();
            lpTimer.current = window.setTimeout(() => { lpFired.current = true; setLocalEdit(true); beginDrag(idx); }, 420);
        }
    }
    function onPanelMove(e: ReactPointerEvent) {
        if (dragIdxRef.current !== null) {
            setDragDelta({ x: (e.clientX - startRef.current.x) / grabZoom.current, y: (e.clientY - startRef.current.y) / grabZoom.current });
            const { inside, over } = hitTest(e.clientX, e.clientY);
            outsideRef.current = !inside;
            if (!inside) { overRef.current = null; setOverIdx(null); }
            else if (over !== null && over !== dragIdxRef.current) { overRef.current = over; setOverIdx(over); }
            else if (over === dragIdxRef.current) { overRef.current = null; setOverIdx(null); }
            // else (inside, over a gap): keep the current overRef / overIdx
        } else if (lpTimer.current !== null) {
            const dx = e.clientX - startRef.current.x, dy = e.clientY - startRef.current.y;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) { movedRef.current = true; clearLP(); }
        }
    }
    function onPanelUp(e: ReactPointerEvent) {
        clearLP();
        if (dragIdxRef.current !== null) {
            const from = dragIdxRef.current;
            const to = overRef.current;
            const { inside } = hitTest(e.clientX, e.clientY);
            dragIdxRef.current = null; setDragIdx(null); setDragDelta({ x: 0, y: 0 }); setOverIdx(null); overRef.current = null;
            downIdxRef.current = null;
            if (!inside) { onEject(apps[from].id); return; }
            if (to !== null && to !== from) {
                onSwap(from, to);
                setPlopIds(new Set([apps[from].id, apps[to].id]));
                if (plopTimer.current) window.clearTimeout(plopTimer.current);
                plopTimer.current = window.setTimeout(() => setPlopIds(new Set()), 460);
            }
            return;
        }
        const idx = downIdxRef.current;
        downIdxRef.current = null;
        if (idx !== null && !editingRef.current && !movedRef.current && !lpFired.current) {
            onClose();
            onLaunch(apps[idx], { x: 0.5, y: 0.5 });
        }
    }

    return (
        <div className="absolute inset-0 z-[70]" onPointerDown={onClose}>
            <div
                className="absolute inset-0"
                style={{ backgroundImage: `url(${resolveWallpaper(wallpaper)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(34px) brightness(0.5)', transform: 'scale(1.18)' }}
            />
            <div className="absolute inset-0 bg-black/40" />

            {localEdit && (
                <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => setLocalEdit(false)} className="absolute right-5 top-[58px] z-20 rounded-full border border-white/25 bg-white/20 px-4 py-1.5 text-[15px] font-semibold text-white backdrop-blur-md active:opacity-70">
                    {t('shell.done','Done')}
                </button>
            )}

            <div className="relative z-10 flex h-full flex-col items-center pt-[150px]" style={{ animation: 'folder-open 0.26s cubic-bezier(0.2,0.9,0.3,1.08)' }}>
                {editName ? (
                    <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={e => { if (e.key === 'Enter') commitName(); }}
                        onPointerDown={e => e.stopPropagation()}
                        maxLength={24}
                        className="mb-6 w-[60%] rounded-[10px] bg-white/15 px-3 py-1 text-center text-[28px] font-extrabold text-white outline-none placeholder-white/50"
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
                    />
                ) : (
                    <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => { setDraft(name); setEditName(true); }} className="mb-6 text-[30px] font-extrabold text-white active:opacity-70" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                        {name}
                    </button>
                )}
                <div
                    ref={panelRef}
                    onPointerDown={e => e.stopPropagation()}
                    onPointerMove={onPanelMove}
                    onPointerUp={onPanelUp}
                    onPointerCancel={onPanelUp}
                    style={{ touchAction: 'none' }}
                    className="w-[calc(100%-48px)] rounded-[34px] border border-white/15 bg-white/10 p-5 backdrop-blur-2xl"
                >
                    {/* A folder page is its own 4-up grid, not the home grid, so it does not follow device cols. */}
                    <div ref={gridRef} className="relative grid grid-cols-4 gap-x-3 gap-y-5">
                        {apps.map((a, i) => {
                            const isDragging = dragIdx === i;
                            const isOver = overIdx === i && !isDragging;
                            const jiggle = editing && !isDragging && !plopIds.has(a.id);
                            let transform: string | undefined;
                            if (isDragging) {
                                transform = `translate(${dragDelta.x}px, ${dragDelta.y}px) scale(1.1)`;
                            } else if (isOver && dragIdx !== null && posRef.current[dragIdx] && posRef.current[i]) {
                                transform = `translate(${posRef.current[dragIdx].left - posRef.current[i].left}px, ${posRef.current[dragIdx].top - posRef.current[i].top}px)`;
                            }
                            return (
                            <div
                                key={a.id}
                                data-fidx={i}
                                onPointerDown={e => onCellDown(e, i)}
                                className="relative"
                                style={{
                                    touchAction: 'none',
                                    transform,
                                    transition: isDragging ? 'none' : 'transform 0.18s cubic-bezier(0.2,0.8,0.3,1)',
                                    zIndex: isDragging ? 2 : undefined,
                                    opacity: isDragging ? 0.85 : undefined,
                                    pointerEvents: isDragging ? 'none' : undefined,
                                }}
                            >
                                {isOver && (
                                    <div className="pointer-events-none absolute left-0 top-0" style={{ width: TILE, height: TILE, borderRadius: '27.6%', boxShadow: '0 0 0 3.5px rgba(255,255,255,0.92), 0 2px 12px rgba(0,0,0,0.42)' }} />
                                )}
                                <div
                                    className={plopIds.has(a.id) ? 'animate-plop' : (jiggle ? 'animate-app-jiggle' : '')}
                                    style={jiggle ? { animationDelay: `${jiggleDelay(a.id)}ms` } : undefined}
                                >
                                    <AppIcon app={a} badge={badges?.[a.id]} onOpen={() => { /* launch handled by the cell gesture */ }} />
                                </div>
                                {editing && (
                                    <button
                                        type="button"
                                        aria-label={t('shell.removeFromFolder','Remove {label} from folder', { label: a.label })}
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => onEject(a.id)}
                                        className="absolute -left-[6px] -top-[6px] z-10 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#e4e4e6] shadow-[0_1px_3px_rgba(0,0,0,0.4)] active:scale-90"
                                    >
                                        <Minus className="h-[16px] w-[16px] text-black/75" strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
