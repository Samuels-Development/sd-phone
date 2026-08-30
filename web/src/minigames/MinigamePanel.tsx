import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Volume2, VolumeX, X } from 'lucide-react';

import { t } from '@/i18n';
import { PANEL, SURFACE, appBackground, enterPanel, leavePanel, panelClock, panelEyebrow, panelSub, panelTitle, riseIn } from './panel';
import { isMuted, setMuted, sfx } from './sfx';
import type { MinigameOutcome } from './data';

const URGENT_AT = 10;
const TICK_MS = 250;

function clock(seconds: number): string {
    const whole = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function Pips({ total, left, tone }: { total: number; left: number; tone: string }) {
    if (total <= 0) return null;
    return (
        <div className="flex shrink-0 items-center gap-[5px]">
            {Array.from({ length: total }, (_, i) => (
                <span
                    key={i}
                    className="h-[6px] w-[6px] rounded-full transition-colors duration-200"
                    style={{ backgroundColor: i < left ? tone : 'rgba(255,255,255,0.18)' }}
                />
            ))}
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex min-w-[74px] flex-col items-center gap-1">
            <span className="text-[19px] font-bold tabular-nums leading-none" style={{ color: tone ?? '#fff' }}>{value}</span>
            <span className={`${panelEyebrow} text-white/35`}>{label}</span>
        </div>
    );
}

export function MinigamePanel({
    title, headline, sub, meta, score, seconds, total, left, outcome, outcomeLabel, leaving, onExpire, footer, children,
}: {
    title:         string;
    headline:      string;
    sub?:          string;
    meta?:         ReactNode;
    score?:        { label: string; value: string };
    seconds:       number;
    total:         number;
    left:          number;
    outcome:       MinigameOutcome;
    outcomeLabel?: string;
    leaving:       boolean;
    onExpire:      () => void;
    footer?:       ReactNode;
    children:      ReactNode;
}) {
    const [remaining, setRemaining] = useState(seconds);
    const [shake, setShake] = useState(false);
    const [quiet, setQuiet] = useState(isMuted);
    const expireRef = useRef(onExpire);
    expireRef.current = onExpire;
    const spent = useRef(0);

    useEffect(() => {
        if (outcome) return;
        const startedAt = Date.now();
        const id = window.setInterval(() => {
            const value = Math.max(0, seconds - (Date.now() - startedAt) / 1000);
            setRemaining(value);
            spent.current = seconds - value;
            if (value <= 0) {
                window.clearInterval(id);
                expireRef.current();
            }
        }, TICK_MS);
        return () => window.clearInterval(id);
    }, [seconds, outcome]);

    useEffect(() => {
        if (!outcome) return;
        sfx(outcome === 'win' ? 'win' : 'fail');
        if (outcome === 'lose') {
            setShake(true);
            const id = window.setTimeout(() => setShake(false), 420);
            return () => window.clearTimeout(id);
        }
    }, [outcome]);

    const urgent = !outcome && remaining <= URGENT_AT;
    const tone = outcome === 'win' ? PANEL.win : outcome === 'lose' || urgent ? PANEL.fail : PANEL.accent;
    const won = outcome === 'win';
    const took = Math.max(0, Math.min(seconds, spent.current));

    return (
        <div
            className="dark absolute inset-0 z-[750] flex flex-col font-sf"
            onPointerDown={() => { if (!outcome) sfx('tick'); }}
            style={{
                background: appBackground(),
                ...(leaving ? leavePanel : enterPanel),
                ...(shake ? { animation: 'mg-shake 0.42s cubic-bezier(0.36,0.07,0.19,0.97)' } : {}),
            }}
        >
            <div className="h-[78px] shrink-0" aria-hidden />

            <div className="flex shrink-0 items-center gap-2.5 px-6 pb-3.5" style={riseIn(70)}>
                <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: tone, animation: urgent ? 'mg-urgent 0.9s ease-in-out infinite' : undefined }}
                />
                <span className={`${panelEyebrow} min-w-0 truncate text-white/55`}>{title}</span>
                <span className="flex-1" />
                <Pips total={total} left={left} tone={tone} />
                <span className={panelClock} style={{ color: tone }}>{clock(remaining)}</span>
                <button
                    type="button"
                    onClick={() => {
                        const next = !quiet;
                        setMuted(next);
                        setQuiet(next);
                        if (!next) sfx('tick');
                    }}
                    aria-label={quiet
                        ? t('minigames.soundOn', 'Turn sound on')
                        : t('minigames.soundOff', 'Turn sound off')}
                    aria-pressed={quiet}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition-colors duration-150 active:opacity-60"
                    style={{ color: quiet ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)' }}
                >
                    {quiet
                        ? <VolumeX className="h-[15px] w-[15px]" strokeWidth={2.2} />
                        : <Volume2 className="h-[15px] w-[15px]" strokeWidth={2.2} />}
                </button>
            </div>

            <div className="mx-6 h-[3px] shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: SURFACE.sunken, ...riseIn(70) }}>
                <div
                    className="h-full w-full rounded-full"
                    style={{
                        backgroundColor:    tone,
                        transformOrigin:    'left',
                        animation:          `mg-drain ${seconds}s linear forwards`,
                        animationPlayState: outcome ? 'paused' : 'running',
                    }}
                />
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-center gap-7 px-6 pb-6 pt-6">
                <div className="flex shrink-0 flex-col gap-2 text-center" style={riseIn(130)}>
                    <h2 className={panelTitle}>{headline}</h2>
                    {sub && <p className={panelSub}>{sub}</p>}
                </div>
                {children}
                {meta && <div className="flex shrink-0 justify-center" style={riseIn(240)}>{meta}</div>}
            </div>

            {footer && <div className="shrink-0 px-6 pb-8" style={riseIn(240)}>{footer}</div>}

            {outcome && (
                <div
                    className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-5 px-8"
                    style={{ background: 'rgba(6,9,14,0.94)', animation: 'mg-flood 0.24s ease-out' }}
                >
                    <div
                        className="flex h-[74px] w-[74px] items-center justify-center rounded-full"
                        style={{
                            backgroundColor: won ? `${PANEL.win}1F` : `${PANEL.fail}1F`,
                            boxShadow:       `inset 0 0 0 1.5px ${won ? PANEL.win : PANEL.fail}59`,
                            animation:       'mg-pop 0.36s cubic-bezier(0.34,1.56,0.64,1)',
                        }}
                    >
                        {won
                            ? <Check className="h-[34px] w-[34px]" strokeWidth={2.6} style={{ color: PANEL.win }} />
                            : <X className="h-[34px] w-[34px]" strokeWidth={2.6} style={{ color: PANEL.fail }} />}
                    </div>

                    <div className="flex flex-col items-center gap-1.5 text-center">
                        <span className="text-[28px] font-bold tracking-tight text-white">
                            {won ? t('minigames.accessGranted', 'Access granted') : t('minigames.accessDenied', 'Access denied')}
                        </span>
                        {outcomeLabel && <span className={panelSub}>{outcomeLabel}</span>}
                    </div>

                    <div
                        className="flex items-start justify-center gap-1 rounded-[16px] px-4 py-3"
                        style={{ backgroundColor: 'rgba(255,255,255,0.05)', animation: 'mg-rise 0.4s cubic-bezier(0.32,0.72,0,1) 160ms both' }}
                    >
                        <Stat label={t('minigames.statTime', 'Time')} value={`${took.toFixed(1)}s`} />
                        {score && <Stat label={score.label} value={score.value} />}
                        <Stat
                            label={t('minigames.statResult', 'Result')}
                            value={won ? t('minigames.statClean', 'Clean') : t('minigames.statBurned', 'Burned')}
                            tone={won ? PANEL.win : PANEL.fail}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
