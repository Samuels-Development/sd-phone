const BASE_ACCENT = '#AF52DE';

export const GAME_ACCENT: Record<string, string> = {
    anagram:    '#5E5CE6',
    bypass:     '#AF52DE',
    circuit:    '#64D2FF',
    decode:     '#BF5AF2',
    intrusion:  '#FF6482',
    lockpick:   '#E0A83C',
    maze:       '#AF52DE',
    memory:     '#0A84FF',
    rewire:     '#FF9F0A',
    router:     '#30D5C8',
    scanner:    '#7D7AFF',
    sequencer:  '#FFD60A',
    simon:      '#FF6482',
    skillcheck: '#FF9F0A',
    sweep:      '#FFD60A',
    sync:       '#0A84FF',
    tune:       '#30D5C8',
    varhack:    '#64D2FF',
    vent:       '#E0A83C',
    wires:      '#FF6482',
};

let accent = BASE_ACCENT;

export function setAccent(gameId: string): void {
    accent = GAME_ACCENT[gameId] ?? BASE_ACCENT;
}

export const PANEL = {
    get accent() { return accent; },
    win:  '#34C759',
    fail: '#FF3B30',
};

export const SURFACE = {
    panel:  'rgba(255,255,255,0.07)',
    soft:   'rgba(255,255,255,0.05)',
    sunken: 'rgba(0,0,0,0.30)',
    hair:   'rgba(255,255,255,0.10)',
} as const;

function tint(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function appBackground(): string {
    return [
        `radial-gradient(115% 62% at 50% 30%, ${tint(accent, 0.14)} 0%, ${tint(accent, 0)} 62%)`,
        'radial-gradient(125% 85% at 50% 0%, #221D38 0%, #141127 46%, #06090F 100%)',
    ].join(', ');
}

export const boardCard = {
    backgroundColor: 'rgba(255,255,255,0.035)',
    boxShadow:       'inset 0 0 0 1px rgba(255,255,255,0.06)',
} as const;

export const panelEyebrow = 'text-[11px] font-semibold uppercase tracking-[0.16em]';
export const panelTitle   = 'text-[25px] font-bold leading-tight tracking-tight text-white';
export const panelSub     = 'text-[15px] font-medium text-white/50';
export const panelClock   = 'text-[17px] font-semibold tabular-nums';

export const tileFace = {
    backgroundColor: SURFACE.panel,
    boxShadow:       `inset 0 0 0 1px ${SURFACE.hair}, inset 0 1px 0 rgba(255,255,255,0.06)`,
} as const;

export const EXIT_MS = 300;

const EASE = 'cubic-bezier(0.32,0.72,0,1)';

export const enterPanel = { animation: `mg-in 0.42s ${EASE} both` } as const;
export const leavePanel = { animation: `mg-out 0.3s ${EASE} both` } as const;

export function riseIn(delayMs: number): { animation: string } {
    return { animation: `mg-rise 0.42s ${EASE} ${delayMs}ms both` };
}

export function boardIn(delayMs: number): { animation: string } {
    return { animation: `mg-board 0.46s ${EASE} ${delayMs}ms both` };
}

export function glow(color: string): string {
    return `0 0 18px ${color}59, inset 0 1px 0 rgba(255,255,255,0.28)`;
}
