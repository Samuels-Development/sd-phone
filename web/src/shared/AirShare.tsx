import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { InitialsAvatar } from '@/shared/ContactAvatar';

export interface AirShareRequest {
    id:       string;
    kind:     string;
    fromName: string;
}

// Dynamic Island geometry (mirrors shell/PhoneShell's DI_* constants in screen space).
const PILL_W = 126;
const PILL_H = 37;
const PILL_R = PILL_H / 2;

// iOS-style island expansion: the request arrives as the island itself, then the solid black
// container grows out of the pill and collapses back into it on respond. Island surfaces are
// always opaque black (never glass) so they blend with the camera cutout - and solid paint
// also sidesteps the CEF backdrop-filter hazards.
export function AirShareCard({ request, onRespond }: {
    request:   AirShareRequest;
    onRespond: (accept: boolean) => void;
}) {
    const [phase, setPhase] = useState<'pill' | 'open' | 'closing'>('pill');
    const probeRef   = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [w, setW] = useState<number | null>(null);
    const [h, setH] = useState<number | null>(null);

    useLayoutEffect(() => { setW(probeRef.current?.offsetWidth ?? 416); }, []);

    // Content renders at its final width from the start, so its height is measurable while
    // the box is still pill-sized (fonts settle async - keep observing).
    useLayoutEffect(() => {
        if (w === null) return;
        const el = contentRef.current;
        if (!el) return;
        const measure = () => setH(el.offsetHeight);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [w]);

    useEffect(() => {
        if (h === null || phase !== 'pill') return;
        const id = window.setTimeout(() => setPhase('open'), 30);
        return () => window.clearTimeout(id);
    }, [h, phase]);

    const kindText = request.kind === 'voice' ? t('common.aVoiceMemo', 'a voice memo')
        : request.kind === 'note' ? t('common.aNote', 'a note')
        : request.kind === 'pin' ? t('common.aMapPin', 'a map pin')
        : request.kind === 'music-track' ? t('common.aSong', 'a song')
        : request.kind === 'music-playlist' ? t('common.aPlaylist', 'a playlist')
        : request.kind === 'document' ? t('common.aDocument', 'a document')
        : t('common.aContact', 'a contact');
    const message = request.kind === 'signature-request'
        ? t('common.asksYouToSign', '{name} asks you to sign a document', { name: request.fromName })
        : t('common.wouldLikeToShare', '{name} would like to share {kind}', { name: request.fromName, kind: kindText });

    function close(accept: boolean) {
        if (phase === 'closing') return;
        setPhase('closing');
        window.setTimeout(() => onRespond(accept), 380);
    }

    const expanded = phase === 'open';
    const ease = 'cubic-bezier(0.32,0.72,0,1)';

    return (
        <>
            <div ref={probeRef} className="h-0 w-full" aria-hidden />
            <div
                className="mx-auto mt-[11px] overflow-hidden font-sf"
                style={{
                    width:        expanded && w ? w : PILL_W,
                    height:       expanded && h ? h : PILL_H,
                    borderRadius: expanded ? 34 : PILL_R,
                    background:   '#000',
                    boxShadow:    expanded ? '0 18px 48px rgba(0,0,0,0.45)' : '0 0 0 rgba(0,0,0,0)',
                    transition:   `width 0.45s ${ease}, height 0.45s ${ease}, border-radius 0.45s ${ease}, box-shadow 0.45s ${ease}`,
                    willChange:   'width, height',
                }}
            >
                <div
                    ref={contentRef}
                    style={{
                        width:      w ?? undefined,
                        opacity:    expanded ? 1 : 0,
                        transition: expanded ? 'opacity 0.26s ease 0.16s' : 'opacity 0.14s ease',
                    }}
                >
                    <div className="flex items-start gap-3 px-6 pt-[52px]">
                        <div className="min-w-0 flex-1">
                            <div className="text-[21px] font-bold text-white">AirShare</div>
                            <p className="mt-1 text-[15.5px] leading-snug text-white/60">
                                {message}
                            </p>
                        </div>
                        <InitialsAvatar name={request.fromName} color={colorFor(request.fromName)} size={64} />
                    </div>

                    <div className="flex gap-3 px-6 pb-6 pt-5">
                        <button type="button" onClick={() => close(false)} className="flex-1 rounded-full bg-white/[0.14] py-3.5 text-[17px] font-semibold text-white active:opacity-70">
                            {t('common.decline', 'Decline')}
                        </button>
                        <button type="button" onClick={() => close(true)} className="flex-1 rounded-full bg-ios-blue py-3.5 text-[17px] font-semibold text-white active:opacity-80">
                            {t('common.accept', 'Accept')}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
