import { useAnchoredMenu } from './useAnchoredMenu';

export interface MdtPopoverAction {
    label:        string;
    onClick:      () => void;
    destructive?: boolean;
    disabled?:    boolean;
}

export function MdtPopover({ anchor, actions, onClose }: {
    anchor:  HTMLElement | null;
    actions: MdtPopoverAction[];
    onClose: () => void;
}) {
    const { hostRef, style } = useAnchoredMenu({ anchor, onClose, revision: actions.length });

    return (
        <div
            ref={hostRef}
            className="absolute z-20 min-w-[188px] overflow-hidden rounded-[13px] bg-[#f4f4f4] shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.08] dark:bg-elevated dark:ring-white/[0.10]"
            style={{
                left:            style?.left ?? 0,
                top:             style?.top ?? 0,
                opacity:         style ? 1 : 0,
                transformOrigin: style?.origin ?? 'top right',
                animation:       style ? 'ios-alert-in 0.16s cubic-bezier(0.32,0.72,0,1)' : undefined,
            }}
        >
            {actions.map((a, i) => (
                <button
                    key={a.label}
                    type="button"
                    disabled={a.disabled}
                    onClick={() => { if (!a.disabled) { onClose(); a.onClick(); } }}
                    className={`block w-full px-4 py-[11px] text-left text-[17px] ${
                        i > 0 ? 'border-t border-black/[0.08] dark:border-white/[0.10]' : ''
                    } ${
                        a.disabled
                            ? 'text-black/30 dark:text-white/30'
                            : `active:bg-black/[0.06] dark:active:bg-white/[0.08] ${a.destructive ? 'text-ios-red' : 'text-ios-blue'}`
                    }`}
                >
                    {a.label}
                </button>
            ))}
        </div>
    );
}
