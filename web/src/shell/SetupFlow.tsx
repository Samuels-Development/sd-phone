import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    Check, ChevronLeft, ChevronRight, ChevronUp, Globe, Image as ImageIcon,
    ListChecks, Lock, Palette, ScanFace,
} from 'lucide-react';

import { Keypad } from '@/ui/Keypad';
import { PHOTO_SOURCES } from '@/apps/photos/data';
import { useTheme } from '@/stores/themeStore';
import type { Theme } from '@/stores/themeStore';
import { resolveWallpaper } from './wallpapers';
import { AlertDialog } from '@/ui/AlertDialog';
import logoUrl from '@/assets/logo.png';
import { t } from '@/i18n';
import { SUPPORTED_LOCALES, useLocaleStore } from '@/stores/localeStore';
import type { LocaleOption } from '@/stores/localeStore';

export interface SetupResult {
    language:    string;
    pin:         string | null;
    faceUnlock:  boolean;
    theme:       Theme;
    wallpaper:   string;
}

interface Props {
    onDone: (result: SetupResult) => void;
    onHelloChange?: (isHello: boolean) => void;
}

type Stage = 'language' | 'pin' | 'face' | 'theme' | 'wallpaper' | 'overview' | 'done';

const STAGE_ORDER: Stage[] = ['language', 'pin', 'face', 'theme', 'wallpaper', 'overview', 'done'];

export function SetupFlow({ onDone, onHelloChange }: Props) {
    const { theme, setTheme, wallpaper, setWallpaper } = useTheme('theme', 'setTheme', 'wallpaper', 'setWallpaper');

    const [stage,     setStage]     = useState<Stage>('language');
    const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
    const [language,   setLanguage]   = useState<string>('');
    const [pin,        setPin]        = useState<string | null>(null);
    const [faceUnlock, setFaceUnlock] = useState<boolean>(false);

    const [showHello,    setShowHello]    = useState(true);
    const [helloLifting, setHelloLifting] = useState(false);
    function beginHelloLift() {
        if (helloLifting) return;
        setHelloLifting(true);
        window.setTimeout(() => { setShowHello(false); setHelloLifting(false); }, 540);
    }

    function go(newStage: Stage, dir: 'forward' | 'backward') {
        if (newStage === stage) return;
        setDirection(dir);
        setStage(newStage);
    }

    function next() {
        const i = STAGE_ORDER.indexOf(stage);
        if (i === STAGE_ORDER.length - 1) {
            onDone({ language, pin, faceUnlock, theme, wallpaper });
            return;
        }
        go(STAGE_ORDER[i + 1], 'forward');
    }

    function back() {
        const i = STAGE_ORDER.indexOf(stage);
        if (i <= 0) return;
        go(STAGE_ORDER[i - 1], 'backward');
    }

    const canGoBack = STAGE_ORDER.indexOf(stage) > 0;

    const onHelloChangeRef = useRef(onHelloChange);
    onHelloChangeRef.current = onHelloChange;
    useEffect(() => { onHelloChangeRef.current?.(showHello); }, [showHello]);
    useEffect(() => () => { onHelloChangeRef.current?.(false); }, []);

    return (
        <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-white dark:bg-base text-black dark:text-white">
            <svg width="0" height="0" aria-hidden className="absolute">
                <defs>
                    <linearGradient id="setup-icon-grad" gradientUnits="userSpaceOnUse" x1="2" y1="1" x2="22" y2="23">
                        <stop offset="0%"   stopColor="#F6DC55" />
                        <stop offset="38%"  stopColor="#86D98F" />
                        <stop offset="68%"  stopColor="#54CFC9" />
                        <stop offset="100%" stopColor="#48C2EE" />
                    </linearGradient>
                </defs>
            </svg>

            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="h-10 shrink-0 px-3">
                {canGoBack && stage !== 'done' && (
                    <button
                        type="button"
                        onClick={back}
                        aria-label={t('setup.back', 'Back')}
                        className="-ml-1 flex h-9 w-9 items-center justify-center active:opacity-50"
                    >
                        <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.2} />
                    </button>
                )}
            </div>

            <div
                key={stage}
                className={`flex flex-1 flex-col min-h-0 ${stage !== 'language' ? 'pt-8' : ''}`}
                style={{
                    animation: stage === 'done'
                        ? 'setup-done-in    0.5s  cubic-bezier(0.32,0.72,0,1) forwards'
                        : direction === 'forward'
                        ? 'ios-push         0.34s cubic-bezier(0.32,0.72,0,1) forwards'
                        : 'ios-push-reverse 0.34s cubic-bezier(0.32,0.72,0,1) forwards',
                    willChange: 'transform',
                }}
            >
                {stage === 'language' && (
                    <LanguageStage
                        selected={language}
                        onSelect={(opt) => { setLanguage(opt.name); useLocaleStore.getState().setLocale(opt.code); next(); }}
                    />
                )}
                {stage === 'pin' && (
                    <PinStage
                        onSet={(value) => { setPin(value); next(); }}
                        onSkip={() => { setPin(null); setFaceUnlock(false); next(); }}
                    />
                )}
                {stage === 'face' && (
                    <FaceStage
                        hasPin={pin !== null}
                        onEnable={() => { setFaceUnlock(true); next(); }}
                        onNeedPin={() => go('pin', 'backward')}
                        onSkip={() => { setFaceUnlock(false); next(); }}
                    />
                )}
                {stage === 'theme' && (
                    <ThemeStage
                        selected={theme}
                        onSelect={setTheme}
                        onContinue={next}
                    />
                )}
                {stage === 'wallpaper' && (
                    <WallpaperStage
                        selected={wallpaper}
                        onSelect={setWallpaper}
                        onContinue={next}
                    />
                )}
                {stage === 'overview' && (
                    <OverviewStage
                        language={language}
                        pin={pin}
                        faceUnlock={faceUnlock}
                        theme={theme}
                        wallpaper={wallpaper}
                        onContinue={next}
                    />
                )}
                {stage === 'done' && (
                    <DoneStage onFinish={() => onDone({ language, pin, faceUnlock, theme, wallpaper })} />
                )}
            </div>

            {showHello && (
                <div
                    className={`absolute inset-0 z-20 flex flex-col overflow-hidden ${helloLifting ? 'animate-hello-lift' : ''}`}
                    style={{ background: theme === 'dark' ? HELLO_BG_DARK : HELLO_BG_LIGHT, willChange: 'transform, opacity' }}
                >
                    <HelloAurora />
                    <div className="h-[54px] shrink-0" aria-hidden />
                    <div className="h-10 shrink-0" aria-hidden />
                    <HelloStage onContinue={beginHelloLift} frozen={helloLifting} />
                </div>
            )}
        </div>
    );
}


function BrandLogo({ size = 150 }: { size?: number }) {
    return (
        <img
            src={logoUrl}
            alt={t('setup.logoAlt', 'Logo')}
            draggable={false}
            style={{
                height: size,
                width: 'auto',
                filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.55)) drop-shadow(0 0 2px rgba(0,0,0,0.4)) drop-shadow(0 3px 8px rgba(0,0,0,0.28))',
            }}
            className="object-contain"
        />
    );
}


const HELLO_GREETINGS = [
    'Hello', 'Bonjour', 'Hola', 'Ciao', 'Olá', 'Hallo', 'Hej', 'Cześć',
    'Merhaba', 'Γεια σου', 'Привет', 'Xin chào',
    'こんにちは', '你好', '안녕하세요', 'مرحبا', 'नमस्ते', 'שלום',
];
const HELLO_RTL  = new Set(['مرحبا', 'שלום']);
const HELLO_FONT = '"Great Vibes", "Snell Roundhand", "Segoe Script", cursive';

const HELLO_BG_LIGHT =
    'radial-gradient(70% 45% at 50% 38%, rgba(150,170,255,0.07), transparent 70%),' +
    'radial-gradient(140% 100% at 50% 40%, #ffffff 0%, #eef0f6 50%, #e3e6ef 100%)';
const HELLO_BG_DARK =
    'radial-gradient(70% 45% at 50% 38%, rgba(150,170,255,0.13), transparent 70%),' +
    'radial-gradient(140% 100% at 50% 40%, #242429 0%, #141417 52%, #000000 100%)';

function HelloStage({ onContinue, frozen = false }: { onContinue: () => void; frozen?: boolean }) {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        if (frozen) return;
        const id = window.setInterval(() => setIdx(i => (i + 1) % HELLO_GREETINGS.length), 2500);
        return () => window.clearInterval(id);
    }, [frozen]);

    const startY = useRef<number | null>(null);
    const fired  = useRef(false);
    function down(e: ReactPointerEvent) { if (frozen) return; startY.current = e.clientY; fired.current = false; }
    function move(e: ReactPointerEvent) {
        if (frozen) return;
        if (startY.current != null && !fired.current && startY.current - e.clientY > 44) {
            fired.current = true; onContinue();
        }
    }
    function up(e: ReactPointerEvent) {
        if (frozen) return;
        if (startY.current != null && !fired.current && Math.abs(e.clientY - startY.current) < 10) onContinue();
        startY.current = null;
    }

    const g = HELLO_GREETINGS[idx];
    return (
        <div
            className="relative z-10 flex flex-1 touch-none select-none flex-col"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { startY.current = null; }}
        >
            <div className="relative flex flex-1 items-center justify-center px-6">
                <div
                    className="animate-hello-halo pointer-events-none absolute h-[260px] w-[260px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.55), transparent 65%)' }}
                />
                <span
                    key={idx}
                    dir={HELLO_RTL.has(g) ? 'rtl' : 'ltr'}
                    className="hello-word relative block text-center leading-[1.15]"
                    style={{ fontFamily: HELLO_FONT, fontSize: 80 }}
                >
                    {g}
                </span>
            </div>

            <div className="relative flex shrink-0 flex-col items-center gap-1.5 pb-10">
                <ChevronUp className="animate-hello-arrow h-[26px] w-[26px] text-ios-blue" strokeWidth={2.6} />
                <span className="animate-hello-hint text-[17px] font-semibold tracking-wide text-ios-gray">
                    {t('setup.swipeUpToSetUp', 'Swipe up to set up')}
                </span>
            </div>
        </div>
    );
}

function HelloAurora() {
    return (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div
                className="absolute"
                style={{ top: '-12%', left: '-12%', right: '-12%', bottom: '-12%', filter: 'blur(52px)' }}
            >
                <div
                    className="hello-orb"
                    style={{
                        top: '2%', left: '-6%', width: '70%', height: '46%',
                        background: 'radial-gradient(circle at 50% 50%, rgba(118,150,255,0.62), transparent 64%)',
                        animation: 'hello-aurora-a 22s ease-in-out infinite',
                    }}
                />
                <div
                    className="hello-orb"
                    style={{
                        top: '40%', right: '-8%', width: '72%', height: '50%',
                        background: 'radial-gradient(circle at 50% 50%, rgba(178,134,255,0.58), transparent 64%)',
                        animation: 'hello-aurora-b 26s ease-in-out infinite',
                    }}
                />
                <div
                    className="hello-orb"
                    style={{
                        top: '24%', left: '24%', width: '60%', height: '42%',
                        background: 'radial-gradient(circle at 50% 50%, rgba(120,212,236,0.5), transparent 66%)',
                        animation: 'hello-aurora-c 20s ease-in-out infinite',
                    }}
                />
                <div
                    className="hello-orb"
                    style={{
                        bottom: '-4%', left: '8%', width: '64%', height: '44%',
                        background: 'radial-gradient(circle at 50% 50%, rgba(255,150,196,0.42), transparent 66%)',
                        animation: 'hello-aurora-a 24s ease-in-out infinite reverse',
                    }}
                />
            </div>
        </div>
    );
}


function DoneStage({ onFinish }: { onFinish: () => void }) {
    const [leaving, setLeaving] = useState(false);
    function finish() {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(onFinish, 330);
    }
    return (
        <div className={`flex flex-1 flex-col items-center px-6 ${leaving ? 'animate-done-out' : ''}`}>
            <div className="flex flex-1 flex-col items-center justify-center">
                <CheckBadge />
                <h1 className="animate-done-rise mt-8 text-[37px] font-bold tracking-tight text-black dark:text-white" style={{ animationDelay: '0.12s' }}>
                    {t('setup.allSet', 'You’re all set')}
                </h1>
                <p className="animate-done-rise mt-2.5 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray" style={{ animationDelay: '0.2s' }}>
                    {t('setup.readyWelcome', 'Your phone is ready to go. Welcome aboard.')}
                </p>
            </div>

            <div className="animate-done-rise w-full pb-16" style={{ animationDelay: '0.3s' }}>
                <button
                    type="button"
                    onClick={finish}
                    className="w-full rounded-[18px] bg-ios-blue py-[17px] text-[19px] font-semibold text-white shadow-[0_6px_18px_rgba(10,132,255,0.3)] transition-transform active:scale-[0.98] active:opacity-90"
                >
                    {t('setup.getStarted', 'Get Started')}
                </button>
            </div>
        </div>
    );
}

function CheckBadge() {
    const sparkles = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const dist = 56 + (i % 2) * 13;
        return {
            dx: Math.round(Math.cos(a) * dist),
            dy: Math.round(Math.sin(a) * dist),
            color: i % 2 ? '#54CFC9' : '#F6DC55',
            delay: 0.16 + (i % 3) * 0.045,
        };
    });
    return (
        <div className="relative">
            <div
                className="pointer-events-none absolute -inset-8 -z-10 rounded-full"
                style={{ background: 'radial-gradient(closest-side, rgba(84,207,201,0.30), transparent)' }}
            />

            <span className="animate-done-ripple pointer-events-none absolute left-1/2 top-1/2 h-[106px] w-[106px] rounded-full border-2 border-[#54CFC9]" />

            {sparkles.map((s, i) => (
                <span
                    key={i}
                    className="animate-done-sparkle pointer-events-none absolute left-1/2 top-1/2 h-[7px] w-[7px] rounded-full"
                    style={{ background: s.color, animationDelay: `${s.delay}s`, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` }}
                />
            ))}

            <svg width={106} height={106} viewBox="0 0 106 106" aria-hidden className="relative" style={{ overflow: 'visible' }}>
                <defs>
                    <linearGradient id="done-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="#F6DC55" />
                        <stop offset="38%"  stopColor="#86D98F" />
                        <stop offset="68%"  stopColor="#54CFC9" />
                        <stop offset="100%" stopColor="#48C2EE" />
                    </linearGradient>
                </defs>
                <circle cx="53" cy="53" r="50" fill="url(#done-brand)" className="animate-done-pop" style={{ transformOrigin: 'center' }} />
                <path
                    d="M31 54 L46 70 L77 38"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="7.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-done-check"
                />
            </svg>
        </div>
    );
}


function LanguageStage({
    selected, onSelect,
}: {
    selected: string;
    onSelect: (opt: LocaleOption) => void;
}) {
    return (
        <div className="flex flex-1 flex-col min-h-0 px-5">
            <div className="flex shrink-0 flex-col items-center pb-1 pt-1">
                <BrandLogo size={160} />
            </div>

            <div className="mt-6 flex shrink-0 items-center justify-center gap-2.5 pb-2">
                <Globe className="h-[24px] w-[24px] text-ios-gray" strokeWidth={2.2} />
                <span className="text-[24px] font-semibold text-ios-gray">
                    {t('setup.selectYourLanguage', 'Select your language')}
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-4">
                <div className="flex flex-col gap-2">
                    {SUPPORTED_LOCALES.map(opt => {
                        const isSelected = opt.name === selected;
                        return (
                            <button
                                key={opt.code}
                                type="button"
                                onClick={() => onSelect(opt)}
                                className={[
                                    'flex w-full items-center justify-between rounded-[14px] px-5 py-[18px] text-left transition-colors active:opacity-60',
                                    isSelected
                                        ? 'bg-black/[0.12] dark:bg-white/[0.14] text-black dark:text-white'
                                        : 'bg-black/[0.05] hover:bg-black/[0.10] dark:bg-white/[0.06] dark:hover:bg-white/[0.11] text-black dark:text-white',
                                ].join(' ')}
                            >
                                <span className="truncate text-[19px] font-medium">{opt.name}</span>
                                <ChevronRight
                                    className="h-[19px] w-[19px] shrink-0 text-black dark:text-white"
                                    strokeWidth={2.5}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}


const PIN_LENGTH = 4;

function PinStage({
    onSet, onSkip,
}: {
    onSet: (value: string) => void;
    onSkip: () => void;
}) {
    const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
    const [phaseDir, setPhaseDir] = useState<'forward' | 'back' | null>(null);
    const [first, setFirst] = useState('');
    const [pin,   setPin]   = useState('');
    const [error, setError] = useState(false);

    function append(digit: string) {
        if (pin.length >= PIN_LENGTH) return;
        const next = pin + digit;
        setPin(next);
        if (next.length !== PIN_LENGTH) return;

        if (phase === 'enter') {
            window.setTimeout(() => { setFirst(next); setPin(''); setPhaseDir('forward'); setPhase('confirm'); }, 200);
        } else if (next === first) {
            window.setTimeout(() => onSet(next), 200);
        } else {
            window.setTimeout(() => {
                setError(true);
                window.setTimeout(() => { setError(false); setPin(''); }, 600);
            }, 120);
        }
    }

    function backspace() {
        setPin(p => p.slice(0, -1));
    }

    const confirming = phase === 'confirm';

    return (
        <div className="flex flex-1 flex-col px-5">
            <div className="flex flex-col items-center pt-2">
                <Lock className="setup-icon-grad h-[68px] w-[68px]" strokeWidth={2.4} />
            </div>

            <div
                key={phase}
                className={phaseDir === 'forward' ? 'animate-pin-phase' : phaseDir === 'back' ? 'animate-pin-phase-back' : ''}
            >
                <div className="flex flex-col items-center">
                    <div className="mt-4 text-[37px] font-bold tracking-tight text-black dark:text-white">
                        {confirming ? t('setup.confirmYourPin', 'Confirm your pin') : t('setup.setAPin', 'Set a pin')}
                    </div>
                    <p className="mt-2.5 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray">
                        {error
                            ? t('setup.pinsDidntMatch', 'Pins didn’t match. Try again.')
                            : confirming
                                ? t('setup.reenterPin', 'Re-enter your pin to confirm it.')
                                : t('setup.pinDescription', 'A pin code is used to secure your device and is required to unlock it.')}
                    </p>
                </div>

                <div className="mt-8 flex flex-col items-center gap-5">
                    <div className={`flex items-center gap-7 ${error ? 'animate-pin-shake' : ''}`}>
                        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                            <div
                                key={i}
                                className="h-[22px] w-[22px] rounded-full border-2"
                                style={{
                                    borderColor: error ? '#ff3b30' : '#9d9da3',
                                    background: i < pin.length ? (error ? '#ff3b30' : '#1c1c1e') : 'transparent',
                                    transition: 'background 0.12s ease',
                                }}
                            />
                        ))}
                    </div>
                    {!confirming ? (
                        <button
                            type="button"
                            onClick={onSkip}
                            className="text-[19px] font-semibold text-ios-blue active:opacity-60"
                        >
                            {t('setup.skip', 'Skip')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => { setFirst(''); setPin(''); setError(false); setPhaseDir('back'); setPhase('enter'); }}
                            className="text-[19px] font-semibold text-ios-blue active:opacity-60"
                        >
                            {t('setup.startOver', 'Start over')}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1" />

            <Keypad variant="pin" onPress={append} onDelete={backspace} canDelete={pin.length > 0} className="pb-16 pt-2" />
        </div>
    );
}


function FaceStage({
    hasPin, onEnable, onNeedPin, onSkip,
}: {
    hasPin:    boolean;
    onEnable:  () => void;
    onNeedPin: () => void;
    onSkip:    () => void;
}) {
    return (
        <div className="flex flex-1 flex-col px-6">
            <div className="flex flex-col items-center pt-2">
                <ScanFace className="setup-icon-grad h-[68px] w-[68px]" strokeWidth={2.1} />
                <div className="mt-4 text-[37px] font-bold tracking-tight text-black dark:text-white">
                    {t('setup.faceUnlock', 'Face Unlock')}
                </div>
                <p className="mt-2.5 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray">
                    {t('setup.faceUnlockDescription', 'Set up Face Unlock to easily open your phone without entering your pin code.')}
                </p>
                <p className="mt-3 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray">
                    {t('setup.faceUnlockObstructed', 'Face Unlock only works when your face is not obstructed.')}
                </p>
                {!hasPin && (
                    <p className="mt-3 max-w-[300px] text-center text-[15px] leading-snug text-ios-orange">
                        {t('setup.faceUnlockNeedsPin', 'Face Unlock requires a passcode as a backup. You’ll be asked to set one first.')}
                    </p>
                )}
            </div>

            <div className="flex-1" />

            <div className="flex flex-col items-center gap-3 pb-16">
                <button
                    type="button"
                    onClick={hasPin ? onEnable : onNeedPin}
                    className="w-full rounded-[18px] bg-ios-blue py-[17px] text-[19px] font-semibold text-white shadow-[0_6px_18px_rgba(10,132,255,0.3)] transition-transform active:scale-[0.98] active:opacity-90"
                >
                    {hasPin ? t('setup.enableFaceUnlock', 'Enable Face Unlock') : t('setup.setPasscodeFirst', 'Set Passcode First')}
                </button>
                <button
                    type="button"
                    onClick={onSkip}
                    className="py-2.5 text-[18px] font-semibold text-ios-blue active:opacity-60"
                >
                    {t('setup.skip', 'Skip')}
                </button>
            </div>
        </div>
    );
}


function ThemeStage({
    selected, onSelect, onContinue,
}: {
    selected:   Theme;
    onSelect:   (t: Theme) => void;
    onContinue: () => void;
}) {
    return (
        <div className="flex flex-1 flex-col px-6">
            <div className="flex flex-col items-center pt-2">
                <ThemeCircle />
                <div className="mt-4 text-[37px] font-bold tracking-tight text-black dark:text-white">
                    {t('setup.theme', 'Theme')}
                </div>
                <p className="mt-2.5 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray">
                    {t('setup.themeDescription', 'Select a dark or light theme for your device')}
                </p>
            </div>

            <div className="mt-8 -mx-2 flex items-center justify-center gap-3">
                <ThemeCard
                    label={t('setup.light', 'Light')}
                    selected={selected === 'light'}
                    onSelect={() => onSelect('light')}
                >
                    <PhonePreview dark={false} />
                </ThemeCard>
                <ThemeCard
                    label={t('setup.dark', 'Dark')}
                    selected={selected === 'dark'}
                    onSelect={() => onSelect('dark')}
                >
                    <PhonePreview dark />
                </ThemeCard>
            </div>

            <div className="flex-1" />

            <div className="pb-16">
                <button
                    type="button"
                    onClick={onContinue}
                    className="w-full rounded-[18px] bg-ios-blue py-[17px] text-[19px] font-semibold text-white shadow-[0_6px_18px_rgba(10,132,255,0.3)] transition-transform active:scale-[0.98] active:opacity-90"
                >
                    {t('setup.continue', 'Continue')}
                </button>
            </div>
        </div>
    );
}

function ThemeCircle() {
    return (
        <svg width={68} height={68} viewBox="0 0 62 62" aria-hidden>
            <defs>
                <linearGradient id="theme-light" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="#F5F5F7" />
                    <stop offset="100%" stopColor="#D8D8DC" />
                </linearGradient>
                <linearGradient id="theme-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%"   stopColor="#F6DC55" />
                    <stop offset="38%"  stopColor="#86D98F" />
                    <stop offset="68%"  stopColor="#54CFC9" />
                    <stop offset="100%" stopColor="#48C2EE" />
                </linearGradient>
            </defs>
            <circle cx="31" cy="31" r="26" fill="url(#theme-light)" stroke="url(#theme-brand)" strokeWidth="2.2" />
            <path d="M31 5 a26 26 0 0 1 0 52 z" fill="url(#theme-brand)" />
        </svg>
    );
}

function ThemeCard({
    label, selected, onSelect, children,
}: {
    label:     string;
    selected:  boolean;
    onSelect:  () => void;
    children:  React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="flex flex-col items-center gap-2 active:opacity-70"
        >
            {children}
            <span className="text-[16px] font-semibold text-black dark:text-white">{label}</span>
            <div className={[
                'flex h-[24px] w-[24px] items-center justify-center rounded-full border-2 transition-colors',
                selected
                    ? 'border-ios-blue bg-ios-blue'
                    : 'border-[#C6C6C8] dark:border-control bg-transparent',
            ].join(' ')}>
                {selected && (
                    <svg viewBox="0 0 14 14" className="h-[11px] w-[11px] text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 7 6 11 12 3" />
                    </svg>
                )}
            </div>
        </button>
    );
}

function PhonePreview({ dark }: { dark: boolean }) {
    const screenBg = dark
        ? 'linear-gradient(175deg, #1a0f40 0%, #241657 32%, #2E1C72 62%, #160b38 100%)'
        : 'linear-gradient(175deg, #CBE0FB 0%, #A8CAF1 35%, #86B6E7 65%, #64A2DC 100%)';
    const ink  = dark ? '#FFFFFF' : '#1C1C1E';
    const card = dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.55)';
    const dot  = dark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.85)';
    const line = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.20)';

    return (
        <div
            className="rounded-[28px] bg-gradient-to-b from-[#2c2c30] to-[#0e0e10] p-[3px] shadow-[0_12px_26px_rgba(0,0,0,0.22)]"
            style={{ width: 145, height: 234 }}
        >
            <div className="relative h-full w-full overflow-hidden rounded-[25px]" style={{ background: screenBg }}>
                <div className="absolute left-1/2 top-[9px] h-[9px] w-[34px] -translate-x-1/2 rounded-full bg-black" />

                <div className="mt-[38px] text-center leading-none" style={{ color: ink }}>
                    <div className="text-[27px] font-semibold tracking-tight">11:42</div>
                    <div className="mt-1 text-[9px] font-medium opacity-70">Saturday, June 21</div>
                </div>

                <div className="absolute inset-x-[10px] bottom-[12px] flex flex-col gap-2">
                    {[0, 1].map(i => (
                        <div key={i} className="flex items-center gap-2 rounded-[10px] px-2 py-[7px]" style={{ background: card }}>
                            <div className="h-[15px] w-[15px] shrink-0 rounded-full" style={{ background: dot }} />
                            <div className="min-w-0 flex-1">
                                <div className="h-[3px] w-[55%] rounded-full" style={{ background: line }} />
                                <div className="mt-[5px] h-[3px] w-[88%] rounded-full" style={{ background: line, opacity: 0.65 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}


function WallpaperStage({
    selected, onSelect, onContinue,
}: {
    selected:   string;
    onSelect:   (src: string) => void;
    onContinue: () => void;
}) {
    return (
        <div className="flex flex-1 flex-col min-h-0 px-6">
            <div className="flex shrink-0 flex-col items-center pt-2">
                <ImageIcon className="setup-icon-grad h-[68px] w-[68px]" strokeWidth={2.0} />
                <div className="mt-4 text-[37px] font-bold tracking-tight text-black dark:text-white">
                    {t('setup.wallpaper', 'Wallpaper')}
                </div>
                <p className="mt-2.5 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray">
                    {t('setup.wallpaperDescription', 'Choose a wallpaper for your lock and home screen')}
                </p>
            </div>

            <div className="mt-5 flex-1 min-h-0 overflow-y-auto no-scrollbar pb-2">
                <div className="grid grid-cols-2 gap-3">
                    {PHOTO_SOURCES.map((src, i) => {
                        const isSelected = resolveWallpaper(selected) === src;
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => onSelect(src)}
                                className="relative overflow-hidden rounded-[16px] active:opacity-80"
                            >
                                <img
                                    src={src}
                                    className="block aspect-[3/4] w-full object-cover"
                                    alt={t('setup.wallpaperNumber', 'Wallpaper {n}', { n: i + 1 })}
                                    draggable={false}
                                />
                                <div
                                    className={`pointer-events-none absolute inset-0 rounded-[16px] ${
                                        isSelected ? 'border-[3px] border-ios-blue' : 'border border-black/10 dark:border-white/10'
                                    }`}
                                />
                                {isSelected && (
                                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ios-blue shadow">
                                        <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="shrink-0 pb-16 pt-3">
                <button
                    type="button"
                    onClick={onContinue}
                    className="w-full rounded-[18px] bg-ios-blue py-[17px] text-[19px] font-semibold text-white shadow-[0_6px_18px_rgba(10,132,255,0.3)] transition-transform active:scale-[0.98] active:opacity-90"
                >
                    {t('setup.continue', 'Continue')}
                </button>
            </div>
        </div>
    );
}


function OverviewStage({
    language, pin, faceUnlock, theme, wallpaper, onContinue,
}: {
    language:   string;
    pin:        string | null;
    faceUnlock: boolean;
    theme:      Theme;
    wallpaper:  string;
    onContinue: () => void;
}) {
    const [confirm, setConfirm] = useState(false);
    const wallpaperSrc = resolveWallpaper(wallpaper);
    return (
        <div className="flex flex-1 flex-col min-h-0 px-6">
            <div className="flex shrink-0 flex-col items-center pt-2">
                <ListChecks className="setup-icon-grad h-[68px] w-[68px]" strokeWidth={2.0} />
                <div className="mt-4 text-[37px] font-bold tracking-tight text-black dark:text-white">
                    {t('setup.review', 'Review')}
                </div>
                <p className="mt-2.5 max-w-[300px] text-center text-[18px] leading-snug text-ios-gray">
                    {t('setup.reviewDescription', 'Here’s everything you set up. Go back to change anything.')}
                </p>
            </div>

            <div className="mt-7 flex-1 min-h-0 overflow-y-auto no-scrollbar">
                <div className="overflow-hidden rounded-[16px] bg-black/[0.05] dark:bg-white/[0.06]">
                    <OverviewRow icon={Globe}     label={t('setup.language', 'Language')}    value={language || 'English'} />
                    <OverviewRow icon={Lock}      label={t('setup.passcode', 'Passcode')}    value={pin ? t('setup.on', 'On') : t('setup.off', 'Off')} />
                    <OverviewRow icon={ScanFace}  label={t('setup.faceUnlock', 'Face Unlock')} value={faceUnlock ? t('setup.on', 'On') : t('setup.off', 'Off')} />
                    <OverviewRow icon={Palette}   label={t('setup.theme', 'Theme')}       value={theme === 'dark' ? t('setup.dark', 'Dark') : t('setup.light', 'Light')} />
                    <OverviewRow icon={ImageIcon} label={t('setup.wallpaper', 'Wallpaper')}   thumb={wallpaperSrc} last />
                </div>
            </div>

            <div className="shrink-0 pb-16 pt-3">
                <button
                    type="button"
                    onClick={() => setConfirm(true)}
                    className="w-full rounded-[18px] bg-ios-blue py-[17px] text-[19px] font-semibold text-white shadow-[0_6px_18px_rgba(10,132,255,0.3)] transition-transform active:scale-[0.98] active:opacity-90"
                >
                    {t('setup.continue', 'Continue')}
                </button>
            </div>

            {confirm && (
                <AlertDialog
                    title={t('setup.allSetQuestion', 'All set?')}
                    message={t('setup.allSetMessage', 'You can change any of these later in Settings. Ready to finish setting up your phone?')}
                    confirmLabel={t('setup.finish', 'Finish')}
                    cancelLabel={t('setup.goBack', 'Go Back')}
                    onCancel={() => setConfirm(false)}
                    onConfirm={() => { setConfirm(false); onContinue(); }}
                />
            )}
        </div>
    );
}

function OverviewRow({
    icon: Icon, label, value, thumb, last,
}: {
    icon:   typeof Globe;
    label:  string;
    value?: string;
    thumb?: string;
    last?:  boolean;
}) {
    return (
        <div className={`flex h-[58px] items-center gap-3.5 px-4 ${last ? '' : 'border-b border-black/[0.07] dark:border-white/10'}`}>
            <Icon className="setup-icon-grad h-[26px] w-[26px] shrink-0" strokeWidth={2.1} />
            <span className="flex-1 text-[18px] font-medium">{label}</span>
            {thumb
                ? <img src={thumb} alt="" draggable={false} className="h-[44px] w-[33px] rounded-[6px] object-cover ring-1 ring-black/10 dark:ring-white/15" />
                : <span className="text-[18px] font-medium tabular-nums text-ios-gray">{value}</span>}
        </div>
    );
}
