/** Bars the cellular icon draws. */
const BAR_COUNT = 4;

/** Opacity of a bar the current signal does not reach. Dimmed rather than hidden, as iOS draws it. */
const DIM = 0.28;

/**
 * Opacity for each cellular bar, left to right, for a 0..4 signal level. Bars up to the level are
 * solid and the rest stay visible but dimmed, so the icon keeps its shape while the strength
 * changes. An unusable level reads as no signal rather than full, so a missing value can never
 * flatter the connection.
 */
export function signalBarOpacities(bars: number): number[] {
    const level = Number.isFinite(bars) ? Math.max(0, Math.min(BAR_COUNT, Math.round(bars))) : 0;
    return Array.from({ length: BAR_COUNT }, (_, i) => (i < level ? 1 : DIM));
}
