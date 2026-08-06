import { memo, useRef, useState, type ReactNode } from 'react';
import { MapPin, Pause, Play, Reply, Smile } from 'lucide-react';

import { projectPct, styleMaxZoom, tileUrl } from '@/apps/maps/data';
import { decodeWaypoint } from '@/lib/waypointCode';
import { isVideoUrl } from '@/core/photosApi';
import type { Message } from './data';
import { t } from '@/i18n';

const REACTIONS = ['❤️', '👍', '👎', '😂'];

const TILE_PX    = 256;
const PREVIEW_W  = 230;
const PREVIEW_H  = 140;

const BACKDROP_Z = 2;

function locationCoords(msg: Message): { x: number; y: number } {
    const wp = msg.wpCode ? decodeWaypoint(msg.wpCode) : null;
    return wp ? { x: wp.x, y: wp.y } : { x: 150, y: -950 };
}

function LocationMapPreview({ x, y }: { x: number; y: number }) {
    const zMax = styleMaxZoom('satellite');
    const n = 2 ** zMax;
    const { left, top } = projectPct(x, y);
    const px = (left / 100) * n * TILE_PX;
    const py = (top  / 100) * n * TILE_PX;
    const originX = PREVIEW_W / 2 - px;
    const originY = PREVIEW_H / 2 - py;

    const layer = (z: number): ReactNode[] => {
        const span = TILE_PX * 2 ** (zMax - z);
        const nz   = 2 ** z;
        const clampIdx = (v: number) => Math.max(0, Math.min(nz - 1, v));
        const iMin = clampIdx(Math.floor((px - PREVIEW_W / 2) / span));
        const iMax = clampIdx(Math.floor((px + PREVIEW_W / 2) / span));
        const jMin = clampIdx(Math.floor((py - PREVIEW_H / 2) / span));
        const jMax = clampIdx(Math.floor((py + PREVIEW_H / 2) / span));

        const tiles: ReactNode[] = [];
        for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
                tiles.push(
                    <img
                        key={`${z}-${i}-${j}`}
                        src={tileUrl('satellite', z, i, j)}
                        alt=""
                        draggable={false}
                        decoding="async"
                        onError={e => {
                            const imgEl = e.currentTarget as HTMLImageElement;
                            imgEl.style.opacity = '0';
                            const tries = Number(imgEl.dataset.retry ?? '0');
                            if (tries < 2) {
                                imgEl.dataset.retry = String(tries + 1);
                                const base = imgEl.src.replace(/&r=\d+$/, '');
                                window.setTimeout(() => { imgEl.src = `${base}&r=${tries + 1}`; }, 900 * (tries + 1));
                            }
                        }}
                        // Reveal with opacity, not visibility, so a loaded image can't override the
                        // AppDeck hidden-pool's visibility:hidden and leak onto the homescreen while
                        // this chat app is backgrounded (same reason as the map tiles in MapView).
                        onLoad={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
                        className="absolute max-w-none select-none"
                        style={{
                            left: originX + i * span,
                            top:  originY + j * span,
                            width:  span + 0.6,   // hairline overlap hides seams
                            height: span + 0.6,
                        }}
                    />,
                );
            }
        }
        return tiles;
    };

    return <>{layer(BACKDROP_Z)}{layer(zMax - 1)}{layer(zMax)}</>;
}

const EMOJI_RE = new RegExp(
    '(\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*|\\p{Regional_Indicator}{2})',
    'gu',
);

function withLargeEmoji(text: string): ReactNode[] {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(EMOJI_RE)) {
        const idx = m.index ?? 0;
        if (idx > last) out.push(text.slice(last, idx));
        out.push(<span key={idx} style={{ fontSize: '1.2em' }}>{m[0]}</span>);
        last = idx + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

interface MessageBubbleProps {
    msg:          Message;
    sent:         boolean;
    isLast:       boolean;
    isDark:       boolean;
    receivedBg:   string;
    sentBg:       string;
    pickerOpen:   boolean;
    onOpenPicker: (msgId: string) => void;
    onReact:      (msgId: string, emoji: string) => void;
    onReply:      (msgId: string) => void;
    onPay:        (messageId: string, amount: number) => void;
    onLocationTap?: (msgId: string) => void;
    locationCaption?: string;
    onLocationRespond?: (msgId: string, accept: boolean) => void;
    onImageTap?: (url: string) => void;
    customBubble?: ReactNode;
    hideActions?: boolean;
}

export const MessageBubble = memo(function MessageBubble({
    msg, sent, isLast, isDark, receivedBg, sentBg, pickerOpen, onOpenPicker, onReact, onReply, onPay, onLocationTap, locationCaption, onLocationRespond, onImageTap, customBubble, hideActions = false,
}: MessageBubbleProps) {
    const radius      = 16;
    const cutCorner   = isLast ? (sent ? 'rounded-br-md' : 'rounded-bl-md') : '';
    const bubbleShape = `rounded-2xl ${cutCorner}`;
    const fg          = sent ? '#fff' : (isDark ? '#fff' : '#000');
    const chip        = isDark ? 'rgb(var(--elevated))' : '#fff';
    const side        = sent ? 'right-0' : 'left-0';

    return (
        <>
            {msg.replyTo && (
                <div
                    className={`mb-1 max-w-full overflow-hidden rounded-2xl px-3 py-1.5 ${sent ? 'self-end' : 'self-start'}`}
                    style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
                >
                    <div className="text-[11px] font-semibold opacity-60">{msg.replyTo.name}</div>
                    <div className="truncate text-[13px] opacity-75">{msg.replyTo.body}</div>
                </div>
            )}

            <div className="group relative">
                {!pickerOpen && !hideActions && (
                    <div className={`invisible absolute bottom-full z-10 flex gap-1 pb-1.5 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 ${side}`}>
                        <TapBtn isDark={isDark} onClick={() => onReply(msg.id)}>
                            <Reply className="h-[17px] w-[17px]" strokeWidth={2.2} />
                        </TapBtn>
                        <TapBtn isDark={isDark} onClick={() => onOpenPicker(msg.id)}>
                            <Smile className="h-[17px] w-[17px]" strokeWidth={2.2} />
                        </TapBtn>
                    </div>
                )}

                {pickerOpen && !hideActions && (
                    <div
                        className={`tapback-picker absolute bottom-full z-30 mb-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-1 shadow-lg ${side}`}
                        style={{ background: chip }}
                    >
                        {REACTIONS.map(r => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => onReact(msg.id, r)}
                                className={`flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none transition-transform hover:scale-125 ${msg.reactions?.some(x => x.mine && x.emoji === r) ? 'bg-ios-blue/20' : ''}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                )}

                {customBubble ? customBubble : msg.kind === 'gif' && msg.gifUrl ? (
                    <img src={msg.gifUrl} alt={t('messages.gifAlt', 'GIF')} className="max-w-[260px] active:opacity-80" style={{ borderRadius: radius }} />
                ) : msg.kind === 'image' && msg.gifUrl && isVideoUrl(msg.gifUrl) ? (
                    // A clip shares the image kind, so it is told apart by extension the same way
                    // Photogram does. An <img> pointed at a .mov renders as a broken tile.
                    <video
                        src={msg.gifUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-w-[260px] object-cover"
                        style={{ borderRadius: radius, maxHeight: 320 }}
                    />
                ) : msg.kind === 'image' && msg.gifUrl ? (
                    <img
                        src={msg.gifUrl}
                        alt=""
                        onClick={() => onImageTap?.(msg.gifUrl!)}
                        className="max-w-[260px] cursor-pointer object-cover transition-opacity active:opacity-90"
                        style={{ borderRadius: radius, maxHeight: 320 }}
                    />
                ) : msg.kind === 'money' ? (
                    msg.requested ? (
                        <div
                            className={`flex flex-col items-center justify-center gap-2 rounded-[22px] ${sent ? 'rounded-br-md' : 'rounded-bl-md'} px-4 py-5`}
                            style={{ background: '#1c1c1e', width: 190 }}
                        >
                            <span className="text-[42px] font-bold leading-none tracking-tight text-white">${msg.amount}</span>
                            <span className="text-[13px] font-medium text-white/70">{sent ? t('messages.youRequested', 'You requested') : t('messages.requestedFromYou', 'Requested from you')}</span>
                            {sent ? (
                                <span
                                    className="text-[13px] font-semibold"
                                    style={{ color: msg.requestStatus === 'paid' ? '#30d158' : msg.requestStatus === 'declined' ? '#ff453a' : 'rgba(255,255,255,0.5)' }}
                                >
                                    {msg.requestStatus === 'paid' ? t('messages.paid', 'Paid') : msg.requestStatus === 'declined' ? t('messages.declined', 'Declined') : t('messages.pending', 'Pending')}
                                </span>
                            ) : msg.requestStatus === 'paid' ? (
                                <span className="text-[13px] font-semibold" style={{ color: '#30d158' }}>{t('messages.paid', 'Paid')}</span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onPay(msg.id, msg.amount ?? 0)}
                                    className="mt-1 rounded-full bg-[#34C759] px-7 py-1.5 text-[15px] font-semibold text-white active:opacity-80"
                                >
                                    {t('messages.pay', 'Pay')}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div
                            className={`flex flex-col items-center justify-center gap-1.5 rounded-[22px] ${sent ? 'rounded-br-md' : 'rounded-bl-md'}`}
                            style={{ background: '#1c1c1e', width: 190, height: 150 }}
                        >
                            <span className="text-[46px] font-bold leading-none tracking-tight text-white">${msg.amount}</span>
                            <span className="text-[13px] font-medium tracking-wide text-white/70">{sent ? t('messages.youSent', 'You sent') : t('messages.youReceived', 'You received')}</span>
                        </div>
                    )
                ) : msg.kind === 'locrequest' ? (
                    <div className="overflow-hidden text-left" style={{ borderRadius: radius, width: 230 }}>
                        <div className="relative overflow-hidden" style={{ height: 110, background: 'linear-gradient(145deg,#3a4a52,#2c3a42)' }}>
                            <LocationMapPreview x={150} y={-950} />
                            <div className="absolute inset-0" style={{ background: 'rgba(12,18,24,0.45)' }} />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                    className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-ios-blue"
                                    style={{ boxShadow: '0 0 0 7px rgba(10,132,255,0.30), 0 2px 8px rgba(0,0,0,0.45)' }}
                                >
                                    <MapPin className="h-[24px] w-[24px] text-white" strokeWidth={2.2} />
                                </span>
                            </div>
                        </div>
                        <div className="px-3.5 py-2.5" style={{ background: isDark ? 'rgb(var(--elevated))' : '#c6c6c6' }}>
                            <div className="text-[15px] font-semibold leading-snug" style={{ color: isDark ? '#fff' : '#000' }}>
                                {locationCaption ?? (sent ? t('messages.sentLocationRequest', 'You sent a location sharing request') : t('messages.wantsShareLocations', 'Wants to share locations with you'))}
                            </div>
                            {(() => {
                                const status = msg.requestStatus ?? 'pending';
                                if (!sent && status === 'pending') {
                                    return (
                                        <div className="mt-2 mb-0.5 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onLocationRespond?.(msg.id, true)}
                                                className="flex-1 rounded-full bg-[#34C759] py-1.5 text-[15px] font-semibold text-white active:opacity-80"
                                            >
                                                {t('common.accept', 'Accept')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onLocationRespond?.(msg.id, false)}
                                                className="flex-1 rounded-full py-1.5 text-[15px] font-semibold active:opacity-80"
                                                style={{ background: 'rgba(127,127,127,0.28)', color: isDark ? '#fff' : '#000' }}
                                            >
                                                {t('common.decline', 'Decline')}
                                            </button>
                                        </div>
                                    );
                                }
                                return (
                                    <div
                                        className="mt-2 mb-0.5 flex items-center justify-center rounded-full py-1.5 text-[15px] font-bold"
                                        style={{
                                            background: status === 'accepted' ? 'rgba(48,209,88,0.20)' : status === 'declined' ? 'rgba(255,69,58,0.20)' : 'rgba(127,127,127,0.20)',
                                            color: status === 'accepted'
                                                ? (isDark ? '#30d158' : '#1d9b46')
                                                : status === 'declined'
                                                    ? (isDark ? '#ff453a' : '#d70015')
                                                    : (isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.6)'),
                                        }}
                                    >
                                        {status === 'accepted' ? t('messages.accepted', 'Accepted') : status === 'declined' ? t('messages.declined', 'Declined') : t('messages.pending', 'Pending')}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                ) : msg.kind === 'location' ? (
                    <button
                        type="button"
                        onClick={() => onLocationTap?.(msg.id)}
                        className="block overflow-hidden text-left transition-opacity active:opacity-80"
                        style={{ borderRadius: radius, width: 230 }}
                    >
                        <div className="relative overflow-hidden" style={{ height: PREVIEW_H, background: 'linear-gradient(145deg,#3a4a52,#2c3a42)' }}>
                            {(() => { const c = locationCoords(msg); return <LocationMapPreview x={c.x} y={c.y} />; })()}
                            <div
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
                                style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
                            >
                                <svg width="30" height="40" viewBox="0 0 24 32" fill="none">
                                    <path
                                        d="M12 1C6.2 1 1.5 5.7 1.5 11.5c0 7.6 9.1 18.1 10 19.1.3.3.7.3 1 0 .9-1 10-11.5 10-19.1C22.5 5.7 17.8 1 12 1Z"
                                        fill="#EB4B3C"
                                        stroke="#fff"
                                        strokeWidth="1.6"
                                    />
                                    <circle cx="12" cy="11.6" r="4.2" fill="#fff" />
                                </svg>
                            </div>
                        </div>
                        {locationCaption && (
                            <div className="px-3.5 py-2.5" style={{ background: isDark ? 'rgb(var(--elevated))' : '#c6c6c6' }}>
                                <div className="text-[15px] font-semibold leading-snug" style={{ color: isDark ? '#fff' : '#000' }}>{locationCaption}</div>
                                <div className="mt-0.5 text-[13.5px]" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' }}>{t('messages.tapToOpenInMaps', 'Tap to open in Maps')}</div>
                            </div>
                        )}
                    </button>
                ) : msg.kind === 'voice' ? (
                    <VoiceBubble msg={msg} sent={sent} bubbleShape={bubbleShape} sentBg={sentBg} receivedBg={receivedBg} fg={fg} />
                ) : (
                    <div
                        className={`relative cursor-text select-text px-[14px] py-[8px] leading-[1.3] ${bubbleShape}`}
                        style={{ background: sent ? sentBg : receivedBg, color: fg, wordBreak: 'break-word', fontSize: 'calc(19px * var(--chat-text-scale, 1))' }}
                    >
                        {withLargeEmoji(msg.body)}
                    </div>
                )}

            </div>

            {msg.reactions && msg.reactions.length > 0 && (
                <div className={`relative z-10 -mt-1 flex gap-1 ${sent ? '-translate-x-[3px]' : 'translate-x-[3px]'}`}>
                    {msg.reactions.map(r => (
                        <span
                            key={r.emoji}
                            className="flex h-[30px] min-w-[30px] items-center justify-center gap-[3px] rounded-full px-2 leading-none shadow"
                            style={{ background: r.mine ? '#0a84ff' : chip, color: r.mine ? '#fff' : (isDark ? '#fff' : '#000') }}
                        >
                            <span className="text-[18px]">{r.emoji}</span>
                            {r.count > 1 && <span className="text-[13px] font-semibold tabular-nums">{r.count}</span>}
                        </span>
                    ))}
                </div>
            )}
        </>
    );
});

const VOICE_BARS = 40;

function VoiceBubble({ msg, sent, bubbleShape, sentBg, receivedBg, fg }: {
    msg:        Message;
    sent:       boolean;
    bubbleShape: string;
    sentBg:     string;
    receivedBg: string;
    fg:         string;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing,  setPlaying]  = useState(false);
    const [progress, setProgress] = useState(0);

    function onTimeUpdate() {
        const a = audioRef.current;
        if (!a) return;
        const total = msg.duration && msg.duration > 0
            ? msg.duration
            : (Number.isFinite(a.duration) ? a.duration : 0);
        if (total > 0) setProgress(Math.min(1, a.currentTime / total));
    }

    function toggle() {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) void a.play(); else a.pause();
    }

    const dur    = msg.duration ?? 0;
    const mmss   = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    const accent = sent ? '#fff' : '#007AFF';

    const bars = (msg.waveform && msg.waveform.length > 0)
        ? msg.waveform
        : Array(VOICE_BARS).fill(0).map((_, i) => 14 + (i % 3) * 6);

    const litColor = sent ? 'rgba(255,255,255,0.95)' : 'rgb(var(--ios-blue))';
    const dimColor = sent ? 'rgba(255,255,255,0.40)' : 'rgba(0,122,255,0.32)';

    return (
        <button
            type="button"
            onClick={msg.audioUrl ? toggle : undefined}
            className={`flex items-center gap-2.5 px-[14px] py-[8px] ${bubbleShape} ${msg.audioUrl ? 'active:opacity-90' : ''}`}
            style={{ background: sent ? sentBg : receivedBg, width: 215 }}
        >
            {msg.audioUrl && (
                <audio
                    ref={audioRef}
                    src={msg.audioUrl}
                    preload="none"
                    onPlay={()       => setPlaying(true)}
                    onPause={()      => setPlaying(false)}
                    onTimeUpdate={onTimeUpdate}
                    onEnded={()      => { setPlaying(false); setProgress(0); }}
                />
            )}
            {playing
                ? <Pause className="h-[18px] w-[18px] shrink-0" style={{ color: accent }} fill="currentColor" strokeWidth={0} />
                : <Play  className="h-[18px] w-[18px] shrink-0" style={{ color: accent }} fill="currentColor" strokeWidth={0} />}
            <div className="flex flex-1 items-center gap-[1px]" style={{ height: 22 }}>
                {bars.map((v, ii) => (
                    <div
                        key={ii}
                        className="min-w-0 flex-1 rounded-full transition-colors duration-150"
                        style={{
                            height: `${Math.max(14, v)}%`,
                            background: (ii + 0.5) / bars.length <= progress ? litColor : dimColor,
                        }}
                    />
                ))}
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums" style={{ color: fg }}>{mmss}</span>
        </button>
    );
}

function TapBtn({ isDark, onClick, children }: { isDark: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full shadow transition-transform active:scale-90"
            style={{ background: isDark ? 'rgb(var(--elevated))' : '#fff', color: isDark ? '#fff' : '#1c1c1e' }}
        >
            {children}
        </button>
    );
}
