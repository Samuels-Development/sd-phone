import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { LayoutGrid, Minus, Plus } from 'lucide-react';

import type { AppDef } from '@/core/types';
import { useTheme } from '@/stores/themeStore';
import { resolveWallpaper } from './wallpapers';
import { AppIcon } from './AppIcon';
import { AppIconSVG } from './AppIconSVG';
import { AppBadge } from './AppBadge';
import { useBadges } from '@/stores/badgeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import type { SavedLayout, WidgetAlign, WidgetPlacement, WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import { SPAN, coveredCells, firstFit, jiggleDeg, pageMoves, reflowAround, widgetPx } from './widgets/geometry';
import { widgetByKind } from './widgets/registry';
import { launchOriginFrom } from './launchOrigin';
import { WidgetGallery } from './widgets/WidgetGallery';
import { t } from '@/i18n';


const COLS = 4;
const ROWS = 6;
const ITEMS_PER_PAGE = COLS * ROWS;
const SCREEN_W = 440;
const SCREEN_H = 956;
const COMMIT_THRESHOLD = SCREEN_W * 0.2;
const FLICK_VELOCITY = 0.4;

const PAD_X = 28;
const ICON = 78;
const COL_STRIDE = ICON + 24;
const ROW_Y0 = 8;
const ROW_STRIDE = 122;
const stripTop = 70;

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
function slot(localCell: number) {
    return { x: PAD_X + (localCell % COLS) * COL_STRIDE, y: ROW_Y0 + Math.floor(localCell / COLS) * ROW_STRIDE };
}
function cellFromCenter(cx: number, cy: number) {
    const c = Math.max(0, Math.min(COLS - 1, Math.round((cx - PAD_X - ICON / 2) / COL_STRIDE)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.round((cy - ROW_Y0 - ICON / 2) / ROW_STRIDE)));
    return r * COLS + c;
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
    const filledPages = Math.floor(lastFilledIndex(arr) / ITEMS_PER_PAGE) + 1;
    const want = (filledPages + 1) * ITEMS_PER_PAGE;
    const out = arr.slice(0, want);
    while (out.length < want) out.push(null);
    return out;
}
function jiggleDelay(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return -(h % 180);
}

function widgetClash(widgets: WidgetPlacement[], uid: string | undefined, size: WidgetSize, page: number, col: number, row: number): boolean {
    const target = new Set(coveredCells({ size, col, row }));
    return widgets.some(o => o.uid !== uid && o.page === page && coveredCells(o).some(c => target.has(c)));
}

function pillSpot(x: number, y: number, size: WidgetSize): { x: number; y: number } {
    const { width, height } = widgetPx(size);
    const gridH = ROWS * ROW_STRIDE + ROW_Y0;
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
    wallpaper:    string;
    onLaunchApp:  (app: AppDef, origin: { x: number; y: number }) => void;
    onUninstall?: (id: string) => void;
    savedLayout?: SavedLayout | null;
    onLayoutChange?: (layout: SavedLayout) => void;
    onEditingChange?: (editing: boolean) => void;
    /** Play the icon bloom on mount; false when the phone is revealed with an app on top. */
    bloomOnMount?: boolean;
}

export function Homescreen({ apps, dock, wallpaper, onLaunchApp, onUninstall, savedLayout, onLayoutChange, onEditingChange, bloomOnMount = true }: HomescreenProps) {
    const { blurHome } = useTheme('blurHome');
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
    const dockApps = useMemo(
        () => dock.map(id => apps.find(a => a.id === id)).filter((a): a is AppDef => !!a),
        [apps, dock],
    );

    const [folders, setFolders] = useState<Record<string, { name: string; appIds: string[] }>>(() => {
        const out: Record<string, { name: string; appIds: string[] }> = {};
        for (const f of savedLayout?.folders ?? []) out[f.key] = { name: f.name, appIds: [...f.appIds] };
        return out;
    });
    const folderedIds = useMemo(() => new Set(Object.values(folders).flatMap(f => f.appIds)), [folders]);

    const [slots, setSlots] = useState<(string | null)[]>(() => {
        if (savedLayout && savedLayout.slots.length) return normalize(savedLayout.slots);
        const seeded = new Set(Object.values(folders).flatMap(f => f.appIds));
        const loose = apps.filter(a => !dock.includes(a.id) && !seeded.has(a.id)).map(a => a.id);
        const FIRST_PAGE = 12;
        const arr: (string | null)[] = Array(ITEMS_PER_PAGE * 2).fill(null);
        loose.slice(0, FIRST_PAGE).forEach((id, i) => { arr[i] = id; });
        loose.slice(FIRST_PAGE).forEach((id, i) => { arr[ITEMS_PER_PAGE + i] = id; });
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
        setSlots(prev => {
            const cleaned = prev.map(id => {
                if (!id) return id;
                if (isFolderId(id)) return folderKeys.has(folderKeyOf(id)) ? id : null;
                if (folderedIds.has(id)) return null;
                return known.has(id) ? id : null;
            });
            const placed = new Set(cleaned.filter((x): x is string => !!x && !isFolderId(x)));
            const missing = apps
                .filter(a => !dock.includes(a.id) && !folderedIds.has(a.id) && !placed.has(a.id))
                .map(a => a.id);
            if (!missing.length && cleaned.every((v, i) => v === prev[i])) return prev;
            const next = [...cleaned];
            for (const id of missing) {
                const idx = next.indexOf(null);
                if (idx === -1) next.push(id); else next[idx] = id;
            }
            return normalize(next);
        });
    }, [apps, dock, folders, folderedIds]);

    const [widgets, setWidgets] = useState<WidgetPlacement[]>(() => savedLayout?.widgets ?? []);
    // Read by the drag listeners, which are bound once per drag and would otherwise close over
    // the widget list as it was when the drag started.
    const widgetsRef = useRef(widgets);
    widgetsRef.current = widgets;

    const latestRef = useRef<SavedLayout>({ slots, folders: [], widgets: [] });
    latestRef.current = {
        slots,
        folders: Object.entries(folders).map(([key, f]) => ({ key, name: f.name, appIds: f.appIds })),
        widgets,
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
    }, [slots, folders, widgets]);
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
        const spot = firstFit(size, pageRef.current, slots, widgets, ITEMS_PER_PAGE);
        if (!spot) return false;
        const next: WidgetPlacement[] = [...widgets, {
            uid: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
            kind, size, align, theme, page: pageRef.current, col: spot.col, row: spot.row,
            ...(picks?.length ? { picks } : {}),
        }];
        setWidgets(next);
        setSlots(prev => normalize(reflowAround(prev, next, ITEMS_PER_PAGE)));
        setGalleryOpen(false);
        return true;
    }, [slots, widgets]);

    const removeWidget = useCallback((uid: string) => {
        setWidgets(prev => prev.filter(w => w.uid !== uid));
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
        const span = SPAN[size];
        const col = Math.max(0, Math.min(COLS - span.w, Math.round((x - PAD_X) / COL_STRIDE)));
        const row = Math.max(0, Math.min(ROWS - span.h, Math.round((y - ROW_Y0) / ROW_STRIDE)));
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
            const span = SPAN[dragSizeRef.current];
            const px = x + (span.w * COL_STRIDE) / 2;
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

            // Only other WIDGETS block a move.
            if (widgetClash(widgetsRef.current, uid, dragSizeRef.current, toPage, spot.col, spot.row)) return;

            const next = widgetsRef.current.map(o => (o.uid === uid ? { ...o, page: toPage, col: spot.col, row: spot.row } : o));
            setWidgets(next);
            setSlots(prev => normalize(reflowAround(prev, next, ITEMS_PER_PAGE)));
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
        if (widgetClash(widgets, uid, held.size, dropPreview.page, dropPreview.col, dropPreview.row)) return widgets;
        return widgets.map(w => (w.uid === uid
            ? { ...w, page: dropPreview.page, col: dropPreview.col, row: dropPreview.row }
            : w));
    }, [widgets, dragW?.uid, dropPreview]);

    const previewSlots = useMemo(
        () => (previewWidgets === widgets ? slots : reflowAround(slots, previewWidgets, ITEMS_PER_PAGE)),
        [slots, widgets, previewWidgets],
    );

    const pages = useMemo(() => chunk(previewSlots, ITEMS_PER_PAGE), [previewSlots]);
    const reflowNote = useMemo(() => pageMoves(slots, previewSlots, ITEMS_PER_PAGE), [slots, previewSlots]);

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
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [overCell, setOverCell] = useState<number | null>(null);
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
    const lastIconPage   = Math.floor(lastFilledIndex(slots) / ITEMS_PER_PAGE);
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
        while (out.length < visiblePages) out.push(Array<string | null>(ITEMS_PER_PAGE).fill(null));
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

    function onPointerDown(e: ReactPointerEvent) {
        startXRef.current = e.clientX; startYRef.current = e.clientY;
        lastXRef.current = e.clientX; lastTRef.current = e.timeStamp; velRef.current = 0;
        lockedAxis.current = null; capturedRef.current = false; isDraggingRef.current = true;
        if (!editing) { clearLP(); lpTimer.current = window.setTimeout(() => setEditing(true), 450); }
    }
    function onPointerMove(e: ReactPointerEvent) {
        if (dragId) { onIconMove(e); return; }
        if (!isDraggingRef.current) return;
        const dx = e.clientX - startXRef.current, dy = e.clientY - startYRef.current;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLP();
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
        setDragId(id); setDragPos(s); setOverCell(localCell);
        stripRef.current?.setPointerCapture(e.pointerId);
    }
    function onIconMove(e: ReactPointerEvent) {
        if (!dragId) return;
        const z = grabZoom.current;
        const x = grabSlot.current.x + (e.clientX - startClient.current.x) / z;
        const y = grabSlot.current.y + (e.clientY - startClient.current.y) / z;
        setDragPos({ x, y });
        const over = cellFromCenter(x + ICON / 2, y + ICON / 2);
        overCellRef.current = over;
        setOverCell(over);
        const targetId = slots[pageRef.current * ITEMS_PER_PAGE + over] ?? null;
        const sameAsOrigin = pageRef.current === fromPageRef.current && over === fromCell.current;
        if (!isFolderId(dragId) && targetId && !sameAsOrigin) {
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
    function onIconUp() {
        if (!dragId) return;
        clearEdge();
        const armed = mergeCellRef.current;
        clearDwell();
        const dragged = dragId;
        const from = fromPageRef.current * ITEMS_PER_PAGE + fromCell.current;
        const to   = pageRef.current * ITEMS_PER_PAGE + overCellRef.current;

        if (armed !== null && !isFolderId(dragged) && to !== from) {
            const targetId = slots[to];
            if (targetId) {
                if (isFolderId(targetId)) {
                    const key = folderKeyOf(targetId);
                    setFolders(prev => ({ ...prev, [key]: { ...prev[key], appIds: [...prev[key].appIds, dragged] } }));
                    setSlots(prev => normalize(prev.map((x, i) => (i === from ? null : x))));
                } else {
                    const key = newFolderKey();
                    setFolders(prev => ({ ...prev, [key]: { name: 'Folder', appIds: [targetId, dragged] } }));
                    setSlots(prev => normalize(prev.map((x, i) => (i === to ? FOLDER_PREFIX + key : i === from ? null : x))));
                    setOpenFolder(key); setRenameFolder(key);
                }
                setDragId(null); setOverCell(null);
                return;
            }
        }

        if (isFolderId(dragged) && to === from) {
            setOpenFolder(folderKeyOf(dragged));
            setDragId(null); setOverCell(null);
            return;
        }

        if (to !== from) {
            const displaced = slots[to] ?? null;
            setSlots(prev => {
                const n = [...prev];
                while (n.length <= to) n.push(null);
                if (n[to] === null) { n[to] = n[from]; n[from] = null; }
                else { const t = n[to]; n[to] = n[from]; n[from] = t; }
                return normalize(n);
            });
            setPlopIds(new Set(displaced ? [dragged, displaced] : [dragged]));
            if (plopTimer.current) window.clearTimeout(plopTimer.current);
            plopTimer.current = window.setTimeout(() => setPlopIds(new Set()), 460);
        }
        setDragId(null); setOverCell(null);
    }

    function removeApp(id: string) {
        setSlots(prev => normalize(prev.map(x => (x === id ? null : x))));
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

    const dragWidget = dragW ? widgets.find(w => w.uid === dragW.uid) : undefined;
    const pillAt = dragW && dragWidget && reflowNote.count > 0 ? pillSpot(dragW.x, dragW.y, dragWidget.size) : null;


    return (
        <div className="absolute inset-0 select-none">
            <div
                className="wallpaper absolute inset-0"
                style={{
                    backgroundImage: `url(${resolveWallpaper(wallpaper)})`,
                    filter:    blurHome ? 'blur(28px) saturate(0.85)' : undefined,
                    transform: blurHome ? 'scale(1.08)'               : undefined,
                }}
            />
            <div className="pointer-events-none absolute inset-0 z-0 bg-black/20" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-52 bg-gradient-to-t from-black/40 to-transparent" />

            {galleryOpen && <WidgetGallery onAdd={addWidget} onClose={() => setGalleryOpen(false)} wallpaper={wallpaper} />}

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
                style={{ marginTop: stripTop, height: `calc(100% - ${stripTop}px - 104px)` }}
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
                            {editing && dragId && pi === page && overCell !== null && !(pi === fromPageRef.current && overCell === fromCell.current) && (
                                <div
                                    className="pointer-events-none absolute rounded-[18px] border border-white/40 bg-white/15"
                                    style={{ left: 0, top: 0, width: ICON, height: ICON, transform: `translate(${slot(overCell).x}px, ${slot(overCell).y}px)` }}
                                />
                            )}
                            {/* A widget being dragged renders on whatever page is SHOWING, not the
                                one it started on, so it can be carried across an edge flip and
                                stay under the finger. */}
                            {widgets.filter(w => (dragW?.uid === w.uid ? pi === page : w.page === pi)).map(w => {
                                const def = widgetByKind(w.kind);
                                if (!def) return null;
                                const pos = slot(w.row * COLS + w.col);
                                const { width, height } = widgetPx(w.size);
                                const dragging = dragW?.uid === w.uid;
                                const at = dragging ? { x: dragW.x, y: dragW.y } : pos;
                                return (
                                    <div key={w.uid}>
                                        {/* Landing pad under the dragged widget, so the snap target is visible. */}
                                        {dragging && dropPreview && (
                                            <div
                                                className="pointer-events-none absolute rounded-[22px] border border-white/40 bg-white/10"
                                                style={{
                                                    left: 0, top: 0, width, height,
                                                    transform: `translate(${slot(dropPreview.row * COLS + dropPreview.col).x}px, ${slot(dropPreview.row * COLS + dropPreview.col).y}px)`,
                                                }}
                                            />
                                        )}
                                    <div
                                        onPointerDown={e => onWidgetDown(e, w)}
                                        style={{
                                            position: 'absolute', left: 0, top: 0,
                                            transform: `translate(${at.x}px, ${at.y}px)${dragging ? ' scale(1.06)' : ''}`,
                                            transition: dragging ? 'none' : 'transform 0.26s cubic-bezier(0.2,0.8,0.3,1)',
                                            zIndex: dragging ? 3 : 1,
                                            touchAction: 'none',
                                            filter: dragging ? 'drop-shadow(0 12px 22px rgba(0,0,0,0.45))' : undefined,
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
                                            className={editing && !dragging ? 'animate-app-jiggle' : ''}
                                            // --jiggle scales the wobble down for bigger tiles so a
                                            // 4x4 does not swing five times as far as an icon.
                                            style={editing && !dragging
                                                ? { animationDelay: `${jiggleDelay(w.uid)}ms`, '--jiggle': `${jiggleDeg(w.size)}deg` } as CSSProperties
                                                : undefined}
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
                                            {def.render({ size: w.size, width, height, align: w.align ?? 'left', theme: w.theme ?? 'dark', picks: w.picks,
                                                onPicks: ids => setWidgets(prev => prev.map(o => (o.uid === w.uid ? { ...o, picks: ids.length ? ids : undefined } : o))) })}
                                        </div>
                                        {editing && (
                                            <button
                                                type="button"
                                                aria-label={t('widgets.remove', 'Remove widget')}
                                                onPointerDown={e => e.stopPropagation()}
                                                onClick={e => { e.stopPropagation(); removeWidget(w.uid); }}
                                                className="absolute -left-1.5 -top-1.5 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#1c1c1e] text-white shadow-lg"
                                                style={{ border: '0.5px solid rgba(255,255,255,0.25)' }}
                                            >
                                                <Minus className="h-[15px] w-[15px]" strokeWidth={3} />
                                            </button>
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
                                            <div style={bloom ? { animation: 'home-icon-in 0.38s cubic-bezier(0.34,1.3,0.64,1) both', animationDelay: `${li * 20}ms` } : undefined}>
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
                                    const slidePreview = isSwapTarget && page === fromPageRef.current;
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
                                const slidePreview = isSwapTarget && page === fromPageRef.current;
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
                                        <EditTile app={app!} dragging={false} swapTarget={isSwapTarget} plopping={plopIds.has(id)} removable={!app!.base} merging={isMergeTarget} badge={badges?.[app!.id]} onRemove={() => setConfirmRemove(app!)} />
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

                {editing && dragId && (
                    <div className="pointer-events-none absolute left-0 top-0 z-[60]" style={{ width: ICON, transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}>
                        {isFolderId(dragId)
                            ? <div style={{ transform: 'scale(1.1)' }}><FolderTile label={folders[folderKeyOf(dragId)]?.name ?? ''} apps={folderApps(folderKeyOf(dragId))} badge={folderBadge(folderKeyOf(dragId))} onOpen={() => { /* lifted */ }} /></div>
                            : appMap.get(dragId) && <EditTile app={appMap.get(dragId)!} dragging swapTarget={false} plopping={false} removable={false} merging={false} onRemove={() => { /* lifted */ }} />}
                    </div>
                )}
            </div>

            <div className="absolute bottom-[132px] left-0 right-0 z-10 flex justify-center">
                {visiblePages > 1 && (
                    <div className="flex items-center gap-[7px] rounded-full bg-black/35 px-2.5 py-[7px] shadow-sm backdrop-blur-md">
                        {renderPages.map((_, i) => {
                            const dist = Math.min(1, Math.abs(i - (page - dragX / SCREEN_W)));
                            return <div key={i} style={{ opacity: 1 - dist * 0.62, transition: isDraggingRef.current ? 'none' : 'opacity 0.3s ease' }} className="h-[7px] w-[7px] rounded-full bg-white" />;
                        })}
                    </div>
                )}
            </div>

            <div className="absolute bottom-5 left-4 right-4 z-10">
                <div className="flex items-center justify-around rounded-[28px] border border-white/20 bg-white/15 px-4 py-3.5 backdrop-blur-2xl">
                    {dockApps.map((app, di) => (
                        <div
                            key={app.id}
                            className={editing ? 'animate-app-jiggle' : ''}
                            style={editing
                                ? { animationDelay: `${jiggleDelay(app.id)}ms` }
                                : (bloom ? { animation: 'home-icon-in 0.38s cubic-bezier(0.34,1.3,0.64,1) both', animationDelay: `${140 + di * 25}ms` } : undefined)}
                        >
                            <AppIcon app={app} label={false} onOpen={launch} badge={badges?.[app.id]} />
                        </div>
                    ))}
                </div>
            </div>

            {openFolder && folders[openFolder] && (
                <FolderOverlay
                    name={folders[openFolder].name}
                    apps={folderApps(openFolder)}
                    badges={badges}
                    editing={editing}
                    autoEdit={renameFolder === openFolder}
                    wallpaper={wallpaper}
                    onRename={(name) => setFolders(prev => ({ ...prev, [openFolder]: { ...prev[openFolder], name: name.trim() || 'Folder' } }))}
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
                    title={t('shell.removeAppTitle','Remove “{label}”?', { label: confirmRemove.label })}
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
    return (
        <div className={dragging ? '' : 'animate-app-jiggle'} style={{ animationDelay: `${jiggleDelay(app.id)}ms` }}>
            <div className="relative">
                {merging && <div className="pointer-events-none absolute -inset-[8px] rounded-[30%] bg-white/25 backdrop-blur-sm" />}
                <div className={`relative h-[78px] w-[78px] overflow-hidden transition-[box-shadow,transform] duration-150 ${plopping ? 'animate-plop' : ''}`} style={{ borderRadius: '27.6%', boxShadow: swapTarget ? '0 2px 12px rgba(0,0,0,0.42), 0 0 0 3.5px rgba(255,255,255,0.92)' : '0 2px 10px rgba(0,0,0,0.38), 0 0 0 0.5px rgba(0,0,0,0.12)', transform: dragging || merging ? 'scale(1.12)' : undefined }}>
                    <div style={{ width: 60, height: 60, transform: 'scale(1.3)', transformOrigin: '0 0' }}>
                        <AppIconSVG icon={app.icon} />
                    </div>
                </div>
                {!dragging && <AppBadge count={badge} />}
                {removable && (
                    <button type="button" aria-label={t('shell.removeApp','Remove {label}', { label: app.label })} onPointerDown={e => e.stopPropagation()} onClick={onRemove} className="absolute -left-[7px] -top-[7px] flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#e4e4e6] shadow-[0_1px_3px_rgba(0,0,0,0.4)] active:scale-90">
                        <Minus className="h-[16px] w-[16px] text-black/75" strokeWidth={3} />
                    </button>
                )}
            </div>
            <span className="mt-[7px] block w-full truncate text-center font-sf text-[13px] font-semibold tracking-[0.01em] text-white" style={{ textShadow: '0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.5)' }}>{app.label}</span>
        </div>
    );
}

function FolderMini({ icon }: { icon: string }): ReactNode {
    return (
        <div className="overflow-hidden" style={{ borderRadius: '30%' }}>
            <div style={{ width: 60, height: 60, transform: 'scale(0.3)', transformOrigin: '0 0' }}>
                <AppIconSVG icon={icon} />
            </div>
        </div>
    );
}

function FolderTile({ label, apps, onOpen, merging = false, badge }: { label: string; apps: AppDef[]; onOpen: () => void; merging?: boolean; badge?: number }): ReactNode {
    return (
        <button type="button" onClick={onOpen} className="group block w-[78px]">
            <div className="relative">
                <div
                    className="grid h-[78px] w-[78px] grid-cols-3 grid-rows-3 gap-[3px] overflow-hidden p-[9px] backdrop-blur-xl transition-[transform,box-shadow] duration-150 group-active:scale-[0.94]"
                    style={{
                        borderRadius: '27.6%',
                        background: merging ? 'rgba(118,122,132,0.6)' : 'rgba(70,70,78,0.42)',
                        boxShadow: merging
                            ? 'inset 0 0 0 0.5px rgba(255,255,255,0.3), 0 3px 16px rgba(0,0,0,0.45), 0 0 0 3.5px rgba(255,255,255,0.92)'
                            : 'inset 0 0 0 0.5px rgba(255,255,255,0.18), 0 2px 10px rgba(0,0,0,0.4)',
                        transform: merging ? 'scale(1.14)' : undefined,
                    }}
                >
                    {apps.slice(0, 9).map(a => <FolderMini key={a.id} icon={a.icon} />)}
                </div>
                <AppBadge count={badge} />
            </div>
            <span className="mt-[7px] block w-full truncate text-center font-sf text-[13px] font-semibold tracking-[0.01em] text-white" style={{ textShadow: '0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.5)' }}>{label}</span>
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
    const panelRef = useRef<HTMLDivElement>(null);
    const [localEdit, setLocalEdit] = useState(false);
    const editing = homeEditing || localEdit;
    const editingRef = useRef(editing);
    editingRef.current = editing;

    const [editName, setEditName] = useState(autoEdit);
    const [draft, setDraft] = useState(name);
    function commitName() { setEditName(false); const n = draft.trim() || 'Folder'; if (n !== name) onRename(n); }

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
                                    <div className="pointer-events-none absolute left-0 top-0 h-[78px] w-[78px]" style={{ borderRadius: '27.6%', boxShadow: '0 0 0 3.5px rgba(255,255,255,0.92), 0 2px 12px rgba(0,0,0,0.42)' }} />
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
