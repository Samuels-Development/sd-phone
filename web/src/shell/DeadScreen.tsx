import { useBatteryStore } from '@/stores/batteryStore';

export function DeadScreen() {
    const charging = useBatteryStore(s => s.charging);

    return (
        <div
            className="absolute inset-0 z-50 flex items-center justify-center transition-colors duration-1000"
            style={{ background: charging ? '#f2f2f7' : '#000000' }}
        >
            <div className="relative">
                <div
                    className="h-[78px] w-[42px] rounded-[7px] border-[3px]"
                    style={{ borderColor: charging ? '#1c1c1e' : '#3a3a3c' }}
                />
                <div
                    className="absolute left-1/2 top-[-7px] h-[4px] w-[16px] -translate-x-1/2 rounded-t-[2px]"
                    style={{ background: charging ? '#1c1c1e' : '#3a3a3c' }}
                />
                {charging && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg width="20" height="30" viewBox="0 0 20 30" fill="none" aria-hidden>
                            <path d="M11 1L2 17h6l-1 12 11-16h-7z" fill="#34c759" />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
}
