/** Twitter-style compact counts: 999 stays literal, 1.2K / 345.6K / 3.4M above, with a single
 *  decimal that drops when zero. Floors toward zero so a count never reads higher than it is. */
export function compactCount(n: number): string {
    if (n < 1000) return String(n);
    const unit = n < 1_000_000 ? 'K' : 'M';
    const base = n < 1_000_000 ? 1000 : 1_000_000;
    const scaled = Math.floor((n / base) * 10) / 10;
    const text = scaled >= 100 || Number.isInteger(scaled) ? String(Math.floor(scaled * 10) / 10) : scaled.toFixed(1);
    return `${trimZero(text)}${unit}`;
}

function trimZero(s: string): string {
    return s.endsWith('.0') ? s.slice(0, -2) : s;
}
