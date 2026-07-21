import { useState } from 'react';
import { ChevronLeft, Clapperboard, Images, Music2, Radio, Video, X } from 'lucide-react';

import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { isVideoUrl } from '@/core/photosApi';
import { GRAD_FROM, GRAD_TO, type VPost } from './data';
import { apiCreate } from './vibezApi';

export function UploadOverlay({ myHandle, initialUrl, onRecord, onClose, onPosted, onGoLive }: {
    myHandle?:   string;
    initialUrl?: string | null;
    onRecord:    () => void;
    onClose:     () => void;
    onPosted:    (post: VPost) => void;
    onGoLive:    () => void;
}) {
    const [picker,  setPicker]  = useState(false);
    const [media,   setMedia]   = useState<string | null>(initialUrl ?? null);
    const [caption, setCaption] = useState('');
    const [sound,   setSound]   = useState('');
    const [busy,    setBusy]    = useState(false);

    async function post() {
        if (!media || busy) return;
        setBusy(true);
        const created = await apiCreate(media, caption.trim(), sound.trim());
        setBusy(false);
        if (created) onPosted(created);
    }

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#0a0518]">
            <div className="flex h-12 shrink-0 items-center justify-between px-4 pt-[54px] pb-8">
                {media ? (
                    <button
                        type="button"
                        aria-label={t('vibez.back', 'Back')}
                        onClick={() => setMedia(null)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:opacity-70"
                    >
                        <ChevronLeft className="h-5 w-5 text-white" strokeWidth={2.4} />
                    </button>
                ) : <span className="h-9 w-9" />}
                <span className="text-[16px] font-bold text-white">
                    {media ? t('vibez.newVibe', 'New Vibe') : t('vibez.create', 'Create')}
                </span>
                <button
                    type="button"
                    aria-label={t('vibez.close', 'Close')}
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:opacity-70"
                >
                    <X className="h-5 w-5 text-white" strokeWidth={2.4} />
                </button>
            </div>

            {!media ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 pb-16">
                    <div
                        className="flex h-20 w-20 items-center justify-center rounded-[24px]"
                        style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                    >
                        <Clapperboard className="h-9 w-9 text-white" strokeWidth={2} />
                    </div>
                    <p className="max-w-[260px] text-center text-[14px] leading-relaxed text-white/60">
                        {t('vibez.createHint', 'Record a clip with the camera, or post one from your gallery.')}
                    </p>

                    <div className="mt-2 w-full space-y-3">
                        <CreateButton onClick={onRecord} gradient icon={<Video className="h-5 w-5" strokeWidth={2.2} />}>
                            {t('vibez.recordWithCamera', 'Record with Camera')}
                        </CreateButton>
                        <CreateButton onClick={() => setPicker(true)} icon={<Images className="h-5 w-5" strokeWidth={2.2} />}>
                            {t('vibez.chooseFromGallery', 'Choose from Gallery')}
                        </CreateButton>
                        <CreateButton onClick={onGoLive} icon={<Radio className="h-5 w-5" strokeWidth={2.2} />}>
                            {t('vibez.goLive', 'Go LIVE')}
                        </CreateButton>
                    </div>
                </div>
            ) : (
                <div className="flex min-h-0 flex-1 flex-col px-5 pb-8">
                    <div className="mx-auto aspect-[9/16] h-[38%] overflow-hidden rounded-xl bg-white/5">
                        {isVideoUrl(media)
                            ? <video src={media} muted playsInline autoPlay loop className="h-full w-full object-cover" />
                            : <img src={media} alt="" draggable={false} className="h-full w-full object-cover" />}
                    </div>

                    <textarea
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                        maxLength={300}
                        rows={3}
                        spellCheck={false}
                        placeholder={t('vibez.captionPlaceholder', 'Describe your vibe… add #hashtags and @mentions')}
                        className="mt-4 w-full resize-none rounded-lg bg-white/10 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
                    />

                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 px-3.5">
                        <Music2 className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2.2} />
                        <input
                            value={sound}
                            onChange={e => setSound(e.target.value)}
                            maxLength={120}
                            spellCheck={false}
                            placeholder={t('vibez.soundPlaceholder', 'original sound — {handle}', { handle: myHandle ?? 'you' })}
                            className="w-full bg-transparent py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
                        />
                    </div>

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={() => void post()}
                        disabled={busy}
                        className="w-full rounded-full py-3 text-[16px] font-bold text-white active:opacity-85 disabled:opacity-50"
                        style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                    >
                        {busy ? t('vibez.posting', 'Posting…') : t('vibez.post', 'Post')}
                    </button>
                </div>
            )}

            {picker && (
                <MediaPickerSheet
                    forceDark
                    onSelect={p => { setMedia(p.url); setPicker(false); }}
                    onClose={() => setPicker(false)}
                />
            )}
        </div>
    );
}

function CreateButton({ onClick, gradient, icon, children }: {
    onClick:   () => void;
    gradient?: boolean;
    icon:      React.ReactNode;
    children:  React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center justify-center gap-2.5 rounded-full py-3 text-[15px] font-semibold text-white active:opacity-85"
            style={gradient
                ? { background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }
                : { background: 'rgba(255,255,255,0.1)' }}
        >
            {icon}
            {children}
        </button>
    );
}
