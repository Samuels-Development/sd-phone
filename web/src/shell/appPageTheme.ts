import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';
import inter900 from '@fontsource/inter/files/inter-latin-900-normal.woff2?url';


const INTER_FAMILY = 'sd-phone Inter';

const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "${INTER_FAMILY}", Inter, system-ui, sans-serif`;

const FROM_TOKENS: Array<[name: string, token: string, alpha?: number]> = [
    ['--phone-background', '--base'],
    ['--phone-surface', '--surface'],
    ['--phone-elevated', '--elevated'],
    ['--phone-control', '--control'],
    ['--phone-text', '--label'],
    ['--phone-text-secondary', '--ios-gray'],
    ['--phone-separator', '--hairline', 0.1],
    ['--phone-accent', '--ios-blue'],
];

export function phoneVars(read: (token: string) => string): Record<string, string> {
    const vars: Record<string, string> = {};

    for (const [name, token, alpha] of FROM_TOKENS) {
        const channels = read(token).trim();
        if (!channels) continue;
        vars[name] = alpha === undefined ? `rgb(${channels})` : `rgb(${channels} / ${alpha})`;
    }

    vars['--phone-on-accent'] = '#ffffff';
    vars['--phone-destructive'] = '#ff453a';
    vars['--phone-font'] = FONT;

    return vars;
}

export function pageVarsCss(vars: Record<string, string>): string {
    return `:where(:root){${Object.entries(vars).map(([name, value]) => `${name}:${value};`).join('')}}`;
}

const INTER: Array<[weight: number, url: string]> = [
    [400, inter400], [500, inter500], [600, inter600], [700, inter700], [800, inter800], [900, inter900],
];

let interData: Promise<Array<[number, ArrayBuffer]>> | null = null;

export function loadInter(doc: Document): Promise<void> {
    const view = doc.defaultView as (Window & typeof globalThis) | null;
    if (!view || typeof view.FontFace !== 'function') return Promise.resolve();

    interData ??= Promise.all(INTER.map(([weight, url]) =>
        fetch(url).then(r => r.arrayBuffer()).then((data): [number, ArrayBuffer] => [weight, data])));

    return interData.then(list => {
        for (const [weight, data] of list) {
            doc.fonts.add(new view.FontFace(INTER_FAMILY, data, { weight: String(weight) }));
        }
    }, () => {
        interData = null;
    });
}
