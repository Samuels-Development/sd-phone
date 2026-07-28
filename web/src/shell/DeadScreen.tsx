import { useBatteryStore } from '@/stores/batteryStore';

const OUTLINE = '#3a3a3c';
const RED     = '#ff3b30';
const GREEN   = '#34c759';

export function DeadScreen() {
    const charging = useBatteryStore(s => s.charging);

    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black">
            <div className={charging ? 'animate-battery-wake' : 'animate-battery-breathe'}>
                <svg width="132" height="228" viewBox="0 0 132 228" fill="none" aria-hidden>
                    <rect x="49" y="4" width="34" height="13" rx="5" fill={OUTLINE} />
                    <rect
                        x="6" y="17" width="120" height="205" rx="26"
                        fill="none" stroke={OUTLINE} strokeWidth="9"
                    />
                    {charging ? (
                        <>
                            <rect x="19" y="186" width="94" height="23" rx="10" fill={GREEN} />
                            <path d="M76 58 L44 130 H62 L56 176 L88 104 H68 Z" fill="#ffffff" />
                        </>
                    ) : (
                        <rect x="19" y="196" width="94" height="13" rx="6" fill={RED} />
                    )}
                </svg>
            </div>
        </div>
    );
}
