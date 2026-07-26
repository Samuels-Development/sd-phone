import { t } from '@/i18n';

interface Props {
    onGoHome?: () => void;
    closing?: boolean;
}

export function HomeIndicator({ onGoHome, closing = false }: Props) {
    const interactive = Boolean(onGoHome) && !closing;

    return (
        <div
            className={`group absolute inset-x-0 bottom-0 z-[55] flex justify-center pb-[6px] transition-opacity duration-200 ${
                closing ? 'opacity-0' : 'opacity-100'
            } ${interactive ? 'cursor-pointer' : ''}`}
            style={{ height: 23, pointerEvents: interactive ? 'auto' : 'none' }}
            onClick={interactive ? onGoHome : undefined}
            role={interactive ? 'button' : undefined}
            aria-label={interactive ? t('shell.goToHomeScreen','Go to Home Screen') : undefined}
        >
            {/* Always white like the real iPhone pill; the faint shadow keeps it legible
                over white app backgrounds where a pure-white bar would otherwise vanish. */}
            <div
                className={`h-[6px] w-[140px] rounded-full bg-white/90 transition-all duration-200 group-hover:bg-white ${
                    interactive ? 'group-hover:-translate-y-[2px]' : ''
                }`}
                style={{ boxShadow: '0 0 5px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)' }}
            />
        </div>
    );
}
