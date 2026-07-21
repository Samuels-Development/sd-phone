import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Coins, Delete, Hash, Phone, PhoneOff, RotateCcw, X } from 'lucide-react';

import { t } from '@/i18n';
import { fetchNui, isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { playDtmf } from '@/apps/phone/keypad/dtmf';
import { formatPhone } from '@/lib/phone';

type Phase = 'idle' | 'calling' | 'connected' | 'ended';

interface Favorite { name: string; phone: string }

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function fmtClock(secs: number): string {
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// The payphone renders as the real machine: a brushed stainless enclosure with
// the handset hung on the left, a green LCD, a metal keypad, a coin slot and a
// riveted instruction placard. Only the presentation lives here — the call
// flow/NUI contract is unchanged from the old panel UI.
// ---------------------------------------------------------------------------

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const HAND = '"Great Vibes", "Snell Roundhand", "Segoe Script", cursive';

/** Fine noise texture multiplied into the steel for grain + wear. */
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>")`;

/** Brushed steel: vertical micro-striations under broad studio highlights. */
const STEEL: CSSProperties = {
    background: [
        'radial-gradient(120% 90% at 30% 10%, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%)',
        'radial-gradient(150% 110% at 78% 96%, rgba(0,0,0,0.28), rgba(0,0,0,0) 60%)',
        'repeating-linear-gradient(92deg, rgba(255,255,255,0.05) 0px, rgba(0,0,0,0.05) 1px, rgba(255,255,255,0.03) 2px)',
        'linear-gradient(165deg, #bfc2c6 0%, #a2a5aa 40%, #8d9095 72%, #a9acb1 100%)',
    ].join(', '),
};

/** A stamped depression in the steel (LCD tray, keypad tray, coin recess). */
const RECESS: CSSProperties = {
    background: 'linear-gradient(180deg, #85888d 0%, #999da2 60%, #a4a7ac 100%)',
    boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.4), inset 2px 0 4px rgba(0,0,0,0.18), inset -2px 0 4px rgba(0,0,0,0.18)',
};

/** One square chromed key with a light face and etched digit. */
const KEY_FACE: CSSProperties = {
    background: 'linear-gradient(180deg, #f4f5f6 0%, #dcdee1 48%, #c6c8cc 100%)',
    border: '1px solid #43454a',
    boxShadow: '0 2px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -2px 3px rgba(0,0,0,0.2)',
};

const ETCHED: CSSProperties = {
    color: '#33363c',
    textShadow: '0 1px 0 rgba(255,255,255,0.45)',
};

/**
 * The whole left-side assembly — cradle hook, handset, armored cable and the
 * wall port — drawn in ONE svg so every joint shares one coordinate space:
 *  - the hook bar runs from the enclosure (the svg overhangs it) to under the
 *    handle, so the handset visibly hangs on something;
 *  - the handset's resting tilt is an SVG rotate about a KNOWN pivot (the hook,
 *    58,110), which makes the mouth-cap position deterministic — the cable's
 *    first point is authored 16px INSIDE that cap, so it stays attached both
 *    at rest and through the lift animation;
 *  - all handset parts fill from one userSpaceOnUse gradient, so ear cap,
 *    handle and mouth cap shade as a single left-lit object instead of three
 *    mismatched blobs;
 *  - the cable ends inside a screwed wall plate + rubber grommet that sits on
 *    the enclosure's face (the same overhang), so both ends terminate somewhere.
 * The svg itself ignores pointer events; an invisible overlay above the handset
 * becomes the hang-up control while a call runs.
 */
function HandsetAssembly({ lifted, onHangup }: { lifted: boolean; onHangup: () => void }) {
    return (
        <div className="relative" style={{ width: 112 }}>
            <svg
                width="184"
                height="560"
                viewBox="0 0 184 560"
                aria-hidden
                className="pointer-events-none block"
                style={{ overflow: 'visible', filter: 'drop-shadow(5px 9px 12px rgba(0,0,0,0.5))' }}
            >
                <defs>
                    {/* one horizontal, left-lit shading ramp shared by every
                        handset part — userSpaceOnUse so all parts sample the
                        SAME ramp and read as one moulded object. Classic
                        payphone-yellow plastic, sun-faded and grubby. */}
                    <linearGradient id="ppHsG" gradientUnits="userSpaceOnUse" x1="18" y1="0" x2="100" y2="0">
                        <stop offset="0" stopColor="#f0c64a" />
                        <stop offset="0.45" stopColor="#c8951d" />
                        <stop offset="1" stopColor="#8a6410" />
                    </linearGradient>
                    <linearGradient id="ppHookG" gradientUnits="userSpaceOnUse" x1="0" y1="140" x2="0" y2="170">
                        <stop offset="0" stopColor="#c2c5ca" />
                        <stop offset="0.5" stopColor="#96999e" />
                        <stop offset="1" stopColor="#717479" />
                    </linearGradient>
                </defs>

                {/* cradle housing: a moulded pocket the handset's upper half seats into,
                    drawn behind the handset (the retaining clip renders on top of it) */}
                <rect x="10" y="44" width="98" height="182" rx="22" fill="#7e8186" stroke="#5a5c61" strokeWidth="1.4" />
                <rect x="16" y="50" width="86" height="170" rx="18" fill="#6b6e73" />
                <rect x="16" y="50" width="86" height="170" rx="18" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.2" />
                <rect x="16" y="50" width="86" height="26" rx="13" fill="rgba(255,255,255,0.10)" />

                {/* armored cable: starts 16px inside the (tilted) mouth cap,
                    sags, then climbs into the grommet */}
                <path d="M36 398 C 18 446, 20 494, 52 516 C 76 531, 96 522, 104 500" stroke="#0b0b0d" strokeWidth="9" fill="none" strokeLinecap="round" />
                <path d="M36 398 C 18 446, 20 494, 52 516 C 76 531, 96 522, 104 500" stroke="#44464c" strokeWidth="6" strokeDasharray="2.6 2.4" fill="none" strokeLinecap="round" />

                {/* cable-entry plate wrapped over the enclosure's edge, sitting
                    in the blank steel margin left of the keypad tray */}
                <rect x="86" y="466" width="38" height="48" rx="7" fill="#9a9da2" stroke="#595b60" strokeWidth="1.4" />
                <rect x="86" y="466" width="38" height="14" rx="7" fill="rgba(255,255,255,0.28)" />
                <circle cx="93" cy="507" r="2" fill="#63666b" />
                <circle cx="117" cy="507" r="2" fill="#63666b" />
                <circle cx="105" cy="490" r="11.5" fill="#292a2e" stroke="#0f1012" strokeWidth="2.4" />
                <circle cx="105" cy="490" r="5" fill="#050506" />
                <path d="M96 483 A 10.5 10.5 0 0 1 113 482" stroke="rgba(255,255,255,0.16)" strokeWidth="2" fill="none" />

                {/* the handset. Outer group animates the lift; inner group holds
                    the resting tilt about the hook pivot (58,110). */}
                <g
                    style={{
                        transformBox: 'view-box',
                        transformOrigin: '58px 110px',
                        transform: lifted ? 'translate(6px, -16px) rotate(-4deg)' : 'none',
                        transition: 'transform 0.35s cubic-bezier(0.3, 0.9, 0.4, 1.1)',
                    }}
                >
                    <g transform="rotate(5 58 110)">
                        {/* ear cap, handle, mouth cap — one shared gradient */}
                        <rect x="20" y="60" width="76" height="80" rx="28" fill="url(#ppHsG)" />
                        <path d="M40 124 C 33 205, 33 285, 40 366 L 76 366 C 83 285, 83 205, 76 124 Z" fill="url(#ppHsG)" />
                        <rect x="20" y="350" width="76" height="80" rx="28" fill="url(#ppHsG)" />
                        {/* moulding seam + edge definition */}
                        <path d="M58 138 L 58 352" stroke="rgba(0,0,0,0.28)" strokeWidth="1.4" />
                        <rect x="20" y="60" width="76" height="80" rx="28" fill="none" stroke="rgba(70,50,10,0.45)" strokeWidth="1.2" />
                        <rect x="20" y="350" width="76" height="80" rx="28" fill="none" stroke="rgba(70,50,10,0.45)" strokeWidth="1.2" />
                        {/* grunge: hand-worn grip smudge, joint dirt, chips and a scratch */}
                        <path d="M56 200 C 54 240, 54 264, 56 300" stroke="rgba(58,42,14,0.22)" strokeWidth="22" fill="none" strokeLinecap="round" />
                        <path d="M42 128 Q 58 138 74 128" stroke="rgba(58,42,14,0.3)" strokeWidth="4" fill="none" strokeLinecap="round" />
                        <path d="M42 362 Q 58 352 74 362" stroke="rgba(58,42,14,0.3)" strokeWidth="4" fill="none" strokeLinecap="round" />
                        <circle cx="34" cy="86" r="2.2" fill="rgba(45,32,8,0.5)" />
                        <circle cx="79" cy="398" r="2.6" fill="rgba(45,32,8,0.45)" />
                        <circle cx="70" cy="70" r="1.6" fill="rgba(45,32,8,0.4)" />
                        <path d="M66 240 L 71 292" stroke="rgba(255,244,200,0.3)" strokeWidth="1.2" strokeLinecap="round" />
                        {/* left-lit speculars: plastic gloss ridge + cap glints */}
                        <path d="M36 84 C 31 205, 31 290, 36 406" stroke="rgba(255,255,255,0.16)" strokeWidth="8" fill="none" strokeLinecap="round" />
                        <path d="M34 74 Q 58 62 82 74" stroke="rgba(255,255,255,0.28)" strokeWidth="4" fill="none" strokeLinecap="round" />
                        <path d="M34 418 Q 58 428 82 418" stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" strokeLinecap="round" />
                    </g>
                </g>

                {/* retaining clip across the handset's neck, bolted to the housing - the
                    handset lifts up out of it during a call */}
                <rect x="20" y="128" width="76" height="15" rx="7" fill="url(#ppHookG)" stroke="#5f6166" strokeWidth="1.2" />
                <circle cx="27" cy="135.5" r="2.2" fill="#63666b" />
                <circle cx="89" cy="135.5" r="2.2" fill="#63666b" />
            </svg>

            {/* hang-up hit area over the handset silhouette (calls only) */}
            <button
                type="button"
                onClick={onHangup}
                title={t('payphone.hangUp', 'Hang up')}
                aria-label={t('payphone.hangUp', 'Hang up')}
                className="absolute left-0 top-[52px] h-[390px] w-[104px] rounded-full"
                style={{ pointerEvents: lifted ? 'auto' : 'none', cursor: 'pointer' }}
            />
        </div>
    );
}

/** A rivet on the instruction placard. */
function Rivet({ className }: { className: string }) {
    return (
        <span
            aria-hidden
            className={`absolute h-[7px] w-[7px] rounded-full ${className}`}
            style={{
                background: 'radial-gradient(circle at 35% 30%, #f0f1f2, #96999e 55%, #6e7176)',
                boxShadow: '0 1px 1px rgba(0,0,0,0.5)',
            }}
        />
    );
}

/** A taped-on scrap of ruled paper (the booth number / scribbled contacts). */
function TapedNote({ tilt, children }: { tilt: number; children: ReactNode }) {
    return (
        <div
            className="relative w-full px-3 py-2"
            style={{
                transform: `rotate(${tilt}deg)`,
                background: [
                    'repeating-linear-gradient(180deg, rgba(122,146,197,0) 0px, rgba(122,146,197,0) 15px, rgba(122,146,197,0.35) 15px, rgba(122,146,197,0.35) 16px)',
                    'linear-gradient(174deg, #f3ead0 0%, #eadfbf 100%)',
                ].join(', '),
                boxShadow: '0 3px 7px rgba(0,0,0,0.35)',
            }}
        >
            <span
                aria-hidden
                className="absolute -top-[7px] left-[10%] h-[14px] w-[52px] -rotate-3"
                style={{ background: 'rgba(226,220,200,0.6)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
            />
            <span
                aria-hidden
                className="absolute -top-[6px] right-[8%] h-[13px] w-[44px] rotate-2"
                style={{ background: 'rgba(226,220,200,0.55)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
            />
            {children}
        </div>
    );
}

export function PayphoneUI() {
    const [open,      setOpen]      = useState(false);
    const [leaving,   setLeaving]   = useState(false);
    const leaveTimer = useRef<number | null>(null);
    const [digits,    setDigits]    = useState('');
    const [phase,     setPhase]     = useState<Phase>('idle');
    const [lcdNote,   setLcdNote]   = useState<string | null>(null);
    const [elapsed,   setElapsed]   = useState(0);
    const [booth,     setBooth]     = useState<{ number: string; anonymous: boolean }>({ number: '', anonymous: false });
    const [myNumber,  setMyNumber]  = useState<string | null>(null);
    const [favorites, setFavorites] = useState<Favorite[]>([]);
    // Coin toll (configs/payphone.lua Coin): `credit` is a paid, unspent coin.
    const [coin,      setCoin]      = useState<{ enabled: boolean; cost: number }>({ enabled: false, cost: 1 });
    const [credit,    setCredit]    = useState(false);
    const [coinAnim,  setCoinAnim]  = useState(false);
    const [slotNudge, setSlotNudge] = useState(0);
    const coinBusy   = useRef(false);
    const channelRef = useRef<number | null>(null);
    const phaseRef   = useRef(phase);
    phaseRef.current = phase;
    const creditRef  = useRef(credit);
    creditRef.current = credit;
    const coinRef    = useRef(coin);
    coinRef.current  = coin;

    useNuiEvent('sd-phone:payphone:open', useCallback((data) => {
        if (leaveTimer.current) { window.clearTimeout(leaveTimer.current); leaveTimer.current = null; }
        setLeaving(false);
        setBooth({ number: data.number, anonymous: data.anonymous });
        setMyNumber(data.myNumber ?? null);
        setFavorites(Array.isArray(data.favorites) ? data.favorites : []);
        setCoin(data.coin ?? { enabled: false, cost: 1 });
        setCredit(data.credited === true);
        setCoinAnim(false);
        coinBusy.current = false;
        setDigits('');
        setPhase(data.connected ? 'connected' : 'idle');
        setLcdNote(data.connected && data.callerName ? data.callerName.toUpperCase() : null);
        setElapsed(0);
        channelRef.current = null;
        setOpen(true);
    }, []));

    useNuiEvent('sd-phone:call:connected', useCallback((data) => {
        if (channelRef.current !== null && data.channel === channelRef.current) {
            setPhase('connected');
            setElapsed(0);
        }
    }, []));

    useNuiEvent('sd-phone:payphone:ended', useCallback(() => {
        channelRef.current = null;
        setPhase('ended');
        setLcdNote(null);
    }, []));

    // Call timer; the caller-name note clears once it starts counting.
    useEffect(() => {
        if (phase !== 'connected') return;
        const timer = window.setInterval(() => { setElapsed(n => n + 1); setLcdNote(null); }, 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    // Ended flashes briefly, then the display resets for the next call.
    useEffect(() => {
        if (phase !== 'ended') return;
        const timer = window.setTimeout(() => { setPhase('idle'); setDigits(''); }, 2200);
        return () => window.clearTimeout(timer);
    }, [phase]);

    // Exit plays a short drop-away; NUI focus is released immediately so the player gets
    // control back while the machine fades out.
    const close = useCallback(() => {
        if (leaveTimer.current) return;
        setLeaving(true);
        void fetchNui('sd-phone:payphone:close');
        leaveTimer.current = window.setTimeout(() => {
            leaveTimer.current = null;
            setLeaving(false);
            setOpen(false);
        }, 240);
    }, []);

    // Capture-phase Escape so the phone underneath never sees it (same trick as the admin panel).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            e.preventDefault();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, close]);

    if (!open) return null;

    /** No unspent coin yet: the keypad is dead and the slot wants feeding. */
    const needsCoin = coin.enabled && !credit;

    function press(k: string) {
        if (phaseRef.current !== 'idle') return;
        if (coinRef.current.enabled && !creditRef.current) {
            // Dead keys until a coin goes in — nudge the slot instead of typing.
            setSlotNudge(n => n + 1);
            return;
        }
        setLcdNote(null);
        setDigits(prev => (prev.length >= 15 ? prev : prev + k));
        playDtmf(k);
    }

    /** Feed the slot: charge server-side, then run the coin-drop and unlock. */
    async function insertCoin() {
        if (!coinRef.current.enabled || creditRef.current || coinBusy.current || phaseRef.current !== 'idle') return;
        coinBusy.current = true;
        const r = await fetchNui<{ success: boolean; message?: string }>('sd-phone:payphone:insertcoin')
            .catch(() => null);
        if (r?.success || !isFiveM) {
            setCoinAnim(true);
            window.setTimeout(() => {
                setCoinAnim(false);
                setCredit(true);
                setLcdNote(`${t('payphone.credit', 'CREDIT')} $${coinRef.current.cost.toFixed(2)}`);
                coinBusy.current = false;
            }, 780);
        } else {
            setLcdNote(r?.message ?? t('payphone.noCoins', 'NO COINS'));
            coinBusy.current = false;
        }
    }

    async function call() {
        const number = digits.replace(/\D/g, '');
        if (!number || phaseRef.current !== 'idle') return;
        if (coinRef.current.enabled && !creditRef.current) {
            setSlotNudge(n => n + 1);
            return;
        }
        setPhase('calling');
        const r = await fetchNui<{ success: boolean; data?: { channel: number }; message?: string }>('sd-phone:payphone:dial', { number });
        if (r?.success && r.data) {
            channelRef.current = r.data.channel;
            // The coin bought this call; the next one wants a fresh one.
            if (coinRef.current.enabled) setCredit(false);
        } else {
            setPhase('idle');
            setLcdNote(r?.message ?? t('payphone.callFailed', 'CALL FAILED'));
        }
    }

    function hangup() {
        if (phaseRef.current === 'calling' || phaseRef.current === 'connected') {
            void fetchNui('sd-phone:payphone:hangup');
            channelRef.current = null;
            setPhase('ended');
        }
    }

    const lcd = lcdNote ? lcdNote.toUpperCase()
        : phase === 'calling'   ? t('payphone.calling', 'CALLING…')
        : phase === 'connected' ? fmtClock(elapsed)
        : phase === 'ended'     ? t('payphone.callEnded', 'CALL ENDED')
        : digits ? (digits.length === 10 ? formatPhone(digits) : digits)
        : needsCoin ? t('payphone.insertCoin', 'INSERT COIN')
        : booth.anonymous ? t('payphone.withheld', 'NO CALLER ID') : formatPhone(booth.number);

    /** The classic arcade blink, only while the display is begging for a coin. */
    const lcdBlink = !lcdNote && phase === 'idle' && !digits && needsCoin;

    const inCall = phase === 'calling' || phase === 'connected';
    const boothScrawl = booth.anonymous ? t('payphone.withheld', 'NO CALLER ID') : formatPhone(booth.number);

    return (
        <div
            className="fixed inset-0 z-[400] flex items-center justify-center font-sf"
            onMouseDown={() => { if (!inCall) close(); }}
        >
            {/* coin-toll animations: the drop, the slot's clink flash + idle
                beckon glow, the INSERT COIN blink and the dead-key nudge */}
            <style>{`
                @keyframes ppCoinDrop {
                    0%   { transform: translate(-50%, -54px) rotate(0deg) scaleX(1); opacity: 0; }
                    16%  { transform: translate(-50%, -40px) rotate(14deg) scaleX(0.94); opacity: 1; }
                    58%  { transform: translate(-50%, -4px) rotate(78deg) scaleX(0.4); opacity: 1; }
                    88%  { transform: translate(-50%, 30px) rotate(90deg) scaleX(0.18); opacity: 1; }
                    100% { transform: translate(-50%, 44px) rotate(90deg) scaleX(0.14); opacity: 0; }
                }
                @keyframes ppSlotFlash {
                    0%, 68% { box-shadow: inset 0 0 4px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.4); }
                    80%     { box-shadow: inset 0 0 4px rgba(0,0,0,0.95), 0 0 14px rgba(96,224,120,0.6), 0 1px 0 rgba(255,255,255,0.4); }
                    100%    { box-shadow: inset 0 0 4px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.4); }
                }
                @keyframes ppSlotBeckon {
                    0%, 100% { box-shadow: inset 0 0 4px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.4); }
                    50%      { box-shadow: inset 0 0 4px rgba(0,0,0,0.95), 0 0 10px rgba(96,224,120,0.35), 0 1px 0 rgba(255,255,255,0.4); }
                }
                @keyframes ppLcdBlink {
                    0%, 54% { opacity: 1; }
                    55%, 100% { opacity: 0.22; }
                }
                @keyframes ppSlotNudge {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-3px); }
                    55% { transform: translateX(3px); }
                    80% { transform: translateX(-1.5px); }
                }
            `}</style>
            <div
                className="relative flex items-start"
                onMouseDown={e => e.stopPropagation()}
                style={{ animation: leaving
                    ? 'payphone-out 0.24s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'payphone-in 0.34s cubic-bezier(0.32,0.72,0,1)' }}
            >

                {/* The enclosure: one cast body like the real units, the handset seated in
                    its moulded cradle housing on the left of the face. */}
                <div
                    className="relative w-[496px] rounded-[18px] p-5 pt-4"
                    style={{
                        ...STEEL,
                        border: '1px solid #55575b',
                        boxShadow: '0 30px 70px rgba(0,0,0,0.65), 0 6px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.3)',
                    }}
                >
                    {/* steel grain over the whole face */}
                    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[18px] mix-blend-multiply" style={{ backgroundImage: GRAIN, opacity: 0.3 }} />
                    {/* street wear: corner scuffs, grime pooled where hands go (keypad, the
                        handset grip), staining along the bottom, drips under the coin slot */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-[18px]"
                        style={{
                            background: [
                                'radial-gradient(120px 70px at 4% 98%, rgba(38,33,22,0.32), transparent 70%)',
                                'radial-gradient(150px 85px at 97% 94%, rgba(38,33,22,0.26), transparent 70%)',
                                'radial-gradient(90px 55px at 94% 4%, rgba(44,38,24,0.18), transparent 70%)',
                                'radial-gradient(70px 110px at 1% 34%, rgba(44,38,24,0.18), transparent 70%)',
                                'radial-gradient(60px 40px at 40% 99%, rgba(38,33,22,0.22), transparent 70%)',
                                'radial-gradient(150px 130px at 58% 60%, rgba(40,34,20,0.10), transparent 72%)',
                                'radial-gradient(70px 160px at 13% 46%, rgba(40,34,20,0.12), transparent 72%)',
                                'linear-gradient(178deg, transparent 64%, rgba(52,44,28,0.11) 82%, transparent 95%)',
                            ].join(', '),
                        }}
                    />
                    {/* drip staining under the coin slot */}
                    <div aria-hidden className="pointer-events-none absolute right-[38px] top-[452px] h-[58px] w-[3px] rounded-full" style={{ background: 'linear-gradient(180deg, rgba(74,60,34,0.42), rgba(74,60,34,0))' }} />
                    <div aria-hidden className="pointer-events-none absolute right-[56px] top-[446px] h-[34px] w-[2px] rounded-full" style={{ background: 'linear-gradient(180deg, rgba(74,60,34,0.3), rgba(74,60,34,0))' }} />
                    {/* scratches: a bright fresh one, an old dark one, a short gouge by the cradle */}
                    <div aria-hidden className="pointer-events-none absolute left-[34%] top-[55%] h-[1.5px] w-[130px] -rotate-[13deg]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.24) 30%, rgba(255,255,255,0.06) 70%, transparent)' }} />
                    <div aria-hidden className="pointer-events-none absolute right-[10%] bottom-[8%] h-[1.5px] w-[90px] rotate-[8deg]" style={{ background: 'linear-gradient(90deg, transparent, rgba(30,26,16,0.32) 40%, transparent)' }} />
                    <div aria-hidden className="pointer-events-none absolute left-[128px] top-[120px] h-[2px] w-[40px] rotate-[24deg] rounded-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 45%, rgba(20,18,12,0.25) 55%, transparent)' }} />
                    {/* ghost of a peeled-off sticker on the lower door */}
                    <div aria-hidden className="pointer-events-none absolute bottom-[168px] right-[30px] h-[34px] w-[58px] rotate-[4deg] rounded-[3px]" style={{ background: 'rgba(232,234,237,0.26)', boxShadow: 'inset 0 0 6px rgba(60,52,30,0.35)' }} />
                    {/* shallow dent in the skirt */}
                    <div aria-hidden className="pointer-events-none absolute bottom-[58px] right-[74px] h-[26px] w-[42px] rounded-[50%]" style={{ background: 'radial-gradient(ellipse at 40% 35%, rgba(0,0,0,0.16), transparent 70%)', boxShadow: 'inset 1px 2px 3px rgba(0,0,0,0.22), inset -1px -1px 2px rgba(255,255,255,0.16)' }} />
                    {/* mounting screws */}
                    {([['left-2 top-2', 40], ['left-2 bottom-2', -25], ['right-2 bottom-2', 75]] as const).map(([pos, angle]) => (
                        <span
                            key={pos}
                            aria-hidden
                            className={`pointer-events-none absolute ${pos} flex h-[10px] w-[10px] items-center justify-center rounded-full`}
                            style={{
                                background: 'radial-gradient(circle at 35% 30%, #dfe1e4, #9a9da2 55%, #6f7277)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 0 1px rgba(0,0,0,0.4)',
                            }}
                        >
                            <span className="block h-[1.5px] w-[7px] rounded-full bg-[#4a4c50]" style={{ transform: `rotate(${angle}deg)` }} />
                        </span>
                    ))}

                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('payphone.leave', 'Leave payphone')}
                        className="absolute right-2.5 top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full text-black/35 hover:text-black/65 active:opacity-60"
                    >
                        <X className="h-[18px] w-[18px]" strokeWidth={2.6} />
                    </button>

                    {/* The handset, seated in its housing on the face. */}
                    <div className="absolute left-3 top-5 z-10 select-none">
                        <HandsetAssembly lifted={inCall} onHangup={hangup} />
                    </div>

                    <div className="flex gap-4">
                        {/* keeps the controls clear of the handset zone */}
                        <div aria-hidden className="w-[116px] shrink-0" />

                        {/* The controls column. */}
                        <div className="min-w-0 flex-1">

                    {/* Brand band across the crown of the unit */}
                    <div className="flex items-center justify-center gap-1.5 pb-3 pt-1" style={ETCHED}>
                        <span aria-hidden className="flex h-[15px] w-[15px] items-center justify-center rounded-full border-[1.5px] border-current text-[9px] font-black leading-none">B</span>
                        <span className="text-[15px] font-bold tracking-[0.13em]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>BADGER</span>
                    </div>

                    {/* Slim riveted instruction placard */}
                    <div
                        className="relative rounded-[6px] px-3 py-2.5"
                        style={{
                            background: 'linear-gradient(170deg, #c6ccd2 0%, #afb5bc 100%)',
                            border: '1px solid #6b6e74',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.6)',
                        }}
                    >
                        <Rivet className="left-1.5 top-1.5" />
                        <Rivet className="right-1.5 top-1.5" />
                        <Rivet className="bottom-1.5 left-1.5" />
                        <Rivet className="bottom-1.5 right-1.5" />
                        <div className="flex items-center gap-3">
                            <div className="grid w-[132px] shrink-0 grid-cols-3 gap-1.5" style={{ color: '#41454e' }}>
                                {[Coins, Hash, Phone].map((Icon, i) => (
                                    <div key={i} className="flex flex-col items-center gap-0.5">
                                        <span className="text-[8px] font-bold">{i + 1}</span>
                                        <span className="flex h-[26px] w-full items-center justify-center rounded-[2px] border border-current opacity-75">
                                            <Icon className="h-[12px] w-[12px]" strokeWidth={2} />
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="min-w-0 flex-1" style={{ color: '#454a53' }}>
                                <span className="block border-b border-current pb-0.5 text-[8.5px] font-bold uppercase tracking-wide">
                                    {t('payphone.followOnCalls', 'Follow on calls')}
                                </span>
                                <span className="block pt-1 text-[7.5px] leading-[10px]">
                                    {t('payphone.finePrint', 'To use remaining credit for further calls, DO NOT REPLACE HANDSET. Press call button and dial.')}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* LCD tray */}
                    <div className="mt-4">
                        <div className="rounded-[14px] p-3.5" style={RECESS}>
                            <div
                                className="rounded-[6px] border border-black/80 p-[5px]"
                                style={{ background: 'linear-gradient(180deg, #1a1b1d, #2a2b2e)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }}
                            >
                                <div
                                    className="relative flex h-[92px] items-center justify-center overflow-hidden rounded-[3px]"
                                    style={{
                                        background: 'linear-gradient(180deg, #4be05f 0%, #35cb4b 55%, #43d858 100%)',
                                        boxShadow: 'inset 0 3px 9px rgba(0,0,0,0.4), inset 0 0 2px rgba(0,0,0,0.55)',
                                    }}
                                >
                                    {/* pixel grid + glass glare */}
                                    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 3px)' }} />
                                    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 32%)' }} />
                                    <span
                                        className="relative px-2 font-semibold text-[#0a1c0c]"
                                        style={{
                                            fontFamily: MONO,
                                            fontSize: lcd.length > 14 ? 19 : 25,
                                            letterSpacing: '0.1em',
                                            textShadow: '0.5px 0.5px 0 rgba(9,26,11,0.35)',
                                            animation: lcdBlink ? 'ppLcdBlink 1.15s step-end infinite' : undefined,
                                        }}
                                    >
                                        {lcd}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Keypad tray with the coin hardware column on its right */}
                    <div className="mt-4 flex gap-3">
                        <div className="flex-1 rounded-[14px] p-[14px]" style={RECESS}>
                            <div className="grid grid-cols-3 gap-2.5">
                                {KEYS.map(k => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => press(k)}
                                        className="flex h-[50px] items-center justify-center rounded-[8px] text-[21px] font-bold text-[#17181b] transition-[transform,filter] active:translate-y-[1px] active:brightness-90"
                                        style={KEY_FACE}
                                    >
                                        {k === '#' ? <Hash className="h-[19px] w-[19px]" strokeWidth={2.8} /> : k}
                                    </button>
                                ))}
                            </div>

                            {/* service row: clear / re-enter / the green call key / hang up */}
                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => { if (phase === 'idle') setDigits(prev => prev.slice(0, -1)); }}
                                        aria-label={t('payphone.clear', 'Clear')}
                                        title={t('payphone.clear', 'Clear')}
                                        className="flex h-[42px] w-[42px] items-center justify-center rounded-[7px] text-[#2a2c30] active:translate-y-[1px] active:brightness-90"
                                        style={KEY_FACE}
                                    >
                                        <Delete className="h-[17px] w-[17px]" strokeWidth={2.4} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { if (phase === 'idle') { setDigits(''); setLcdNote(null); } }}
                                        aria-label={t('payphone.reenter', 'Re-enter number')}
                                        title={t('payphone.reenter', 'Re-enter number')}
                                        className="flex h-[42px] w-[42px] items-center justify-center rounded-[7px] text-[#2a2c30] active:translate-y-[1px] active:brightness-90"
                                        style={KEY_FACE}
                                    >
                                        <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2.4} />
                                    </button>
                                </div>
                                <div className="flex gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => void call()}
                                        disabled={phase !== 'idle' || !digits}
                                        aria-label={t('payphone.call', 'Call')}
                                        title={t('payphone.call', 'Call')}
                                        className="flex h-[42px] w-[54px] items-center justify-center rounded-[7px] transition-[transform,filter] active:translate-y-[1px] active:brightness-90 disabled:opacity-45"
                                        style={{
                                            background: 'linear-gradient(180deg, #63e874 0%, #38bf4d 60%, #2ca63f 100%)',
                                            border: '1px solid #1d5c28',
                                            boxShadow: '0 2px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.55), 0 0 9px rgba(70,220,95,0.35)',
                                        }}
                                    >
                                        <Phone className="h-[17px] w-[17px] text-[#0c3314]" fill="currentColor" strokeWidth={0} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={hangup}
                                        disabled={!inCall}
                                        aria-label={t('payphone.hangUp', 'Hang up')}
                                        title={t('payphone.hangUp', 'Hang up')}
                                        className="flex h-[42px] w-[44px] items-center justify-center rounded-[7px] transition-[transform,filter] active:translate-y-[1px] active:brightness-90 disabled:opacity-45"
                                        style={{
                                            background: 'linear-gradient(180deg, #e4685c 0%, #b7362b 60%, #9c2a21 100%)',
                                            border: '1px solid #5e1b15',
                                            boxShadow: '0 2px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
                                        }}
                                    >
                                        <PhoneOff className="h-[16px] w-[16px] text-[#3d0d09]" strokeWidth={2.4} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Coin hardware column: the slot (INSERT COIN control), the toll, the return flap */}
                        <div className="flex w-[80px] flex-col items-center">
                            <div className="relative">
                                <button
                                    type="button"
                                    key={slotNudge}
                                    onClick={() => void insertCoin()}
                                    disabled={!needsCoin || phase !== 'idle'}
                                    aria-label={t('payphone.insertCoin', 'Insert coin')}
                                    title={needsCoin ? t('payphone.insertCoin', 'Insert coin') : undefined}
                                    className="rounded-[12px] p-3"
                                    style={{
                                        ...RECESS,
                                        cursor: needsCoin && phase === 'idle' ? 'pointer' : 'default',
                                        animation: slotNudge > 0 && needsCoin ? 'ppSlotNudge 0.35s ease' : undefined,
                                    }}
                                >
                                    <div
                                        className="h-[96px] w-[15px] rounded-[8px]"
                                        style={{
                                            background: 'linear-gradient(90deg, #0a0a0b, #1c1d1f 55%, #060607)',
                                            boxShadow: 'inset 0 0 4px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.4)',
                                            margin: '0 auto',
                                            animation: coinAnim ? 'ppSlotFlash 0.78s ease' : (needsCoin && phase === 'idle' ? 'ppSlotBeckon 2s ease-in-out infinite' : undefined),
                                        }}
                                    />
                                </button>
                                {/* the dollar coin, dropped edge-first into the slot */}
                                {coinAnim && (
                                    <div
                                        aria-hidden
                                        className="absolute left-1/2 top-[10px] z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11px] font-black text-[#6d5414]"
                                        style={{
                                            background: 'radial-gradient(circle at 35% 30%, #f6dc82, #d3ab3e 55%, #9c7a22)',
                                            border: '2px solid #8a6d1c',
                                            boxShadow: 'inset 0 0 0 2.5px rgba(255,246,205,0.5), 0 2px 5px rgba(0,0,0,0.4)',
                                            animation: 'ppCoinDrop 0.78s cubic-bezier(0.5, 0, 0.9, 0.4) forwards',
                                        }}
                                    >
                                        $1
                                    </div>
                                )}
                            </div>
                            {coin.enabled && (
                                <span className="mt-1.5 text-center text-[10px] font-bold tracking-[0.12em]" style={ETCHED}>
                                    {`$${coin.cost} ${t('payphone.perCall', 'PER CALL')}`}
                                </span>
                            )}
                            {/* coin return flap at the column's foot */}
                            <div className="mt-auto w-full rounded-[10px] p-2" style={RECESS}>
                                <div
                                    className="h-[22px] w-full rounded-[5px]"
                                    style={{
                                        background: 'linear-gradient(180deg, #131416 0%, #202124 55%, #0b0c0d 100%)',
                                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.35)',
                                    }}
                                />
                            </div>
                        </div>

                    </div>

                    {/* Lower door: the taped notes, stuck where a passerby would leave them */}
                    <div className="mt-4">
                        <TapedNote tilt={-2}>
                            <span className="block text-center text-[21px] leading-[26px] text-[#2b3a8c]" style={{ fontFamily: HAND }}>
                                {boothScrawl}
                            </span>
                        </TapedNote>
                        <div className="mt-3">
                            <TapedNote tilt={1.5}>
                                {myNumber && (
                                    <button
                                        type="button"
                                        onClick={() => { if (phase === 'idle') setDigits(myNumber.replace(/\D/g, '')); }}
                                        className="block w-full text-left active:opacity-60"
                                    >
                                        <span className="block text-[15px] leading-[16px] text-[#8f3d31]" style={{ fontFamily: HAND }}>{t('payphone.myNumber', 'My number')}</span>
                                        <span className="block text-[20px] leading-[24px] text-[#2b3a8c]" style={{ fontFamily: HAND, WebkitTextStroke: '0.35px #2b3a8c' }}>{formatPhone(myNumber)}</span>
                                    </button>
                                )}
                                {favorites.map(f => (
                                    <button
                                        key={f.phone}
                                        type="button"
                                        onClick={() => { if (phase === 'idle') setDigits(f.phone); }}
                                        className="mt-1.5 block w-full text-left active:opacity-60"
                                    >
                                        <span className="block truncate text-[15px] leading-[16px] text-[#4a3f28]" style={{ fontFamily: HAND }}>{f.name}</span>
                                        <span className="block text-[20px] leading-[24px] text-[#2b3a8c]" style={{ fontFamily: HAND, WebkitTextStroke: '0.35px #2b3a8c' }}>{formatPhone(f.phone)}</span>
                                    </button>
                                ))}
                                {!myNumber && favorites.length === 0 && (
                                    <span className="block text-[15px] italic text-[#8a7a55]" style={{ fontFamily: HAND }}>
                                        {t('payphone.emptyNotepad', 'No numbers scribbled here yet.')}
                                    </span>
                                )}
                            </TapedNote>
                        </div>
                    </div>

                        </div>
                    </div>

                    {/* etched property line across the unit's base */}
                    <div className="mt-4 text-center text-[8.5px] font-semibold uppercase tracking-[0.24em]" style={ETCHED}>
                        {t('payphone.property', 'Property of Badger Telecom · San Andreas')}
                    </div>
                </div>
            </div>
        </div>
    );
}
