import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Maximize2, RotateCcw, Shuffle, Undo2 } from 'lucide-react';

import { t } from '@/i18n';
import { FramedPreview, type Framing } from './CasePreview';
import type { Design } from './casesApi';
import { designChips, labelOf, type PartKind, type PartLabels } from './labels';
import { ScrollRow } from './ScrollRow';
import { ColourDot, ShellWash } from './ui';

const STAGE_H = 296;
const TOP_PAD = 14;
const CHIP_ROOM = 48;
/** The closest the stage zooms (the sticker framing), so the canvas is drawn sharp enough for it. */
const STAGE_DETAIL = 1.2;

function CornerButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={e => { e.stopPropagation(); onPress(); }}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-elevated/85 text-black/75 shadow-[0_1px_3px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.05] backdrop-blur-md transition-transform duration-150 active:scale-90 dark:bg-control/80 dark:text-white/90 dark:ring-white/[0.08]"
        >
            {children}
        </button>
    );
}

function SummaryChip({ hex, active, strong, onPress, children }: {
    hex?:    string;
    active:  boolean;
    strong?: boolean;
    onPress: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={e => { e.stopPropagation(); onPress(); }}
            className={`flex h-[28px] shrink-0 items-center gap-1.5 rounded-full bg-elevated/90 px-2.5 text-[12.5px] shadow-[0_1px_2px_rgba(0,0,0,0.12)] backdrop-blur-md transition-[transform,box-shadow] duration-150 active:scale-95 dark:bg-control/85 ${
                strong ? 'font-semibold' : 'font-medium'
            } ${active ? 'ring-2 ring-[#F59E0B]' : 'ring-1 ring-black/[0.05] dark:ring-white/[0.08]'}`}
        >
            {hex && <ColourDot hex={hex} />}
            <span className="max-w-[96px] truncate">{children}</span>
        </button>
    );
}

/** The case on its backdrop, framed for the step being edited. Tapping it opens the full-screen
 *  view; the corner buttons replace the whole design, and the chips under the phone jump to the
 *  step that sets each part. */
export function Stage({ design, frameHex, palette, labels, framing, step, undo, onStep, onSurprise, onStartOver, onUndo, onExpand }: {
    design:      Design;
    frameHex:    string;
    palette:     string[];
    labels:      PartLabels;
    framing:     Framing;
    step:        string;
    undo:        boolean;
    onStep:      (step: 'style' | PartKind) => void;
    onSurprise:  () => void;
    onStartOver: () => void;
    onUndo:      () => void;
    onExpand:    () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setWidth(el.clientWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const chips = designChips(labels, design, palette);

    return (
        <div className="shrink-0 px-4 pt-1.5">
            <div
                ref={ref}
                role="button"
                aria-label={t('cases.viewFullScreen', 'View full screen')}
                onClick={onExpand}
                className="relative isolate cursor-zoom-in overflow-hidden rounded-[26px] ring-1 ring-black/[0.05] dark:ring-white/[0.06]"
                style={{ height: STAGE_H }}
            >
                <ShellWash hex={palette[design.color] ?? '#888888'} />
                {width > 0 && (
                    <FramedPreview
                        design={design}
                        frameHex={frameHex}
                        palette={palette}
                        framing={framing}
                        boxW={width}
                        boxH={STAGE_H - TOP_PAD - CHIP_ROOM}
                        boxTop={TOP_PAD}
                        detail={STAGE_DETAIL}
                    />
                )}

                <div className="absolute start-3 top-3 flex gap-2">
                    <CornerButton label={t('cases.surpriseMe', 'Surprise me')} onPress={onSurprise}>
                        <Shuffle className="h-[16px] w-[16px]" strokeWidth={2.4} />
                    </CornerButton>
                    <CornerButton label={t('cases.startOver', 'Start over')} onPress={onStartOver}>
                        <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2.4} />
                    </CornerButton>
                    {undo && (
                        <button
                            type="button"
                            aria-label={t('cases.undo', 'Undo')}
                            onClick={e => { e.stopPropagation(); onUndo(); }}
                            className="flex h-[34px] w-[34px] animate-icon-pop items-center justify-center rounded-full bg-[#F59E0B] text-white shadow-[0_2px_8px_rgba(245,158,11,0.45)] transition-transform duration-150 active:scale-90"
                        >
                            <Undo2 className="h-[17px] w-[17px]" strokeWidth={2.6} />
                        </button>
                    )}
                </div>
                <div className="absolute end-3 top-3">
                    <CornerButton label={t('cases.viewFullScreen', 'View full screen')} onPress={onExpand}>
                        <Maximize2 className="h-[16px] w-[16px]" strokeWidth={2.4} />
                    </CornerButton>
                </div>

                <div className="absolute inset-x-0 bottom-3">
                    <ScrollRow className="mx-auto w-fit max-w-full gap-1.5 px-3 py-0.5">
                        <SummaryChip hex={palette[design.color]} strong active={step === 'style' || step === 'colour'} onPress={() => onStep('style')}>
                            {labelOf(labels.style, design.style)}
                        </SummaryChip>
                        {chips.map(c => (
                            <SummaryChip key={c.kind} hex={c.hex} active={step === c.kind} onPress={() => onStep(c.kind)}>
                                {c.name}
                            </SummaryChip>
                        ))}
                    </ScrollRow>
                </div>
            </div>
        </div>
    );
}
