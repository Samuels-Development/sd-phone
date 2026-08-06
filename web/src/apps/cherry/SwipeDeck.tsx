import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, TransitionEvent as ReactTransitionEvent } from 'react';
import { Cherry as CherryGlyph, Heart, RotateCcw, X } from 'lucide-react';

import { t } from '@/i18n';
import { portalToPhoneScreen } from '@/ui/portal';
import { CHERRY, type Match, type SwipeProfile } from './data';

export function SwipeDeck({ profiles, canReset, lockedIds, onSwipe, onRewind, onReset, onRefresh, onSendFirst }: {
    profiles:      SwipeProfile[];
    canReset:      boolean;
    lockedIds:     string[];
    onSwipe:       (p: SwipeProfile, liked: boolean) => Promise<Match | null>;
    onRewind:      (target: string) => void;
    onReset:       () => void;
    onRefresh:     () => Promise<void>;
    onSendFirst:   (matchId: string, body: string) => void;
}) {
    const [cards,     setCards]     = useState<SwipeProfile[]>(profiles);
    const [gone,      setGone]      = useState<SwipeProfile[]>([]);
    useEffect(() => {
        const drop = new Set(lockedIds);
        setCards(profiles.filter(p => !drop.has(p.id)));
        setGone([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profiles]);
    useEffect(() => {
        if (!lockedIds.length) return;
        const drop = new Set(lockedIds);
        setCards(c => (c.some(p => drop.has(p.id)) ? c.filter(p => !drop.has(p.id)) : c));
        setGone(g => (g.some(p => drop.has(p.id)) ? g.filter(p => !drop.has(p.id)) : g));
    }, [lockedIds]);
    const [pos,       setPos]       = useState({ dx: 0, dy: 0 });
    const [animating, setAnimating] = useState(false);
    const [promoting, setPromoting] = useState(false);
    const [photoIdx,  setPhotoIdx]  = useState(0);
    const [match,     setMatch]     = useState<{ card: SwipeProfile; matchId: string } | null>(null);

    const start    = useRef({ x: 0, y: 0 });
    const dragging = useRef(false);
    const moved    = useRef(0);
    const pending  = useRef<'like' | 'nope' | null>(null);
    const grabTop  = useRef(true);

    const top    = cards[0];
    const behind = cards[1];
    const third  = cards[2];

    useEffect(() => { setPhotoIdx(0); }, [top?.id]);

    function flyOff(dir: 'like' | 'nope') {
        if (!top || animating) return;
        pending.current = dir;
        setAnimating(true);
        setPromoting(true);
        setPos({ dx: dir === 'like' ? 700 : -700, dy: 60 });
    }
    function snapBack() {
        pending.current = null;
        setAnimating(true);
        setPromoting(false);
        setPos({ dx: 0, dy: 0 });
    }
    function rewind() {
        if (animating || gone.length === 0) return;
        const last = gone[gone.length - 1];
        setGone(g => g.slice(0, -1));
        setCards(c => [last, ...c]);
        setPos({ dx: 0, dy: 0 });
        onRewind(last.id);
    }

    function onTransitionEnd(e: ReactTransitionEvent) {
        if (e.propertyName !== 'transform') return;
        setAnimating(false);
        if (!pending.current) return;
        const dir = pending.current;
        pending.current = null;
        const card = cards[0];
        setCards(c => c.slice(1));
        setGone(g => [...g, card]);
        setPromoting(false);
        setPos({ dx: 0, dy: 0 });
        if (card) {
            void onSwipe(card, dir === 'like').then(matched => {
                if (matched) {
                    setGone(g => g.filter(c => c.id !== card.id));
                    setMatch({ card, matchId: matched.id });
                }
            });
        }
    }

    function onPointerDown(e: ReactPointerEvent) {
        if (animating) return;
        dragging.current = true;
        moved.current = 0;
        start.current = { x: e.clientX, y: e.clientY };
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        grabTop.current = e.clientY < rect.top + rect.height / 2;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: ReactPointerEvent) {
        if (!dragging.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        moved.current = Math.max(moved.current, Math.abs(dx) + Math.abs(dy));
        setPos({ dx, dy: dy * 0.4 });
    }
    function onPointerUp(e: ReactPointerEvent) {
        if (!dragging.current) return;
        dragging.current = false;
        const dx = e.clientX - start.current.x;
        if (moved.current < 10) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const right = (e.clientX - rect.left) > rect.width * 0.4;
            const count = top?.photos.length ?? 1;
            setPhotoIdx(i => right ? Math.min(i + 1, count - 1) : Math.max(i - 1, 0));
            setPos({ dx: 0, dy: 0 });
            return;
        }
        if (dx > 95) flyOff('like');
        else if (dx < -95) flyOff('nope');
        else snapBack();
    }

    const rot    = pos.dx * 0.055 * (grabTop.current ? 1 : -1);
    const likeOp = Math.max(0, Math.min(1, pos.dx / 100));
    const nopeOp = Math.max(0, Math.min(1, -pos.dx / 100));
    const dragProg = promoting ? 1 : Math.min(1, Math.abs(pos.dx) / 160);

    if (!top) {
        return (
            <div className="relative flex min-h-0 flex-1 flex-col px-5">
                <Empty canReset={canReset} onReset={onReset} onRefresh={onRefresh} canRewind={gone.length > 0} onRewind={rewind} />
                {match && (
                    <MatchOverlay
                        profile={match.card}
                        onSend={body => { onSendFirst(match.matchId, body); setMatch(null); }}
                        onClose={() => setMatch(null)}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col px-5">
            <div className="relative min-h-0 flex-1">
                {third && (
                    <div className="absolute inset-0" style={{ transform: 'scale(0.96) translateY(10px)', opacity: 0.7 }}>
                        <Card profile={third} photoIdx={0} />
                    </div>
                )}
                {behind && (
                    <div
                        className="absolute inset-0"
                        style={{
                            transform: `scale(${0.96 + 0.04 * dragProg}) translateY(${10 - 10 * dragProg}px)`,
                            opacity:   0.7 + 0.3 * dragProg,
                            transition: (animating || promoting)
                                ? 'transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.32s ease'
                                : 'none',
                        }}
                    >
                        <Card profile={behind} photoIdx={0} />
                    </div>
                )}
                <div
                    className="absolute inset-0 z-20 touch-none select-none"
                    style={{
                        transform:  `translate(${pos.dx}px, ${pos.dy}px) rotate(${rot}deg)`,
                        transition: animating ? 'transform 0.32s cubic-bezier(0.22,1,0.36,1)' : 'none',
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onTransitionEnd={onTransitionEnd}
                >
                    <Card profile={top} photoIdx={photoIdx} onPickPhoto={setPhotoIdx} />
                    <Stamp side="like" opacity={likeOp} />
                    <Stamp side="nope" opacity={nopeOp} />
                </div>
            </div>

            <div className="flex shrink-0 items-center justify-center gap-7 pb-24 pt-5">
                <CircleBtn label={t('cherry.nope', 'Nope')} color={CHERRY.nope} size={80} onClick={() => flyOff('nope')} disabled={!top || animating}>
                    <X className="h-[35px] w-[35px]" strokeWidth={2.6} />
                </CircleBtn>
                <CircleBtn label={t('cherry.rewind', 'Rewind')} color={CHERRY.rewind} size={66} onClick={rewind} disabled={animating || gone.length === 0}>
                    <RotateCcw className="h-[29px] w-[29px]" strokeWidth={2.6} />
                </CircleBtn>
                <CircleBtn label={t('cherry.like', 'Like')} color={CHERRY.like} size={80} onClick={() => flyOff('like')} disabled={!top || animating}>
                    <Heart className="h-[33px] w-[33px]" strokeWidth={2.4} fill="currentColor" />
                </CircleBtn>
            </div>

            {match && (
                <MatchOverlay
                    profile={match.card}
                    onSend={body => { onSendFirst(match.matchId, body); setMatch(null); }}
                    onClose={() => setMatch(null)}
                />
            )}
        </div>
    );
}

function Card({ profile, photoIdx, onPickPhoto }: {
    profile: SwipeProfile;
    photoIdx: number;
    onPickPhoto?: (i: number) => void;
}) {
    const activeIdx = Math.min(photoIdx, Math.max(0, profile.photos.length - 1));
    return (
        <div className="relative h-full w-full overflow-hidden rounded-[18px] bg-black shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            {profile.photos.length > 0 ? (
                profile.photos.map((src, i) => (
                    <img
                        key={`${src}-${i}`}
                        src={src}
                        alt={i === activeIdx ? profile.name : ''}
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                        style={{
                            opacity: i === activeIdx ? 1 : 0,
                            transform: 'translateZ(0)',
                            willChange: 'opacity',
                            backfaceVisibility: 'hidden',
                        }}
                    />
                ))
            ) : (
                <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: `linear-gradient(165deg, ${CHERRY.pink}, #C81E5A)` }}
                >
                    <span className="text-[96px] font-extrabold text-white/90">{profile.name.slice(0, 1).toUpperCase()}</span>
                </div>
            )}

            {profile.photos.length > 1 && (
                <div className="absolute inset-x-3 top-0 z-10 flex gap-1.5">
                    {profile.photos.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            aria-label={t('cherry.photoN', 'Photo {n}', { n: i + 1 })}
                            onPointerDown={e => e.stopPropagation()}
                            onPointerUp={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); onPickPhoto?.(i); }}
                            className={`flex-1 pb-2 pt-2.5 ${onPickPhoto ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                            <span
                                className="block h-[3px] w-full rounded-full transition-colors"
                                style={{ background: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.4)' }}
                            />
                        </button>
                    ))}
                </div>
            )}

            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-5 pb-5 pt-24">
                <div className="flex items-end gap-2.5">
                    <span className="text-[34px] font-bold leading-none text-white">{profile.name}</span>
                    <span className="text-[28px] font-medium leading-none text-white/95">{profile.age}</span>
                </div>
                <p className="mt-2 text-[18px] font-semibold leading-snug text-white/95" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                    {profile.bio}
                </p>
            </div>
        </div>
    );
}

function Stamp({ side, opacity }: { side: 'like' | 'nope'; opacity: number }) {
    const like = side === 'like';
    const style: CSSProperties = {
        transform:   `rotate(${like ? -16 : 16}deg)`,
        borderColor: like ? CHERRY.like : CHERRY.nope,
        color:       like ? CHERRY.like : CHERRY.nope,
        opacity,
        ...(like ? { left: 22 } : { right: 22 }),
    };
    return (
        <div className="pointer-events-none absolute top-10 rounded-lg border-[3.5px] px-3 py-0.5 text-[30px] font-extrabold uppercase tracking-wide" style={style}>
            {like ? t('cherry.like', 'Like') : t('cherry.nope', 'Nope')}
        </div>
    );
}

function CircleBtn({ color, size, onClick, disabled, label, children }: {
    color: string; size: number; onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className="flex items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] transition enabled:hover:bg-[#f5f5f5] active:scale-90 disabled:opacity-40"
            style={{ width: size, height: size, color }}
        >
            {children}
        </button>
    );
}

function Empty({ canReset, onReset, onRefresh, canRewind, onRewind }: {
    canReset: boolean; onReset: () => void; onRefresh: () => Promise<void>;
    canRewind: boolean; onRewind: () => void;
}) {
    const [checking, setChecking] = useState(false);
    async function check() {
        if (checking) return;
        setChecking(true);
        try { await onRefresh(); } finally { setChecking(false); }
    }
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center">
            <CherryGlyph className="h-[72px] w-[72px] text-black/30" strokeWidth={1.5} />
            <p className="mt-4 text-[21px] font-semibold text-black/85">
                {canReset ? t('cherry.allCaughtUp', "You're all caught up") : t('cherry.noOneNew', 'No one new around')}
            </p>
            <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/65">
                {canReset
                    ? t('cherry.noMorePeople', 'No more people nearby right now. Check back later.')
                    : t('cherry.noOneElse', "There's no one else on Cherry for you right now. Check back again soon.")}
            </p>
            {canReset ? (
                <button type="button" onClick={onReset} className="mt-6 rounded-full px-10 py-3.5 text-[19px] font-semibold text-white active:opacity-80" style={{ background: CHERRY.pink }}>
                    {t('cherry.startOver', 'Start over')}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => void check()}
                    disabled={checking}
                    className="mt-6 rounded-full px-10 py-3.5 text-[19px] font-semibold text-white active:opacity-80 disabled:opacity-60"
                    style={{ background: CHERRY.pink }}
                >
                    {checking ? t('cherry.checking', 'Checking…') : t('cherry.checkForNew', 'Check for new people')}
                </button>
            )}
            {canRewind && (
                <button type="button" onClick={onRewind} className="mt-4 text-[16px] font-semibold active:opacity-60" style={{ color: CHERRY.rewind }}>
                    {t('cherry.rewindLastSwipe', 'Rewind last swipe')}
                </button>
            )}
        </div>
    );
}

export function MatchOverlay({ profile, onSend, onClose }: {
    profile: SwipeProfile;
    onSend:  (body: string) => void;
    onClose: () => void;
}) {
    const [text, setText] = useState('');
    const photo = profile.photos[0];

    function submit() {
        const t = text.trim();
        if (!t) return;
        onSend(t);
    }

    const overlay = (
        <div className="absolute inset-0 z-[60] flex flex-col overflow-hidden" style={{ animation: 'ios-sheet-backdrop-in 0.3s ease-out' }}>
            {photo ? (
                <img src={photo} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(165deg, ${CHERRY.pink}, #C81E5A)` }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.88) 100%)' }} />

            <div className="relative flex min-h-0 flex-1 flex-col items-center px-7 text-center">
                <div className="flex-[1.1]" />

                <div style={{ animation: 'ios-alert-in 0.34s cubic-bezier(0.2,0.9,0.3,1.15)' }}>
                    <p className="text-[27px] font-bold uppercase italic tracking-[0.18em] text-white/45">{t('cherry.itsA', "It's a")}</p>
                    <div className="relative -mt-2">
                        <p
                            aria-hidden
                            className="absolute left-0 top-[34%] w-full select-none text-[84px] font-black uppercase italic leading-none"
                            style={{ WebkitTextStroke: '2px rgba(0,0,0,0.35)', color: 'transparent', padding: '0 0.1em' }}
                        >
                            {t('cherry.matchExclaim', 'Match!')}
                        </p>
                        <p
                            className="relative select-none text-[84px] font-black uppercase italic leading-none"
                            style={{
                                background: 'linear-gradient(100deg, #ff2d78 10%, #ff445c 55%, #ff5e3a 100%)',
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                color: 'transparent',
                                filter: 'drop-shadow(0 4px 14px rgba(255,45,110,0.35))',
                                padding: '0 0.1em',
                            }}
                        >
                            {t('cherry.matchExclaim', 'Match!')}
                        </p>
                    </div>
                </div>

                <div className="flex-1" />

                <p className="text-[24px] font-semibold italic text-white">{t('cherry.likedYouBack', '{name} liked you back', { name: profile.name })}</p>

                <div className="mt-6 flex w-full items-center rounded-[14px] bg-white pr-2.5">
                    <input
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                        placeholder={t('cherry.sayNice', 'Leave a comment')}
                        className="min-w-0 flex-1 bg-transparent px-4 py-[18px] text-[18px] text-black placeholder-black/45 outline-none"
                    />
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!text.trim()}
                        className="shrink-0 px-2 text-[17px] font-bold tracking-wide text-ios-blue disabled:opacity-40 active:opacity-60"
                    >
                        {t('cherry.send', 'SEND')}
                    </button>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="mb-32 mt-10 text-[17px] font-semibold uppercase tracking-[0.14em] text-white active:opacity-60"
                >
                    {t('cherry.keepSwiping', 'Keep Swiping')}
                </button>
            </div>
        </div>
    );

    return portalToPhoneScreen(overlay);
}
