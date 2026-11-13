import { useTheme } from '@/stores/themeStore';
import { t } from '@/i18n';

interface Props {
    onGoHome?: () => void;
    closing?: boolean;
    passive?: boolean;
    side?: 'full' | 'left' | 'right';
}

export function HomeIndicator({ onGoHome, closing = false, passive = false, side = 'full' }: Props) {
    const { theme, statusLightOverride, homeAutoLight } = useTheme('theme', 'statusLightOverride', 'homeAutoLight');
    const interactive = Boolean(onGoHome) && !closing;
    const clickable = interactive && !passive;
    const lightPill = statusLightOverride ?? homeAutoLight ?? (theme === 'dark');
    const pillColor = lightPill
        ? 'bg-white/75 group-hover:bg-white/90'
        : 'bg-black/70 group-hover:bg-black/85';
    const peerHover = !interactive ? ''
        : lightPill
            ? 'peer-hover:[&>div]:bg-white/90 peer-hover:[&>div]:-translate-y-[2px]'
            : 'peer-hover:[&>div]:bg-black/85 peer-hover:[&>div]:-translate-y-[2px]';

    const span = side === 'left' ? 'start-0 right-1/2' : side === 'right' ? 'left-1/2 end-0' : 'inset-x-0';

    return (
        <div
            className={`group absolute ${span} bottom-0 z-[55] flex justify-center pb-[5px] transition-opacity duration-200 ${
                closing ? 'opacity-0' : 'opacity-100'
            } ${clickable ? 'cursor-pointer' : ''} ${peerHover}`}
            style={{ height: 21, pointerEvents: clickable ? 'auto' : 'none' }}
            onClick={clickable ? onGoHome : undefined}
            role={clickable ? 'button' : undefined}
            aria-label={clickable ? t('shell.goToHomeScreen','Go to Home Screen') : undefined}
        >
            <div
                className={`h-[5px] w-[134px] rounded-full transition-all duration-200 ${pillColor} ${
                    interactive ? 'group-hover:-translate-y-[2px]' : ''
                }`}
            />
        </div>
    );
}
