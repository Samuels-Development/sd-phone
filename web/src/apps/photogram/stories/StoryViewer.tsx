import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { t } from '@/i18n';
import type { StoryGroup } from '../photogramApi';
import { apiMarkStorySeen } from '../photogramApi';
import { isVideoUrl } from '../create/Media';
import { VerifiedCheck } from '../ui';
import { useDeckActive } from '@/shell/deckActive';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function StoryViewer({ stories, startIndex, onClose }: { stories: StoryGroup[]; startIndex: number; onClose: () => void }) {
    const [si, setSi] = useState(startIndex);
    const [fi, setFi] = useState(0);
    const story = stories[si];

    const frame = story?.frames[fi];
    const activeUrl     = frame?.url ?? '';
    const activeIsVideo = isVideoUrl(activeUrl);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [progress, setProgress] = useState(0);
    // Freeze story playback while the app is backgrounded; resume when foregrounded.
    const deckActive = useDeckActive();

    useEffect(() => {
        if (frame) void apiMarkStorySeen(frame.id);
    }, [frame]);

    useEffect(() => {
        setProgress(0);
        const v = videoRef.current;
        if (!v || !activeIsVideo) return;
        v.currentTime = 0;
    }, [si, fi, activeIsVideo]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v || !activeIsVideo) return;
        if (!deckActive) { v.pause(); return; }
        v.muted = false;
        void v.play().catch(() => { v.muted = true; void v.play().catch(() => {}); });
    }, [si, fi, activeIsVideo, deckActive]);

    if (!story || !frame) return null;

    function advance(dir: 1 | -1) {
        if (dir === 1) {
            if (fi < story.frames.length - 1) setFi(fi + 1);
            else if (si < stories.length - 1) { setSi(si + 1); setFi(0); }
            else onClose();
        } else {
            if (fi > 0) setFi(fi - 1);
            else if (si > 0) { setSi(si - 1); setFi(0); }
        }
    }

    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-black" style={{ animation: 'ios-sheet-backdrop-in 0.2s ease-out' }}>
            <StatusBarSpacer />

            <div className="flex gap-1 px-2.5 pt-1">
                {story.frames.map((f, i) => {
                    const w = i < fi ? '100%' : i > fi ? '0%' : (activeIsVideo ? `${progress * 100}%` : '100%');
                    return (
                        <div key={f.id} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
                            <div className="h-full rounded-full bg-white" style={{ width: w, transition: i === fi && activeIsVideo ? 'width 0.12s linear' : undefined }} />
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <img src={story.user.avatar} alt="" draggable={false} className="h-[32px] w-[32px] rounded-full object-cover" />
                <span className="text-[14px] font-semibold text-white">{story.user.handle}</span>
                {story.user.verified && <VerifiedCheck size={18} />}
                <div className="flex-1" />
                <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="text-white active:opacity-60">
                    <X className="h-7 w-7" strokeWidth={2.2} />
                </button>
            </div>

            <div className="relative min-h-0 flex-1">
                {activeIsVideo ? (
                    <video
                        key={`${si}-${fi}`}
                        ref={videoRef}
                        src={activeUrl}
                        autoPlay
                        playsInline
                        onTimeUpdate={e => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
                        onEnded={() => advance(1)}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                ) : (
                    <img src={activeUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                )}
                <button type="button" aria-label={t('photogram.previousStory', 'Previous')} onClick={() => advance(-1)} className="absolute inset-y-0 left-0 w-1/3" />
                <button type="button" aria-label={t('photogram.nextStory', 'Next')} onClick={() => advance(1)} className="absolute inset-y-0 right-0 w-2/3" />
            </div>

            <div className="h-7 shrink-0" />
        </div>
    );
}
