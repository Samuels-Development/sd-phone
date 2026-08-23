import { useState } from 'react';
import { ChevronLeft, Clapperboard, Images, Music2, Radio, Video, X } from 'lucide-react';

import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { MusicPickerSheet } from './MusicPickerSheet';
import { isVideoUrl } from '@/core/photosApi';
import { HEART, type VPost } from './data';
import { apiCreate } from './vibezApi';

const EXIT_MS = 300;

export function UploadOverlay({ myHandle, initialUrl, onRecord, onClose, onPosted, onGoLive }: {
    myHandle?:   string;
    initialUrl?: string | null;
    onRecord:    () => void;
    onClose:     () => void;
    onPosted:    (post: VPost) => void;
    onGoLive:    () => void;
}) {
    const [picker,  setPicker]  = useState(false);
    const [music,   setMusic]   = useState(false);
    const [media,   setMedia]   = useState<string | null>(initialUrl ?? null);
    const [caption, setCaption] = useState('');
    const [sound,   setSound]   = useState('');
    const [busy,    setBusy]    = useState(false);
    const [back,    setBack]    = useState(false);
    const [leaving, setLeaving] = useState(false);

    function dismiss() {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(onClose, EXIT_MS);
    }

    function pick(url: string) {
        setBack(false);
        setMedia(url);
    }

    function clear() {
        setBack(true);
        setMedia(null);
    }

    async function post() {
        if (!media || busy) return;
        setBusy(true);
        const created = await apiCreate(media, caption.trim(), sound.trim());
        setBusy(false);
        if (created) onPosted(created);
    }

    return (
        <div
            className={`absolute inset-0 z-30 flex flex-col bg-black ${
                leaving ? 'animate-slide-out-down' : 'animate-slide-up-fade'
            }`}
        >
            <div className="flex h-12 shrink-0 items-center justify-between px-4 pb-8 pt-[58px]">
                {media ? (
                    <IconButton label={t('vibez.back', 'Back')} onClick={clear}>
                        <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
                    </IconButton>
                ) : <span className="h-9 w-9" />}
                <span className="text-[17px] font-bold text-white">
                    {media ? t('vibez.newVibe', 'New post') : t('vibez.create', 'Create')}
                </span>
                <IconButton label={t('vibez.close', 'Close')} onClick={dismiss}>
                    <X className="h-5 w-5" strokeWidth={2.4} />
                </IconButton>
            </div>

            <div
                key={media ? 'compose' : 'choose'}
                className={`flex min-h-0 flex-1 flex-col ${back ? 'animate-tab-in-left' : 'animate-tab-in-right'}`}
            >
                {!media ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 pb-16">
                        <div className="animate-icon-pop flex h-20 w-20 items-center justify-center rounded-[24px] bg-white/[0.08] ring-1 ring-white/10">
                            <Clapperboard className="h-9 w-9 text-white" strokeWidth={1.9} />
                        </div>
                        <p className="max-w-[260px] text-center text-[14.5px] leading-relaxed text-white/55">
                            {t('vibez.createHint', 'Record a clip with the camera, or post one from your gallery.')}
                        </p>

                        <div className="mt-2 w-full space-y-3">
                            <CreateButton onClick={onRecord} primary icon={<Video className="h-5 w-5" strokeWidth={2.2} />}>
                                {t('vibez.recordWithCamera', 'Record with Camera')}
                            </CreateButton>
                            <CreateButton onClick={() => setPicker(true)} icon={<Images className="h-5 w-5" strokeWidth={2.2} />}>
                                {t('vibez.chooseFromGallery', 'Choose from Gallery')}
                            </CreateButton>
                            <CreateButton
                                onClick={onGoLive}
                                icon={<Radio className="h-5 w-5" strokeWidth={2.2} style={{ color: HEART }} />}
                            >
                                {t('vibez.goLive', 'Go LIVE')}
                            </CreateButton>
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col px-5 pb-8">
                        <div className="mx-auto aspect-[9/16] h-[38%] overflow-hidden rounded-[18px] bg-white/5 ring-1 ring-white/10">
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
                            placeholder={t('vibez.captionPlaceholder', 'Describe your clip… add #hashtags and @mentions')}
                            className="mt-4 w-full resize-none rounded-[14px] bg-white/[0.07] px-3.5 py-3 text-[15px] text-white outline-none ring-1 ring-white/10 transition-colors placeholder:text-white/35 focus:bg-white/[0.1]"
                        />

                        <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-white/[0.07] pl-3.5 pr-1.5 ring-1 ring-white/10 transition-colors focus-within:bg-white/[0.1]">
                            <Music2 className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2.2} />
                            <input
                                value={sound}
                                onChange={e => setSound(e.target.value)}
                                maxLength={120}
                                spellCheck={false}
                                placeholder={t('vibez.soundPlaceholder', 'original sound — {handle}', { handle: myHandle ?? 'you' })}
                                className="w-full bg-transparent py-3 text-[15px] text-white outline-none placeholder:text-white/35"
                            />
                            <button
                                type="button"
                                onClick={() => setMusic(true)}
                                className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white transition-transform active:scale-95 active:bg-white/[0.16]"
                            >
                                {t('vibez.chooseSoundShort', 'Choose')}
                            </button>
                        </div>

                        <div className="flex-1" />

                        <button
                            type="button"
                            onClick={() => void post()}
                            disabled={busy}
                            className="w-full rounded-full bg-white py-3.5 text-[16px] font-bold text-black transition-transform active:scale-[0.98] disabled:bg-white/20 disabled:text-white/40"
                        >
                            {busy ? t('vibez.posting', 'Posting…') : t('vibez.post', 'Post')}
                        </button>
                    </div>
                )}
            </div>

            {picker && (
                <MediaPickerSheet
                    forceDark
                    onSelect={p => { pick(p.url); setPicker(false); }}
                    onClose={() => setPicker(false)}
                />
            )}

            {music && (
                <MusicPickerSheet
                    myHandle={myHandle}
                    onSelect={setSound}
                    onClose={() => setMusic(false)}
                />
            )}
        </div>
    );
}

function IconButton({ label, onClick, children }: {
    label:    string;
    onClick:  () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-transform active:scale-90 active:opacity-70"
        >
            {children}
        </button>
    );
}

function CreateButton({ onClick, primary, icon, children }: {
    onClick:  () => void;
    primary?: boolean;
    icon:     React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center justify-center gap-2.5 rounded-full py-3.5 text-[15px] font-semibold transition-transform active:scale-[0.98] ${
                primary ? 'bg-white text-black' : 'bg-white/10 text-white ring-1 ring-white/10 active:bg-white/[0.14]'
            }`}
        >
            {icon}
            {children}
        </button>
    );
}
