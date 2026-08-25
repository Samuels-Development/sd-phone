import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import clsx from 'clsx';

let sounding: HTMLAudioElement | null = null;

function clock(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function AudioPlayer({ src, className }: { src: string; className?: string }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrubbing = useRef(false);

    const [playing, setPlaying] = useState(false);
    const [at, setAt] = useState(0);
    const [total, setTotal] = useState(0);

    useEffect(() => () => {
        const el = audioRef.current;
        if (el) {
            el.pause();
            if (sounding === el) sounding = null;
        }
    }, []);

    const toggle = () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) {
            if (sounding && sounding !== el) sounding.pause();
            sounding = el;
            void el.play();
        } else {
            el.pause();
        }
    };

    const seekTo = useCallback((clientX: number) => {
        const track = trackRef.current;
        const el = audioRef.current;
        if (!track || !el || !total) return;
        const box = track.getBoundingClientRect();
        const next = Math.max(0, Math.min(total, ((clientX - box.left) / box.width) * total));
        el.currentTime = next;
        setAt(next);
    }, [total]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!total) return;
        scrubbing.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e.clientX);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (scrubbing.current) seekTo(e.clientX);
    };

    const endScrub = () => { scrubbing.current = false; };

    const pct = total ? Math.min(100, (at / total) * 100) : 0;

    return (
        <div
            className={clsx(
                'flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/[0.07]',
                className,
            )}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
        >
            <audio
                ref={audioRef}
                src={src}
                preload="none"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setAt(0); }}
                onTimeUpdate={e => { if (!scrubbing.current) setAt(e.currentTarget.currentTime); }}
                onLoadedMetadata={e => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setTotal(d);
                }}
            />

            <button
                type="button"
                onClick={toggle}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ios-blue/15 text-[#6db4ff] transition-colors hover:bg-ios-blue/25"
                title={playing ? 'Pause' : 'Play'}
            >
                {playing
                    ? <Pause size={15} className="fill-current" />
                    : <Play size={15} className="translate-x-[1px] fill-current" />}
            </button>

            <div
                ref={trackRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endScrub}
                onPointerCancel={endScrub}
                className={clsx('relative h-4 min-w-0 flex-1 touch-none', total ? 'cursor-pointer' : 'cursor-default')}
            >
                <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/10" />
                <div
                    className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#6db4ff]"
                    style={{ width: `${pct}%` }}
                />
                <div
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                    style={{ left: `${pct}%` }}
                />
            </div>

            <span className="shrink-0 tabular-nums text-[11.5px] text-zinc-500">
                {clock(at)} / {clock(total || NaN)}
            </span>
        </div>
    );
}
