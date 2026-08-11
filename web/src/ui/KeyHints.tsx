import { createPortal } from 'react-dom';

export type HintCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface HintConfig {
    enabled: boolean;
    corner:  HintCorner;
    columns: number;
}

export interface KeyHint {
    keys:   string[];
    label:  string;
    shown?: boolean;
}

export const HINT_DEFAULTS: HintConfig = { enabled: true, corner: 'top-right', columns: 2 };

const CORNER_CLASS: Record<HintCorner, string> = {
    'top-right':    'right-4 top-4',
    'top-left':     'left-4 top-4',
    'bottom-right': 'right-4 bottom-4',
    'bottom-left':  'left-4 bottom-4',
};

export function KeyHints({ hints, config }: { hints: KeyHint[]; config: HintConfig }) {
    if (!config.enabled || hints.length === 0) return null;

    const edgeRight = config.corner.endsWith('right');
    const columns: KeyHint[][] = (() => {
        if (config.columns < 2) return [hints];
        const split = Math.ceil(hints.length / 2);
        const edge  = hints.slice(0, split);
        const inner = hints.slice(split);
        return edgeRight ? [inner, edge] : [edge, inner];
    })();

    return createPortal(
        <div
            className={`pointer-events-none fixed z-[2147483647] flex items-start gap-x-5 ${CORNER_CLASS[config.corner]}`}
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
            {columns.map((column, columnIndex) => (
                <div key={columnIndex} className={`flex flex-col ${edgeRight ? 'items-end' : 'items-start'}`}>
                    {column.map(hint => {
                        const shown = hint.shown !== false;
                        return (
                            <div
                                key={hint.label}
                                className="flex items-center gap-2 overflow-hidden transition-all duration-200 ease-out"
                                style={{
                                    opacity:      shown ? 1 : 0,
                                    maxHeight:    shown ? 24 : 0,
                                    marginBottom: shown ? 6 : 0,
                                    transform:    shown ? 'translateX(0)' : `translateX(${edgeRight ? 8 : -8}px)`,
                                }}
                                aria-hidden={!shown}
                            >
                                <span className="whitespace-nowrap text-[13px] font-medium text-white">
                                    {hint.label}
                                </span>
                                <span className="flex gap-1">
                                    {hint.keys.map(k => (
                                        <kbd
                                            key={k}
                                            className="flex h-6 min-w-[26px] items-center justify-center rounded-[6px] border border-white/25 bg-black/55 px-1.5 text-[12px] font-semibold text-white backdrop-blur-sm"
                                        >
                                            {k}
                                        </kbd>
                                    ))}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>,
        document.body,
    );
}
