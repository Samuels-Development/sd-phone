import { clsx } from 'clsx';

export function SheetHeader({ cancelLabel, onCancel, title, doneLabel, onDone, doneDisabled = false }: {
    cancelLabel:   string;
    onCancel:      () => void;
    title?:        string;
    doneLabel?:    string;
    onDone?:       () => void;
    doneDisabled?: boolean;
}) {
    return (
        <div className="relative flex h-11 shrink-0 items-center justify-between px-4">
            <button type="button" onClick={onCancel} className="relative z-10 text-[17px] text-ios-blue active:opacity-60">
                {cancelLabel}
            </button>
            {title && (
                <span className="pointer-events-none absolute inset-x-0 mx-auto max-w-[55%] truncate text-center text-[17px] font-semibold text-black dark:text-white">
                    {title}
                </span>
            )}
            {doneLabel && (
                <button
                    type="button"
                    onClick={onDone}
                    disabled={doneDisabled}
                    className={clsx('relative z-10 text-[17px] font-semibold active:opacity-60', doneDisabled ? 'text-black/30 dark:text-white/30' : 'text-ios-blue')}
                >
                    {doneLabel}
                </button>
            )}
        </div>
    );
}
