import { t } from '@/i18n';

export function SegmentedControl<T extends string>({ value, onChange, options, className, fit = false }: {
    value:      T;
    onChange:   (value: T) => void;
    options:    readonly { value: T; label: string; dot?: boolean; badge?: number }[];
    className?: string;
    /** Size segments to their label + side padding instead of an equal split of a fixed width. */
    fit?:       boolean;
}) {
    return (
        <div className={`flex rounded-[9px] bg-black/[0.06] p-[2px] dark:bg-white/[0.12] ${className ?? ''}`}>
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={`${fit ? 'px-3.5' : 'flex-1'} rounded-[8px] py-1.5 text-[15px] font-medium transition-colors ${
                        value === opt.value
                            ? 'bg-white text-black shadow-sm dark:bg-control dark:text-white'
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
