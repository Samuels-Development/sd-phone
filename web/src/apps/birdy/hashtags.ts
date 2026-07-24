// Charset mirrors RichText's tag highlighter and the server-side Lua extractor.
const TAG_RE = /#([A-Za-z0-9_]+)/g;

export interface TrendingTag { tag: string; count: number }

export function extractHashtags(body: string): string[] {
    return [...body.matchAll(TAG_RE)].map(m => m[1]);
}

export function postHasTag(body: string, tag: string): boolean {
    const want = tag.replace(/^#/, '').toLowerCase();
    return extractHashtags(body).some(t => t.toLowerCase() === want);
}

/** Counts posts (not occurrences) per case-insensitive tag; displays the most-used casing. */
export function trendingFromBodies(bodies: string[], limit = 5): TrendingTag[] {
    const counts = new Map<string, number>();
    const casings = new Map<string, Map<string, number>>();
    for (const body of bodies) {
        const seen = new Set<string>();
        for (const raw of extractHashtags(body)) {
            const key = raw.toLowerCase();
            let cs = casings.get(key);
            if (!cs) { cs = new Map(); casings.set(key, cs); }
            cs.set(raw, (cs.get(raw) ?? 0) + 1);
            if (seen.has(key)) continue;
            seen.add(key);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
        .slice(0, limit)
        .map(([key, count]) => {
            let best = key;
            let bestN = 0;
            for (const [raw, n] of casings.get(key) ?? []) {
                if (n > bestN) { best = raw; bestN = n; }
            }
            return { tag: `#${best}`, count };
        });
}
