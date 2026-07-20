import { useState } from 'react';
import { X } from 'lucide-react';

import { t } from '@/i18n';
import { portalToPhoneScreen } from './portal';

export function ImageLightbox({ src, onClose, action }: {
    src:     string;
    onClose: () => void;
    action?: { label: string; onClick: () => void };
}) {
    const [exiting, setExiting] = useState(false);

    function close() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onClose, 200);
    }

    const overlay = (
        <div
            className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-4"
            style={{
                background: 'rgba(0,0,0,0.92)',
                animation: exiting ? 'ios-sheet-backdrop-out 0.2s ease forwards' : 'ios-sheet-backdrop-in 0.2s ease-out',
            }}
            onClick={close}
        >
            <button
                type="button"
                onClick={e => { e.stopPropagation(); close(); }}
                aria-label={t('common.close', 'Close')}
                className="absolute right-4 top-14 flex h-9 w-9 items-center justify-center rounded-full text-white/85 active:opacity-60"
            >
                <X className="h-6 w-6" strokeWidth={2.2} />
            </button>
            <img
                src={src}
                alt=""
                className="max-h-[80%] max-w-full rounded-[8px] object-contain"
                style={{ animation: exiting
                    ? 'lightbox-zoom-out 0.2s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'lightbox-zoom-in 0.32s cubic-bezier(0.34,1.28,0.64,1)' }}
                onClick={e => e.stopPropagation()}
            />
            {action && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); action.onClick(); }}
                    className="mt-6 text-[15px] text-white/85 active:opacity-60"
                    style={{ animation: exiting ? 'ios-sheet-backdrop-out 0.2s ease forwards' : undefined }}
                >
                    {action.label}
                </button>
            )}
        </div>
    );

    return portalToPhoneScreen(overlay);
}
