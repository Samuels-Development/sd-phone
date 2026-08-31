
import { t } from '@/i18n';

export function AppBadge({ count, small, dot }: { count?: number; small?: boolean; dot?: boolean }) {
    if (!count || count < 1) return null;
    const label = count > 99 ? '99+' : String(count);
    const unread = count === 1
        ? t('shell.unreadOne', '{n} unread', { n: count })
        : t('shell.unreadMany', '{n} unread', { n: count });
    if (dot) {
        return (
            <span
                aria-label={unread}
                className="pointer-events-none absolute -right-[2px] -top-[2px] z-10 h-[12px] w-[12px] rounded-full bg-ios-red"
                style={{ boxShadow: '0 0 0 2px #f2f2f2' }}
            />
        );
    }
    if (small) {
        return (
            <span
                aria-label={unread}
                className="pointer-events-none absolute -right-[10px] -top-[7px] z-10 flex h-[23px] min-w-[23px] items-center justify-center rounded-full bg-ios-red px-[6px] font-sf text-[14px] font-bold leading-none text-white"
                style={{
                    boxShadow: '0 0 0 2.25px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.35)',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {label}
            </span>
        );
    }
    return (
        <span
            aria-label={unread}
            className="pointer-events-none absolute -right-[7px] -top-[7px] z-10 flex h-[31px] min-w-[31px] items-center justify-center rounded-full bg-ios-red px-[8px] font-sf text-[17.5px] font-bold leading-none text-white"
            style={{
                boxShadow: '0 0 0 2.5px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.4)',
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
            }}
        >
            {label}
        </span>
    );
}
