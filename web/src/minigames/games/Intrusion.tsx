import { useMemo, useState } from 'react';

import { Radar } from 'lucide-react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type IntrusionOptions, type IntrusionRow, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;

const DEFAULTS: IntrusionOptions = { layers: 4, width: 3, traps: 1, probes: 3, lives: 1, time: 40 };

type Known = Record<string, 'safe' | 'trap'>;

export function Intrusion({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);

    const [layer, setLayer]     = useState(0);
    const [known, setKnown]     = useState<Known>({});
    const [probes, setProbes]   = useState(options.probes);
    const [probing, setProbing] = useState(false);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);

    function finish(result: MinigameResult<IntrusionRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function act(action: 'probe' | 'hop', index: number) {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<IntrusionRow>({ action, index });
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row) {
            setKnown(prev => ({ ...prev, [`${row.layer}:${row.index}`]: row.trap ? 'trap' : 'safe' }));
            if (row.action === 'probe') {
                sfx('reveal');
                setProbes(row.probes ?? 0);
                setProbing(false);
            } else if (!row.trap) {
                if (!result.done) sfx('lock');
                setLayer(row.layer);
            } else if (!result.done) {
                sfx('deny');
            }
        }
        if (result.done) finish(result);
    }

    const target = layer + 1;
    const nodes = Array.from({ length: options.width }, (_, i) => i + 1);

    return (
        <MinigamePanel
            title={t('minigames.intrusion', 'Intrusion')}
            headline={probing
                ? t('minigames.probeANode', 'Probe a node')
                : t('minigames.chooseYourHop', 'Choose your hop')}
            sub={t('minigames.layersToCore', '{done} of {total} layers cleared', { done: layer, total: options.layers })}
            score={{ label: t('minigames.statProbesUsed', 'Probes used'), value: String(options.probes - probes) }}
            seconds={options.time}
            total={options.probes}
            left={probes}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => {
                if (outcome) return;
                void forfeitMinigame<IntrusionRow>().then(r => finish(r ?? { done: true, win: false }));
            }}
            meta={
                <button
                    type="button"
                    disabled={outcome !== null || probes <= 0}
                    onClick={() => setProbing(v => !v)}
                    className="flex items-center gap-2 rounded-full px-6 py-2.5 text-[14px] font-semibold transition-opacity active:opacity-70 disabled:opacity-30"
                    style={probing
                        ? { backgroundColor: PANEL.accent, color: '#fff' }
                        : { ...tileFace, color: 'rgba(255,255,255,0.75)' }}
                >
                    <Radar className="h-[15px] w-[15px]" strokeWidth={2.3} />
                    {t('minigames.probesLeft', 'Probe · {n}', { n: probes })}
                </button>
            }
        >
            <div className="flex flex-col gap-2" style={boardIn(200)}>
                {Array.from({ length: options.layers }, (_, i) => {
                    const row = options.layers - i;
                    const active = row === target;
                    const cleared = row <= layer;
                    return (
                        <div key={row} className="flex items-center gap-2">
                            <span
                                className="w-[16px] shrink-0 text-[10px] font-bold tabular-nums"
                                style={{ color: active ? PANEL.accent : 'rgba(255,255,255,0.25)' }}
                            >
                                {row}
                            </span>
                            <div className="flex flex-1 gap-2">
                                {nodes.map(index => {
                                    const mark = known[`${row}:${index}`];
                                    const reachable = active && !outcome && mark !== 'trap';
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            disabled={!reachable || busy}
                                            onClick={() => act(probing ? 'probe' : 'hop', index)}
                                            aria-label={t('minigames.node', 'Node {layer}-{index}', { layer: row, index })}
                                            className="h-[34px] flex-1 rounded-[10px] transition-all duration-150 active:scale-[0.94]"
                                            style={mark === 'trap'
                                                ? { backgroundColor: `${PANEL.fail}33`, boxShadow: `inset 0 0 0 1.5px ${PANEL.fail}` }
                                                : mark === 'safe'
                                                    ? { backgroundColor: `${PANEL.win}2E`, boxShadow: `inset 0 0 0 1.5px ${PANEL.win}99` }
                                                    : cleared
                                                        ? { backgroundColor: `${PANEL.win}1A` }
                                                        : active
                                                            ? { backgroundColor: `${PANEL.accent}1F`, boxShadow: `inset 0 0 0 1px ${PANEL.accent}66` }
                                                            : { ...tileFace, opacity: 0.4 }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                <div className="mt-1 flex items-center gap-2">
                    <span className="w-[16px] shrink-0" />
                    <div
                        className="flex h-[30px] flex-1 items-center justify-center rounded-[10px] text-[11px] font-bold uppercase tracking-[0.16em]"
                        style={{ backgroundColor: SURFACE.sunken, color: layer >= options.layers ? PANEL.win : 'rgba(255,255,255,0.35)', boxShadow: layer >= options.layers ? glow(PANEL.win) : undefined }}
                    >
                        {t('minigames.core', 'Core')}
                    </div>
                </div>
            </div>
        </MinigamePanel>
    );
}
