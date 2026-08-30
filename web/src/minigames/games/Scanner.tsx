import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardIn, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type ScannerOptions, type ScannerRow } from '../data';

const SETTLE_MS = 1900;

const DEFAULTS: ScannerOptions = { bars: 7, options: 6, attempts: 2, time: 30 };

function Bars({ heights, tall, tone }: { heights: number[]; tall: number; tone: string }) {
    return (
        <div className="flex items-end justify-center gap-[3px]" style={{ height: tall }}>
            {heights.map((height, i) => (
                <span
                    key={i}
                    className="flex-1 rounded-[2px]"
                    style={{ height: `${height}%`, backgroundColor: tone, maxWidth: 9 }}
                />
            ))}
        </div>
    );
}

export function Scanner({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const target = useMemo(() => start.puzzle?.target ?? [], [start.puzzle]);
    const lineup = useMemo(() => start.puzzle?.lineup ?? [], [start.puzzle]);

    const [tried, setTried]     = useState<number[]>([]);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        if (target.length) sfx('reveal');
    }, [target]);

    function finish(result: MinigameResult<ScannerRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function choose(pick: number) {
        if (busy || outcome || tried.includes(pick)) return;
        setBusy(true);
        const result = await answerMinigame<ScannerRow>(pick);
        setBusy(false);
        if (!result) return;
        setTried(prev => [...prev, pick]);
        if (result.done) finish(result);
        else sfx('deny');
    }

    return (
        <MinigamePanel
            title={t('minigames.scanner', 'Scanner')}
            headline={t('minigames.matchTheTrace', 'Match the trace')}
            sub={t('minigames.readsLeft', '{n} reads left', { n: options.attempts - tried.length })}
            score={{ label: t('minigames.statReads', 'Reads used'), value: String(tried.length) }}
            seconds={options.time}
            total={options.attempts}
            left={options.attempts - tried.length}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => {
                if (outcome) return;
                void forfeitMinigame<ScannerRow>().then(r => finish(r ?? { done: true, win: false }));
            }}
        >
            <div className="flex flex-col gap-4" style={boardIn(200)}>
                <div
                    className="rounded-[16px] px-4 py-3"
                    style={{ backgroundColor: `${PANEL.accent}14`, boxShadow: `inset 0 0 0 1px ${PANEL.accent}4D` }}
                >
                    <span className={`${panelEyebrow} mb-2 block text-center`} style={{ color: PANEL.accent }}>
                        {t('minigames.targetTrace', 'Target')}
                    </span>
                    <Bars heights={target} tall={54} tone={PANEL.accent} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {lineup.map((heights, i) => {
                        const pick = i + 1;
                        const spent = tried.includes(pick);
                        return (
                            <button
                                key={pick}
                                type="button"
                                disabled={spent || busy || outcome !== null}
                                onClick={() => { void choose(pick); }}
                                aria-label={t('minigames.traceN', 'Trace {n}', { n: pick })}
                                className="rounded-[12px] px-2 py-2.5 transition-all duration-150 active:scale-[0.94]"
                                style={spent
                                    ? { backgroundColor: `${PANEL.fail}1F`, boxShadow: `inset 0 0 0 1px ${PANEL.fail}59`, opacity: 0.5 }
                                    : tileFace}
                            >
                                <Bars heights={heights} tall={38} tone={spent ? PANEL.fail : 'rgba(255,255,255,0.72)'} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
