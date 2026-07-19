import { t } from '@/i18n';

/**
 * Full-screen lock state shown when unique phones are enabled and the phone has
 * no SIM card installed: no number, no service, nothing browsable. Replaces the
 * lockscreen/homescreen entirely; the server refuses every data callback in this
 * state, this screen just makes that legible.
 */
export function NoSimScreen() {
    return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-[#0b0b0f] via-[#101017] to-[#0b0b0f] px-10 text-center">
            <SimGlyph />
            <div className="flex flex-col gap-2">
                <span className="text-[22px] font-semibold text-white">
                    {t('shell.noSimTitle', 'No SIM Card')}
                </span>
                <span className="text-[14px] leading-relaxed text-white/60">
                    {t('shell.noSimBody', 'This phone has no service. Insert a SIM card to activate a number and get back online.')}
                </span>
            </div>
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-[12px] font-medium text-white/70">
                {t('shell.noSimHint', 'SOS calls only')}
            </span>
        </div>
    );
}

function SimGlyph() {
    return (
        <svg width={64} height={64} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
            <rect x="8.5" y="11" width="7" height="7" rx="1.4" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
            <path d="M11 11v7M8.5 14.5h7" stroke="rgba(255,255,255,0.45)" strokeWidth="1.1" />
        </svg>
    );
}
