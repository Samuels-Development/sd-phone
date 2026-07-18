import { useEffect, useRef, useState } from 'react';
import { Check, Eraser, Pencil, RotateCcw, Trash2, X } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import { t } from '@/i18n';
import { ancestorZoom } from '@/lib/zoom';

interface Props {
    initial?: string;
    onSave:   (png: string) => void;
    onCancel: () => void;
}

interface Point  { x: number; y: number }
interface Stroke {
    color:   string;
    width:   number;
    eraser:  boolean;
    points:  Point[];
}

const COLORS = ['#1d1d1f', '#ffffff', '#ff453a', '#ff9f0a', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2'];
const WIDTHS = [2, 4, 8];

export function SketchCanvas({ initial, onSave, onCancel }: Props) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const dprRef    = useRef(1);
    const drawingRef = useRef(false);

    const [color,   setColor]   = useState<string>(COLORS[0]);
    const [width,   setWidth]   = useState<number>(WIDTHS[1]);
    const [eraser,  setEraser]  = useState(false);
    const [customColor, setCustomColor] = useState('#ff7eb9');
    const [, bump] = useState(0);
    const [closing, setClosing] = useState(false);
    const pendingRef = useRef<() => void>();
    function startClose(action: () => void) {
        if (closing) return;
        pendingRef.current = action;
        setClosing(true);
    }

    function ctx(): CanvasRenderingContext2D | null {
        return canvasRef.current?.getContext('2d') ?? null;
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        dprRef.current = dpr;
        const rect = canvas.getBoundingClientRect();
        canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        const c = canvas.getContext('2d');
        if (!c) return;
        c.scale(dpr, dpr);
        c.lineCap   = 'round';
        c.lineJoin  = 'round';

        if (initial) {
            const cw = canvas.width / dpr, ch = canvas.height / dpr;
            const img = new Image();
            img.onload = () => c.drawImage(img, 0, 0, cw, ch);
            img.src = initial;
        }
    }, [initial]);

    function pointFromEvent(e: React.PointerEvent): Point {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const ow = canvas.offsetWidth, oh = canvas.offsetHeight;
        if (rect.width === 0 || rect.height === 0 || ow === 0 || oh === 0) return { x: 0, y: 0 };
        const z  = ancestorZoom(canvas);
        const sx = (rect.width  / ow) / z;
        const sy = (rect.height / oh) / z;
        return {
            x: e.clientX * sx - rect.left,
            y: e.clientY * sy - rect.top,
        };
    }

    function drawSegment(c: CanvasRenderingContext2D, s: Stroke, a: Point, b: Point) {
        c.save();
        c.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over';
        c.strokeStyle = s.color;
        c.lineWidth   = s.width;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
        c.restore();
    }

    function redrawAll() {
        const c = ctx();
        const canvas = canvasRef.current;
        if (!c || !canvas) return;
        const dpr = dprRef.current;
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.restore();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const s of strokesRef.current) {
            for (let i = 1; i < s.points.length; i++) {
                drawSegment(c, s, s.points[i - 1], s.points[i]);
            }
        }
    }

    function onPointerDown(e: React.PointerEvent) {
        const c = ctx();
        if (!c) return;
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not all runtimes support capture */ }
        drawingRef.current = true;
        const p = pointFromEvent(e);
        const s: Stroke = { color, width, eraser, points: [p] };
        strokesRef.current.push(s);
        drawSegment(c, s, p, { x: p.x + 0.01, y: p.y + 0.01 });
    }

    function onPointerMove(e: React.PointerEvent) {
        if (!drawingRef.current) return;
        const list = strokesRef.current;
        const s = list[list.length - 1];
        if (!s) return;
        const c = ctx();
        if (!c) return;
        const p = pointFromEvent(e);
        const prev = s.points[s.points.length - 1];
        drawSegment(c, s, prev, p);
        s.points.push(p);
    }

    function onPointerUp() {
        drawingRef.current = false;
        bump(n => n + 1);
    }

    function undo() {
        strokesRef.current.pop();
        redrawAll();
        bump(n => n + 1);
    }

    function clearAll() {
        strokesRef.current = [];
        redrawAll();
        bump(n => n + 1);
    }

    function save() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const png = canvas.toDataURL('image/png');
        startClose(() => onSave(png));
    }

    const pageBg  = isDark ? 'rgb(var(--base))' : '#d4d4d4';
    // The board stays white in BOTH themes. toDataURL() captures only the canvas bitmap -
    // this background is CSS on the wrapper and is never baked into the saved PNG - so a
    // dark board made strokes look one way while editing and another way once saved, since
    // both render paths (NoteEditor thumbnail + fullscreen preview) composite over #fff.
    const canvasBg = '#ffffff';
    const tray    = isDark ? 'rgb(var(--elevated))' : '#f2f2f7';

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col"
            style={{
                background: pageBg,
                color: isDark ? '#fff' : '#000',
                animation: closing
                    ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
            onAnimationEnd={e => { if (e.target === e.currentTarget && closing) pendingRef.current?.(); }}
        >
            <div className="shrink-0" style={{ height: 58 }} />

            <div className="relative flex h-11 shrink-0 items-center px-4">
                <button type="button" onClick={() => startClose(onCancel)} className="text-ios-blue active:opacity-60">
                    <X className="h-[22px] w-[22px]" strokeWidth={2.5} />
                </button>
                <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                    <span className="text-[17px] font-semibold">{t('notes.sketch', 'Sketch')}</span>
                </div>
                <button type="button" onClick={save} className="ml-auto text-ios-blue active:opacity-60">
                    <Check className="h-[22px] w-[22px]" strokeWidth={2.75} />
                </button>
            </div>

            <div className="flex-1 px-3 pb-3">
                <div
                    className="relative h-full w-full overflow-hidden rounded-[14px]"
                    style={{ background: canvasBg, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.18)' }}
                >
                    <canvas
                        ref={canvasRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        className="block h-full w-full"
                        style={{ touchAction: 'none', cursor: 'crosshair' }}
                    />
                </div>
            </div>

            <div
                className="mx-3 mb-9 flex flex-col gap-2 rounded-[14px] px-2 py-2"
                style={{ background: tray, border: '0.5px solid rgba(0,0,0,0.12)' }}
            >
                <div className="flex items-center gap-1.5">
                    <ToolBtn label={t('notes.pen', 'Pen')} active={!eraser} onClick={() => setEraser(false)}>
                        <Pencil className="h-[16px] w-[16px]" strokeWidth={2} />
                    </ToolBtn>
                    <ToolBtn label={t('notes.eraser', 'Eraser')} active={eraser} onClick={() => setEraser(true)}>
                        <Eraser className="h-[16px] w-[16px]" strokeWidth={2} />
                    </ToolBtn>

                    <div className="mx-1 h-5 w-[1px] bg-black/15 dark:bg-white/15" />

                    {WIDTHS.map(w => (
                        <button
                            key={w}
                            type="button"
                            onClick={() => setWidth(w)}
                            aria-label={t('notes.strokeWidthAria', 'Stroke width {w}', { w })}
                            className="flex h-7 w-7 items-center justify-center rounded-full active:opacity-60"
                            style={{ background: w === width ? 'rgba(0,0,0,0.10)' : 'transparent' }}
                        >
                            <span
                                className="block rounded-full bg-black dark:bg-white"
                                style={{ width: w + 2, height: w + 2 }}
                            />
                        </button>
                    ))}

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={undo}
                        disabled={strokesRef.current.length === 0}
                        aria-label={t('notes.undoStroke', 'Undo last stroke')}
                        className="flex h-7 w-7 items-center justify-center rounded-full active:opacity-60 disabled:opacity-30"
                    >
                        <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={clearAll}
                        disabled={strokesRef.current.length === 0}
                        aria-label={t('notes.clearCanvas', 'Clear canvas')}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-ios-red active:opacity-60 disabled:opacity-30"
                    >
                        <Trash2 className="h-[16px] w-[16px]" strokeWidth={2} />
                    </button>
                </div>

                <div className="flex items-center justify-between px-1">
                    {COLORS.map(c => {
                        const active = c === color && !eraser;
                        return (
                            <button
                                key={c}
                                type="button"
                                onClick={() => { setColor(c); setEraser(false); }}
                                aria-label={t('notes.colorAria', 'Color {color}', { color: c })}
                                className="rounded-full active:scale-95"
                                style={{
                                    width:  22, height: 22, background: c,
                                    boxShadow: active
                                        ? `0 0 0 2px ${tray}, 0 0 0 4px ${c}`
                                        : 'inset 0 0 0 0.5px rgba(0,0,0,0.25)',
                                    transition: 'transform 0.12s',
                                }}
                            />
                        );
                    })}
                    {(() => {
                        const customActive = !eraser && !COLORS.includes(color);
                        return (
                            <label
                                aria-label={t('notes.customColor', 'Custom color')}
                                className="relative cursor-pointer rounded-full active:scale-95"
                                style={{
                                    width:  22, height: 22,
                                    background: 'conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                                    boxShadow: customActive
                                        ? `0 0 0 2px ${tray}, 0 0 0 4px ${customColor}`
                                        : 'inset 0 0 0 0.5px rgba(0,0,0,0.25)',
                                    transition: 'transform 0.12s',
                                }}
                            >
                                <input
                                    type="color"
                                    value={customColor}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setCustomColor(v);
                                        setColor(v);
                                        setEraser(false);
                                    }}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                            </label>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}

function ToolBtn({
    children, label, active, onClick,
}: { children: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex h-7 w-7 items-center justify-center rounded-full active:opacity-60"
            style={{ background: active ? '#0a84ff' : 'transparent', color: active ? '#fff' : undefined }}
        >
            {children}
        </button>
    );
}
