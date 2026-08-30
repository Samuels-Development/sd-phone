import { useEffect, useMemo, useState } from 'react';

import { Keypad } from '@/ui/Keypad';
import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type DecodeOptions, type DecodeRow, type GameProps, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;

const GLYPHS = ['▲', '●', '■', '◆', '✦', '➕', '⬟', '⬢'];

const DEFAULTS: DecodeOptions = { symbols: 4, digits: 4, preview: 4, time: 25 };

function glyphOf(index: number): string {
    return GLYPHS[(index - 1) % GLYPHS.length] ?? '?';
}

export function Decode({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const key  = useMemo(() => start.puzzle?.key ?? [], [start.puzzle]);
    const code = useMemo(() => start.puzzle?.code ?? [], [start.puzzle]);

    const [showKey, setShowKey] = useState(true);
    const [entry, setEntry]     = useState<number[]>([]);
    const [fixes, setFixes]     = useState(0);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        sfx('reveal');
        const id = window.setTimeout(() => setShowKey(false), options.preview * 1000);
        return () => window.clearTimeout(id);
    }, [options.preview]);

    function finish(result: MinigameResult<DecodeRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function submit(digits: number[]) {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<DecodeRow>(digits);
        setBusy(false);
        if (result) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<DecodeRow>();
        finish(result ?? { done: true, win: false });
    }

    function press(digit: string) {
        if (busy || outcome || showKey || entry.length >= options.digits) return;
        const next = [...entry, Number(digit)];
        setEntry(next);
        if (next.length === options.digits) {
            sfx('lock');
            void submit(next);
        }
    }

    return (
        <MinigamePanel
            title={t('minigames.decode', 'Decode')}
            headline={showKey
                ? t('minigames.learnKey', 'Learn the key')
                : t('minigames.typeTheCode', 'Type the code')}
            sub={showKey
                ? t('minigames.keyHidesSoon', 'It disappears in a moment')
                : t('minigames.keyHidden', 'From memory now')}
            score={{ label: t('minigames.statFixes', 'Fixes'), value: String(fixes) }}
            seconds={options.time}
            total={options.digits}
            left={options.digits - entry.length}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            footer={
                <Keypad
                    variant="digits"
                    onPress={press}
                    onDelete={() => {
                        sfx('deny');
                        setFixes(prev => prev + 1);
                        setEntry(prev => prev.slice(0, -1));
                    }}
                    canDelete={entry.length > 0}
                />
            }
        >
            <div className="flex flex-col gap-5" style={boardIn(200)}>
                <div className="flex flex-wrap justify-center gap-2">
                    {key.map(pair => (
                        <span
                            key={pair.glyph}
                            className="flex h-[52px] w-[52px] flex-col items-center justify-center gap-0.5 rounded-[14px] transition-opacity duration-300"
                            style={{ ...tileFace, opacity: showKey ? 1 : 0.18 }}
                        >
                            <span className="text-[17px] leading-none text-white">{glyphOf(pair.glyph)}</span>
                            <span className="text-[13px] font-bold leading-none" style={{ color: PANEL.accent }}>
                                {showKey ? pair.digit : '?'}
                            </span>
                        </span>
                    ))}
                </div>

                <div className="flex justify-center gap-2">
                    {code.map((glyph, i) => {
                        const filled = entry[i] !== undefined;
                        return (
                            <span
                                key={i}
                                className="flex h-[54px] w-[46px] flex-col items-center justify-center gap-1 rounded-[13px] transition-all duration-150"
                                style={filled
                                    ? { backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }
                                    : { backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                            >
                                <span className="text-[19px] leading-none text-white">{glyphOf(glyph)}</span>
                                <span className="text-[13px] font-bold leading-none text-white/80">
                                    {filled ? entry[i] : ''}
                                </span>
                            </span>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
