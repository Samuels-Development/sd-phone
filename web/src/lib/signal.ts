const BAR_COUNT = 4;

const DIM = 0.28;

export function signalBarOpacities(bars: number): number[] {
    const level = Number.isFinite(bars) ? Math.max(0, Math.min(BAR_COUNT, Math.round(bars))) : 0;
    return Array.from({ length: BAR_COUNT }, (_, i) => (i < level ? 1 : DIM));
}
