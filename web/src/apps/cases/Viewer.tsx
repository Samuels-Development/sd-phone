import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { t } from '@/i18n';
import { portalToPhoneScreen } from '@/ui/portal';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { FramedPreview, type Framing } from './CasePreview';
import type { Design } from './casesApi';
import { ShellWash } from './ui';

/** The most a 300x600 layer is blown up on screen, in CSS px per layer px; past this the art
 *  starts to look soft. */
const MAX_SCALE = 1.5;
const FADE_MS = 200;

/** The case as large as the screen allows, on a backdrop tinted by its shell colour. Tapping
 *  anywhere but the framing switch closes it, as does the close button. */
export function CaseViewer({ design, frameHex, palette, title, summary, onClose }: {
    design:   Design | null;
    frameHex: string;
    palette:  string[];
    title:    string;
    summary:  string;
    onClose:  () => void;
}) {
    const [framing, setFraming] = useState<Extract<Framing, 'charm' | 'body'>>('charm');
    const [shown, setShown] = useState(false);
    const [box, setBox] = useState<{ w: number; h: number } | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const closing = useRef(false);

    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const measure = () => setBox(b => (b && b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    function close() {
        if (closing.current) return;
        closing.current = true;
        setShown(false);
        window.setTimeout(onClose, FADE_MS);
    }

    const shellHex = design ? palette[design.color] ?? '#888888' : frameHex;
    const FRAMINGS = [
        { value: 'charm' as const, label: t('cases.viewWhole', 'Whole Case') },
        { value: 'body' as const,  label: t('cases.viewCloseUp', 'Close-up') },
    ];

    return portalToPhoneScreen(
        <div
            role="dialog"
            aria-label={title}
            onClick={close}
            className="absolute inset-0 z-[70] isolate overflow-hidden text-black dark:text-white"
            style={{ opacity: shown ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
        >
            <ShellWash hex={shellHex} strong />

            <div className="absolute inset-0 flex flex-col">
                <div className="shrink-0" style={{ height: 'calc(var(--safe-top) + 48px)' }} />
                <div
                    ref={boxRef}
                    className="relative min-h-0 flex-1 overflow-hidden"
                    style={{ transform: shown ? 'scale(1)' : 'scale(0.94)', transition: `transform ${FADE_MS + 120}ms cubic-bezier(0.32,0.72,0,1)` }}
                >
                    {box && (
                        <FramedPreview
                            design={design}
                            frameHex={frameHex}
                            palette={palette}
                            framing={framing}
                            boxW={box.w}
                            boxH={box.h - 16}
                            boxTop={8}
                            maxScale={MAX_SCALE}
                            detail={MAX_SCALE}
                        />
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-3.5 px-6 pb-[calc(var(--safe-bottom)+14px)] pt-3">
                    <div className="max-w-full text-center">
                        <div className="truncate text-[17px] font-semibold leading-tight">{title}</div>
                        <div className="mt-0.5 truncate text-[13.5px] text-black/60 dark:text-white/60">{summary}</div>
                    </div>
                    <div onClick={e => e.stopPropagation()} className="w-[240px]">
                        <SegmentedControl value={framing} onChange={setFraming} options={FRAMINGS} slide />
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={e => { e.stopPropagation(); close(); }}
                aria-label={t('cases.closeView', 'Close')}
                className="absolute end-4 flex h-[36px] w-[36px] items-center justify-center rounded-full bg-black/[0.08] backdrop-blur-md transition-transform duration-150 active:scale-90 dark:bg-white/[0.14]"
                style={{ top: 'calc(var(--safe-top) + 6px)' }}
            >
                <X className="h-[19px] w-[19px]" strokeWidth={2.6} />
            </button>
        </div>,
    );
}
