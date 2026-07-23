import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { t } from '@/i18n';

interface Point { x: number; y: number }

export interface SignaturePadHandle {
    /** Composited PNG data-URL (white paper background), or null with no ink. */
    toImage(): string | null;
    clear(): void;
}

// Coordinate correction under the phone's fractional CSS zoom, mirroring
// notes/SketchCanvas: clientX/Y are zoom-scaled while rect.left/top are not.
function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}

const INK = '#1d1d1f';
const INK_WIDTH = 2.5;
// A stray tap must not count as a signature: the pad only reports ink once the total drawn
// path passes this length (CSS px).
const MIN_INK_LENGTH = 24;

export const SignaturePad = forwardRef<SignaturePadHandle, { onInkChange?: (hasInk: boolean) => void }>(
    function SignaturePad({ onInkChange }, ref) {
        const canvasRef  = useRef<HTMLCanvasElement>(null);
        const strokesRef = useRef<Point[][]>([]);
        const drawingRef = useRef(false);
        const dprRef     = useRef(1);
        const lengthRef  = useRef(0);
        const [hasInk, setHasInk] = useState(false);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            dprRef.current = dpr;
            canvas.width  = Math.max(1, Math.round(canvas.offsetWidth  * dpr));
            canvas.height = Math.max(1, Math.round(canvas.offsetHeight * dpr));
            const c = canvas.getContext('2d');
            if (!c) return;
            c.scale(dpr, dpr);
            c.lineCap  = 'round';
            c.lineJoin = 'round';
            c.strokeStyle = INK;
            c.lineWidth   = INK_WIDTH;
        }, []);

        function point(e: React.PointerEvent): Point {
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const ow = canvas.offsetWidth, oh = canvas.offsetHeight;
            if (rect.width === 0 || rect.height === 0 || ow === 0 || oh === 0) return { x: 0, y: 0 };
            const z  = ancestorZoom(canvas);
            const sx = (rect.width  / ow) / z;
            const sy = (rect.height / oh) / z;
            return { x: e.clientX * sx - rect.left, y: e.clientY * sy - rect.top };
        }

        function markInk(v: boolean) {
            setHasInk(v);
            onInkChange?.(v);
        }

        function onDown(e: React.PointerEvent) {
            const c = canvasRef.current?.getContext('2d');
            if (!c) return;
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
            drawingRef.current = true;
            strokesRef.current.push([point(e)]);
        }

        function onMove(e: React.PointerEvent) {
            if (!drawingRef.current) return;
            const c = canvasRef.current?.getContext('2d');
            const stroke = strokesRef.current[strokesRef.current.length - 1];
            if (!c || !stroke) return;
            const p = point(e);
            const prev = stroke[stroke.length - 1];
            stroke.push(p);
            c.beginPath();
            c.moveTo(prev.x, prev.y);
            c.lineTo(p.x, p.y);
            c.stroke();
            lengthRef.current += Math.hypot(p.x - prev.x, p.y - prev.y);
            if (!hasInk && lengthRef.current >= MIN_INK_LENGTH) markInk(true);
        }

        function onUp() {
            drawingRef.current = false;
            // A tap without movement leaves a pointless one-point stroke - drop it.
            const last = strokesRef.current[strokesRef.current.length - 1];
            if (last && last.length < 2) strokesRef.current.pop();
        }

        useImperativeHandle(ref, () => ({
            toImage() {
                const canvas = canvasRef.current;
                if (!canvas || strokesRef.current.length === 0 || lengthRef.current < MIN_INK_LENGTH) return null;
                const out = document.createElement('canvas');
                out.width  = canvas.width;
                out.height = canvas.height;
                const c = out.getContext('2d');
                if (!c) return null;
                c.fillStyle = '#ffffff';
                c.fillRect(0, 0, out.width, out.height);
                c.drawImage(canvas, 0, 0);
                return out.toDataURL('image/png');
            },
            clear() {
                const canvas = canvasRef.current;
                const c = canvas?.getContext('2d');
                if (!canvas || !c) return;
                c.save();
                c.setTransform(1, 0, 0, 1, 0, 0);
                c.clearRect(0, 0, canvas.width, canvas.height);
                c.restore();
                strokesRef.current = [];
                drawingRef.current = false;
                lengthRef.current = 0;
                markInk(false);
            },
        }));

        return (
            <div className="relative overflow-hidden rounded-[12px] border border-black/10 bg-white">
                <canvas
                    ref={canvasRef}
                    className="block h-[150px] w-full touch-none"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    onPointerLeave={onUp}
                />
                {!hasInk && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[15px] text-ios-gray3">
                        {t('documents.signHere', 'Sign here')}
                    </span>
                )}
                <div className="pointer-events-none absolute inset-x-6 bottom-7 border-b border-dashed border-black/15" />
            </div>
        );
    },
);


export interface SignatureStyle {
    id:         string;
    label:      string;
    fontFamily: string;
    fontWeight: number;
    fontStyle?: string;
    fontSize:   number;
}

// Great Vibes ships in the bundle (main.tsx); the rest fall back through fonts CEF/Windows
// carries. Each style renders the typed name onto the same PNG pipeline drawn signatures use.
export const SIGNATURE_STYLES: SignatureStyle[] = [
    { id: 'elegant', label: 'Elegant',    fontFamily: '"Great Vibes", "Snell Roundhand", cursive',                 fontWeight: 400, fontSize: 64 },
    { id: 'script',  label: 'Script',     fontFamily: '"Segoe Script", "Snell Roundhand", "Bradley Hand", cursive', fontWeight: 400, fontSize: 44 },
    { id: 'formal',  label: 'Formal',     fontFamily: 'Georgia, "Times New Roman", serif',                          fontWeight: 600, fontStyle: 'italic', fontSize: 52 },
    { id: 'typed',   label: 'Typewriter', fontFamily: '"Courier New", Courier, monospace',                          fontWeight: 700, fontSize: 42 },
];

function fontOf(style: SignatureStyle): string {
    return `${style.fontStyle ? style.fontStyle + ' ' : ''}${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

/** Renders a typed name in a signature style to the same white-paper PNG a drawn signature
 *  produces, shrinking long names to fit. Null for an effectively empty name. */
export async function renderTypedSignature(text: string, style: SignatureStyle): Promise<string | null> {
    const clean = text.trim();
    if (clean.length < 2) return null;
    try { await document.fonts.load(fontOf(style), clean); } catch { /* system-only font */ }

    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return null;
    measure.font = fontOf(style);
    const pad = 30;
    const textWidth = measure.measureText(clean).width;
    const w = Math.min(680, Math.max(260, Math.ceil(textWidth) + pad * 2));
    const h = Math.ceil(style.fontSize * 1.9);

    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = INK;
    c.font = fontOf(style);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (textWidth > w - pad * 2) {
        const scale = (w - pad * 2) / textWidth;
        c.setTransform(scale, 0, 0, scale, w / 2, h / 2);
        c.fillText(clean, 0, 0);
    } else {
        c.fillText(clean, w / 2, h / 2);
    }
    return canvas.toDataURL('image/png');
}
