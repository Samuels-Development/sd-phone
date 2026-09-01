import { useState } from 'react';
import { ImagePlus, LocateFixed, MapPin, Pencil } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { IG } from '../data';
import { MediaThumb } from './Media';
import { apiCurrentZone } from '../photogramApi';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function CreateSheet({ onClose, onPost, animateIn = true }: {
    onClose: () => void;
    onPost:  (images: string[], caption: string, location?: string) => void;
    animateIn?: boolean;
}) {
    const [enter] = useState(animateIn);
    const [images,   setImages]   = useState<string[]>([]);
    const [sel,      setSel]      = useState(0);
    const [caption,  setCaption]  = useSessionState('photogram:createCaption', '');
    const [location, setLocation] = useSessionState('photogram:createLocation', '');
    const [picking,  setPicking]  = useState(false);
    const [locating, setLocating] = useState(false);
    const [closing,  setClosing]  = useState(false);

    function dismiss(after: () => void) {
        if (closing) return;
        setClosing(true);
        window.setTimeout(after, 300);
    }

    function share() {
        if (images.length === 0) return;
        dismiss(() => { onPost(images, caption.trim(), location.trim() || undefined); setCaption(''); setLocation(''); });
    }

    async function useCurrentLocation() {
        if (locating) return;
        setLocating(true);
        const zone = await apiCurrentZone();
        if (zone) setLocation(zone);
        setLocating(false);
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-[#f2f2f2] font-sf"
            style={{
                animation: closing
                    ? 'ios-sheet-down 0.3s cubic-bezier(0.4,0,1,1) forwards'
                    : enter ? 'ios-sheet-up 0.32s cubic-bezier(0.32,0.72,0,1)' : undefined,
                willChange: 'transform',
            }}
        >
            <StatusBarSpacer />
            <header className="relative flex items-center justify-between px-4 pb-2">
                <button type="button" onClick={() => dismiss(onClose)} className="text-[17px] text-black active:opacity-50">{t('photogram.cancel', 'Cancel')}</button>
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[18px] font-semibold text-black">{t('photogram.newPost', 'New post')}</span>
                <button type="button" onClick={share} disabled={images.length === 0} className="text-[17px] font-semibold active:opacity-50 disabled:opacity-40" style={{ color: IG.blue }}>{t('photogram.share', 'Share')}</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-8">
                {images.length > 0 ? (
                    <MediaThumb url={images[sel]} className="aspect-square w-full" />
                ) : (
                    <button type="button" onClick={() => setPicking(true)} className="flex aspect-square w-full flex-col items-center justify-center gap-2.5 bg-black/[0.04] text-black/45 active:opacity-70">
                        <ImagePlus className="h-[52px] w-[52px]" strokeWidth={1.5} />
                        <span className="text-[17px] font-medium">{t('photogram.selectPhotos', 'Select photos')}</span>
                    </button>
                )}

                {images.length > 1 && (
                    <div className="flex gap-[2px] overflow-x-auto no-scrollbar p-[2px]">
                        {images.map((src, i) => (
                            <button key={i} type="button" onClick={() => setSel(i)} className="h-[72px] w-[72px] shrink-0" style={{ boxShadow: i === sel ? `inset 0 0 0 2.5px ${IG.blue}` : undefined }}>
                                <MediaThumb url={src} className={`h-full w-full ${i === sel ? '' : 'opacity-60'}`} badge={false} />
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-3 bg-white">
                    <div className="flex items-start gap-3.5 px-4 py-[18px]">
                        <Pencil className="mt-[3px] h-[22px] w-[22px] shrink-0 text-black/40" strokeWidth={2} />
                        <textarea
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            rows={3}
                            placeholder={t('photogram.writeCaption', 'Write a caption…')}
                            className="min-w-0 flex-1 resize-none bg-transparent text-[18px] leading-snug text-black outline-none placeholder:text-black/40"
                        />
                    </div>
                    <div className="flex items-center gap-3.5 border-t border-black/[0.07] px-4 py-[18px]">
                        <MapPin className="h-[22px] w-[22px] shrink-0 text-black/40" strokeWidth={2} />
                        <input
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder={t('photogram.addLocation', 'Add location')}
                            className="min-w-0 flex-1 bg-transparent text-[18px] text-black outline-none placeholder:text-black/40"
                        />
                        <button
                            type="button"
                            onClick={useCurrentLocation}
                            disabled={locating}
                            className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/[0.05] px-3.5 py-2 text-[15px] font-semibold active:opacity-60 disabled:opacity-50"
                            style={{ color: IG.blue }}
                        >
                            <LocateFixed className="h-[16px] w-[16px]" strokeWidth={2.4} />
                            {locating ? t('photogram.locating', 'Locating…') : t('photogram.current', 'Current')}
                        </button>
                    </div>
                </div>

                {images.length > 0 && (
                    <button type="button" onClick={() => setPicking(true)} className="px-4 py-3.5 text-left text-[17px] font-semibold active:opacity-50" style={{ color: IG.blue }}>
                        {t('photogram.editSelection', 'Edit selection')}
                    </button>
                )}
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    initialSelectedUrls={images}
                    onSelectMany={photos => { setImages(photos.map(p => p.url)); setSel(0); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
