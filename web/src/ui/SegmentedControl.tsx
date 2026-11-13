import { t } from '@/i18n';

export function SegmentedControl<T extends string>({ value, onChange, options, className, fit = false, disabled = false, slide = false }: {
    value:      T;
    onChange:   (value: T) => void;
    options:    readonly { value: T; label: string; dot?: boolean; badge?: number }[];
    className?: string;
    fit?:       boolean;
    disabled?:  boolean;
    slide?:     boolean;
}) {
    const sliding  = slide && !fit;
    const selected = options.findIndex(opt => opt.value === value);

    return (
        <div
            className={`flex rounded-[9px] bg-black/[0.06] p-[2px] dark:bg-white/[0.12] ${sliding ? 'relative' : ''} ${className ?? ''}`}
            style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
            aria-disabled={disabled || undefined}
        >
            {sliding && selected >= 0 && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-[2px] start-[2px] rounded-[8px] bg-elevated shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-control"
                    style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(calc(var(--dir-x, 1) * ${selected * 100}%))` }}
                />
            )}
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(opt.value)}
                    className={`${fit ? 'px-3.5' : 'flex-1'} rounded-[8px] py-1.5 text-[15px] font-medium transition-colors ${sliding ? 'relative z-10' : ''} ${
                        value === opt.value
                            ? (sliding ? 'text-black dark:text-white' : 'bg-elevated text-black shadow-sm dark:bg-control dark:text-white')
                            : 'text-black/80 dark:text-white/80'
                    }`}
                >
                    <span className="inline-flex items-center justify-center gap-1.5">
                        {opt.label}
                        {opt.dot && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-ios-red" aria-label={t('common.unread', 'Unread')} />}
                        {!!opt.badge && opt.badge > 0 && (
                            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ios-red px-1 text-[12px] font-bold leading-none text-white">
                                {opt.badge}
                            </span>
                        )}
                    </span>
                </button>
            ))}
        </div>
    );
}
