import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, type Envelope } from '@/core/api';

export interface Design {
    style:           string;
    color:           number;
    pattern?:        string;
    patternColor?:   number;
    accessory?:      string;
    accessoryColor?: number;
    charm?:          string;
    charmColor?:     number;
    sticker?:        string;
    /** With `sticker: 'photo'`, the URL of the gallery picture printed on the back. */
    photo?:          string;
}

export interface Priced { id: string; price: number }

interface StyleItem extends Priced { open: boolean; pocket: boolean }

export type StickerGroup = 'icons' | 'brands';

interface StickerItem extends Priced { group?: StickerGroup }

export interface Catalog {
    palette:     string[];
    styles:      StyleItem[];
    patterns:    Priced[];
    accessories: Priced[];
    charms:      Priced[];
    stickers:    StickerItem[];
    /** What a sticker made from a gallery photo costs; missing when photo stickers are off. */
    photoPrice?: number;
}

/** The sticker id that stands for the player's own photo rather than a sticker from the list. */
export const PHOTO_STICKER = 'photo';

export function stickerGroup(item: StickerItem): StickerGroup {
    return item.group === 'brands' ? 'brands' : 'icons';
}

export type TrimKind = 'rings' | 'bezel' | 'buttons';

/** The phone's own design and the palette row of each trim fitted to it (shared/cases.lua PhoneStyle). */
export interface PhoneStyle {
    look:     string;
    rings?:   number;
    bezel?:   number;
    buttons?: number;
}

/** What this server lets a player choose for the phone itself, and what they have chosen. */
export interface PhoneOptions {
    enabled: boolean;
    looks:   string[];
    trims:   TrimKind[];
    style:   PhoneStyle | false;
}

export interface CasesState {
    catalog:  Catalog;
    owned:    Design[];
    equipped: Design | false;
    balance:  number;
    maxOwned: number;
    frame:    string;
    blocked:  boolean;
    phone?:   PhoneOptions;
}

/** The parts a style can carry, mirroring shared/cases.lua: an open style (a bumper) takes only a
 *  charm, and a pocket style (a wallet) takes a pattern and a charm but nothing stuck on its back. */
export function styleAllows(catalog: Catalog, styleId: string): { pattern: boolean; accessory: boolean; sticker: boolean } {
    const style = catalog.styles.find(s => s.id === styleId);
    const open = !!style?.open;
    const pocket = !!style?.pocket;
    return { pattern: !open, accessory: !open && !pocket, sticker: !open && !pocket };
}

/** Rebuilds a design with only what its style can carry, the way the server will store it. */
export function cleanDesign(catalog: Catalog, d: Design): Design {
    const allow = styleAllows(catalog, d.style);
    const out: Design = { style: d.style, color: d.color };
    if (d.pattern && allow.pattern) { out.pattern = d.pattern; out.patternColor = d.patternColor ?? 0; }
    if (d.accessory && allow.accessory) { out.accessory = d.accessory; out.accessoryColor = d.accessoryColor ?? 0; }
    if (d.charm) { out.charm = d.charm; out.charmColor = d.charmColor ?? 0; }
    if (d.sticker && allow.sticker) {
        if (d.sticker !== PHOTO_STICKER) out.sticker = d.sticker;
        else if (d.photo && catalog.photoPrice !== undefined) { out.sticker = PHOTO_STICKER; out.photo = d.photo; }
    }
    return out;
}

function priceIn(list: Priced[], id?: string): number {
    if (!id) return 0;
    return list.find(p => p.id === id)?.price ?? 0;
}

/** What a sticker costs: its list price, or the photo price for the player's own photo. */
export function stickerPrice(catalog: Catalog, id?: string): number {
    return id === PHOTO_STICKER ? catalog.photoPrice ?? 0 : priceIn(catalog.stickers, id);
}

export function designPrice(catalog: Catalog, d: Design): number {
    return priceIn(catalog.styles, d.style)
        + priceIn(catalog.patterns, d.pattern)
        + priceIn(catalog.accessories, d.accessory)
        + priceIn(catalog.charms, d.charm)
        + stickerPrice(catalog, d.sticker);
}

export function designKey(d: Design | null | false | undefined): string {
    if (!d) return '';
    return [
        d.style, d.color,
        d.pattern ?? '-', d.pattern ? d.patternColor ?? 0 : 0,
        d.accessory ?? '-', d.accessory ? d.accessoryColor ?? 0 : 0,
        d.charm ?? '-', d.charm ? d.charmColor ?? 0 : 0,
        d.sticker ?? '-', d.sticker === PHOTO_STICKER ? d.photo ?? '' : '',
    ].join('.');
}

function rgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** A palette row that reads well on top of the given one: the lightest on dark shells, the darkest on light. */
export function contrastRow(palette: string[], row: number): number {
    const lum = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ranked = palette.map((hex, i) => ({ i, l: lum(hex) })).sort((a, b) => a.l - b.l);
    if (!ranked.length) return 0;
    return lum(palette[row] ?? '#ffffff') <= 0.5 ? ranked[ranked.length - 1].i : ranked[0].i;
}

/** The palette row nearest a colour. */
export function nearestRow(palette: string[], hex: string): number {
    const [r, g, b] = rgb(hex);
    let best = 0;
    let bestD = Infinity;
    palette.forEach((h, i) => {
        const [r2, g2, b2] = rgb(h);
        const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    });
    return best;
}

export function randomDesign(catalog: Catalog): Design {
    const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
    const row = () => Math.floor(Math.random() * catalog.palette.length);
    const d: Design = { style: pick(catalog.styles).id, color: row() };
    if (Math.random() < 0.65 && catalog.patterns.length) { d.pattern = pick(catalog.patterns).id; d.patternColor = row(); }
    if (Math.random() < 0.4 && catalog.accessories.length) { d.accessory = pick(catalog.accessories).id; d.accessoryColor = row(); }
    if (Math.random() < 0.45 && catalog.charms.length) { d.charm = pick(catalog.charms).id; d.charmColor = row(); }
    if (Math.random() < 0.5 && catalog.stickers.length) d.sticker = pick(catalog.stickers).id;
    return cleanDesign(catalog, d);
}

const DEV_PALETTE = [
    '#f4f4f1', '#efe4cc', '#d8c3a0', '#b98d5e', '#7a4a2a', '#3f2718', '#c4c8cc', '#8a8e94',
    '#4b4d52', '#2a2b2e', '#141416', '#f3c6cc', '#f08c7c', '#f2604e', '#d0242c', '#96101e',
    '#5c1026', '#e85a78', '#f0389a', '#c81e8c', '#fbb890', '#f27a1c', '#f0a31e', '#d9b04c',
    '#f4d030', '#f6ec74', '#aede2c', '#2fb443', '#12805a', '#1c4a32', '#6e7430', '#98ab8c',
    '#a4e6c8', '#178c8a', '#48d4cc', '#30c0e8', '#8cc8f4', '#2c72dc', '#1c3cb4', '#141f4c',
    '#4a6a94', '#463cac', '#7a48d8', '#8a30b0', '#c6b4ee', '#5a1e58', '#e2ac9c', '#a07248',
    '#c06c3c', '#e8d6b0', '#58ff3c', '#ff3cb4', '#f4ff3c', '#2c5cff', '#d8f0f8', '#a49c90',
    '#a8985c', '#a0431e', '#c89a1c', '#6cc8a4', '#145c6c', '#a47c98', '#fc94c8', '#0c1024',
];

function devCatalog(): Catalog {
    const priced = (ids: string[], price: number, overrides: Record<string, number> = {}): Priced[] =>
        ids.map(id => ({ id, price: overrides[id] ?? price }));
    const styles: [string, number, boolean, boolean][] = [
        ['slim', 150, false, false], ['gloss', 200, false, false], ['fabric', 300, false, false],
        ['leather', 450, false, false], ['wallet', 600, false, true], ['rugged', 500, false, false],
        ['bumper', 350, true, false],
    ];
    return {
        palette: DEV_PALETTE,
        styles: styles.map(([id, price, open, pocket]) => ({ id, price, open, pocket })),
        patterns: priced(['stripes', 'bands', 'diagonal', 'split', 'slash', 'dots', 'checker', 'chevron',
            'belt', 'waves', 'carbon', 'camo', 'marble', 'hex', 'topo', 'splatter'], 120),
        accessories: priced(['grip', 'ring', 'loop'], 90, { ring: 110 }),
        charms: priced(['lanyard', 'pearls', 'beads', 'star', 'heart', 'moon', 'bolt', 'gem', 'dice',
            'bell', 'coin', 'tag', 'pompom', 'tassel'], 75, { lanyard: 60 }),
        stickers: [
            ...priced(['star', 'heart', 'skull', 'flame', 'zap', 'smile', 'crown', 'ghost',
                'rocket', 'music', 'gamepad_2', 'paw_print', 'moon', 'sun', 'cherry', 'gem'], 25)
                .map(s => ({ ...s, group: 'icons' as const })),
            ...priced(['sprunk', 'pisswasser', 'ammunation', 'lscustoms', 'weazel', 'binco', 'ponsonbys',
                'suburban', 'bleeter', 'eyefind', 'whiz', 'fruit', 'maibatsu', 'vapid', 'ubermacht', 'brute',
                'ron', 'bf', 'betta', 'tinkle', 'badger', 'cnt', 'schyster', 'shark', 'hvy', 'ltd', 'crevis',
                'bittersweet', 'vomfeuer', 'shrewsbury', 'peckerwood', 'zit'], 25)
                .map(s => ({ ...s, group: 'brands' as const })),
        ],
        photoPrice: 150,
    };
}

let dev: CasesState | null = null;
function devState(): CasesState {
    if (!dev) {
        const owned: Design[] = [
            { style: 'leather', color: 4, charm: 'heart', charmColor: 17 },
            { style: 'rugged', color: 9, pattern: 'camo', patternColor: 30, accessory: 'ring', accessoryColor: 6, sticker: 'skull' },
        ];
        const blocked = new URLSearchParams(window.location.search).get('cases') === 'blocked';
        dev = {
            catalog: devCatalog(), owned, equipped: owned[1], balance: 5000, maxOwned: 12, frame: blocked ? 'leather_brown' : 'black', blocked,
            phone: { enabled: true, looks: ['classic', 'slate'], trims: ['rings', 'bezel', 'buttons'], style: false },
        };
    }
    return dev;
}

function copy<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

function devFail<T>(messageKey: string, message: string, messageVars?: Record<string, number>): Envelope<T> {
    return { success: false, messageKey, message, messageVars };
}

function list<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

function phoneOptions(p: PhoneOptions | undefined): PhoneOptions {
    return { enabled: p?.enabled === true, looks: list(p?.looks), trims: list(p?.trims), style: p?.style || false };
}

/** Sets the design and trims of the player's own phone; null goes back to the classic phone. */
export async function setPhoneStyle(style: PhoneStyle | null): Promise<Envelope<PhoneOptions>> {
    if (!isFiveM) {
        const s = devState();
        s.phone = { ...phoneOptions(s.phone), style: style ?? false };
        return { success: true, data: copy(s.phone) };
    }
    const res = await apiCall<PhoneOptions>('sd-phone:cases:style', { style: style ?? false });
    if (res.success && res.data) res.data = phoneOptions(res.data);
    return res;
}

export async function fetchCasesState(): Promise<Envelope<CasesState>> {
    if (!isFiveM) return { success: true, data: copy(devState()) };
    const res = await apiCall<CasesState>('sd-phone:cases:state');
    const d = res.data;
    if (res.success && d) {
        d.owned = list(d.owned);
        d.equipped = d.equipped || false;
        d.phone = phoneOptions(d.phone);
        d.catalog = {
            palette:     list(d.catalog?.palette),
            styles:      list(d.catalog?.styles),
            patterns:    list(d.catalog?.patterns),
            accessories: list(d.catalog?.accessories),
            charms:      list(d.catalog?.charms),
            stickers:    list(d.catalog?.stickers),
            photoPrice:  typeof d.catalog?.photoPrice === 'number' ? d.catalog.photoPrice : undefined,
        };
    }
    return res;
}

export async function buyCase(design: Design): Promise<Envelope<{ owned: Design[]; equipped: Design | false; balance: number }>> {
    if (!isFiveM) {
        const s = devState();
        if (!s.catalog.styles.some(x => x.id === design.style)) return devFail('cases.invalidDesign', 'That case cannot be made');
        const clean = cleanDesign(s.catalog, design);
        if (s.owned.length >= s.maxOwned) return devFail('cases.full', 'You can keep {n} cases. Delete one first.', { n: s.maxOwned });
        const price = designPrice(s.catalog, clean);
        if (s.balance < price) return devFail('cases.insufficientFunds', 'Not enough money in the bank');
        s.balance -= price;
        s.owned.push(clean);
        s.equipped = clean;
        return { success: true, data: copy({ owned: s.owned, equipped: s.equipped, balance: s.balance }) };
    }
    const res = await apiCall<{ owned: Design[]; equipped: Design | false; balance: number }>('sd-phone:cases:buy', { design });
    if (res.success && res.data) res.data.owned = list(res.data.owned);
    return res;
}

/** Puts on owned[index - 1] (the server counts from 1), or takes the case off with null. */
export async function equipCase(index: number | null): Promise<Envelope<{ equipped: Design | false }>> {
    if (!isFiveM) {
        const s = devState();
        const design = index === null ? false : s.owned[index - 1];
        if (design === undefined) return devFail('cases.notOwned', 'You do not own that case');
        s.equipped = design;
        return { success: true, data: copy({ equipped: s.equipped }) };
    }
    return apiCall('sd-phone:cases:equip', { index });
}

/** Deletes owned[index - 1] (the server counts from 1). */
export async function removeCase(index: number): Promise<Envelope<{ owned: Design[]; equipped: Design | false }>> {
    if (!isFiveM) {
        const s = devState();
        if (!s.owned[index - 1]) return devFail('cases.notOwned', 'You do not own that case');
        s.owned.splice(index - 1, 1);
        const worn = designKey(s.equipped);
        if (!s.owned.some(d => designKey(d) === worn)) s.equipped = false;
        return { success: true, data: copy({ owned: s.owned, equipped: s.equipped }) };
    }
    const res = await apiCall<{ owned: Design[]; equipped: Design | false }>('sd-phone:cases:remove', { index });
    if (res.success && res.data) res.data.owned = list(res.data.owned);
    return res;
}

/** Tries a design on the phone in the player's hand; null goes back to the case being worn. */
export function previewCase(design: Design | null): void {
    if (isFiveM) void fetchNui('sd-phone:cases:preview', { design });
}
