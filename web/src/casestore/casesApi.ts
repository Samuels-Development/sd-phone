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
    /** The stickers on the back, the bottom of the stack first: at most MAX_STICKERS, at most one of
     *  them the player's photo. Styles that cannot take a sticker carry none; an empty list is left out. */
    stickers?:       Sticker[];
    /** With a PHOTO_STICKER on the back, the URL of the gallery picture printed on it. */
    photo?:          string;
}

/** One sticker on the back: which one (a catalog sticker id, or PHOTO_STICKER), and where it sits
 *  and how big it is, each left out while at STICKER_HOME: mm from the middle of the back along the
 *  phone's own X (its +X is on the LEFT seen from behind), mm up from the phone's centre, degrees
 *  turned (clockwise seen from behind), and its edge in mm (one of STICKER_SIZES). */
export interface Sticker { id: string; x?: number; z?: number; turn?: number; size?: number }

/** Where a sticker sits and its size, every field filled in. */
export interface StickerPlace { x: number; z: number; turn: number; size: number }

/** The most stickers a case takes. */
export const MAX_STICKERS = 6;
/** The place and size stickers have always had. */
export const STICKER_HOME: StickerPlace = { x: 0, z: -52, turn: 0, size: 24 };
/** The sizes a sticker comes in, edge in mm (in the game each is a model of its own), as
 *  shared/cases.lua has them. */
export const STICKER_SIZES = [12, 16, 20, 24, 28, 32, 38, 44] as const;
const PLACE_STEP = 0.5;
const TURN_STEP = 5;

/** How far a sticker's centre may go from the middle of the back, either way (mm), so all of it
 *  stays on the back: over the cameras too, the camera block stands over it. */
function stickerLimits(size: number): { x: number; z: number } {
    return { x: 39 - size / 2, z: 81 - size / 2 };
}

/** The allowed size nearest to `v` (the smaller of two as near). */
export function nearestSize(v: number): number {
    let best: number = STICKER_SIZES[0];
    for (const s of STICKER_SIZES) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
    return best;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Rounds to the step and clamps to ±lim; + 0 turns -0 into 0. */
const snap = (v: number, step: number, lim: number) => Math.min(lim, Math.max(-lim, Math.round(v / step) * step)) + 0;

/** A sticker's placement as the server keeps it (shared/cases.lua clean): the size snapped to an
 *  allowed one, the centre rounded and kept on the back for that size, the turn rounded. */
export function stickerPlace(s: Partial<StickerPlace>): StickerPlace {
    const size = isNum(s.size) ? nearestSize(s.size) : STICKER_HOME.size;
    const lim = stickerLimits(size);
    return {
        x:    snap(isNum(s.x) ? s.x : STICKER_HOME.x, PLACE_STEP, lim.x),
        z:    snap(isNum(s.z) ? s.z : STICKER_HOME.z, PLACE_STEP, lim.z),
        turn: snap(isNum(s.turn) ? s.turn : STICKER_HOME.turn, TURN_STEP, 180),
        size,
    };
}

export const atHome = (p: StickerPlace) =>
    p.x === STICKER_HOME.x && p.z === STICKER_HOME.z && p.turn === STICKER_HOME.turn && p.size === STICKER_HOME.size;

/** Sticker `id` placed at `p` (snapped as the server would), carrying only the fields that differ
 *  from home, so a sticker that was never moved is just its id. */
export function placedSticker(id: string, p: Partial<StickerPlace>): Sticker {
    const s = stickerPlace(p);
    const out: Sticker = { id };
    if (s.x !== STICKER_HOME.x) out.x = s.x;
    if (s.z !== STICKER_HOME.z) out.z = s.z;
    if (s.turn !== STICKER_HOME.turn) out.turn = s.turn;
    if (s.size !== STICKER_HOME.size) out.size = s.size;
    return out;
}

export const stickersOf = (d: Design | null | false | undefined): Sticker[] => (d && Array.isArray(d.stickers) ? d.stickers : []);

/** Where an added sticker goes: the usual spot, else the first of a few spots a sticker's width
 *  apart (across the lower back first, then up it) that no sticker covers yet (no centre within
 *  24 mm), else the one furthest from them all. */
const FREE_GAP = 24;
const SPOTS: readonly [number, number][] = [
    [0, -52], [-24, -52], [24, -52], [0, -26], [-24, -26], [24, -26], [0, 0], [-24, 0], [24, 0], [0, 26], [-24, 26], [24, 26],
];

function freeSpot(list: Sticker[]): readonly [number, number] {
    const taken = list.map(st => stickerPlace(st));
    let best = SPOTS[0];
    let bestGap = -1;
    for (const spot of SPOTS) {
        const gap = Math.min(Infinity, ...taken.map(p => Math.hypot(p.x - spot[0], p.z - spot[1])));
        if (gap >= FREE_GAP) return spot;
        if (gap > bestGap) { best = spot; bestGap = gap; }
    }
    return best;
}

/** The list with sticker `id` added on top at a free spot, or the list as it was when it is full. */
export function addSticker(list: Sticker[], id: string): Sticker[] {
    if (list.length >= MAX_STICKERS) return list;
    const [x, z] = freeSpot(list);
    return [...list, placedSticker(id, { x, z })];
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

/** The logo on the phone's back and the palette row of each trim fitted to it (shared/cases.lua
 *  PhoneStyle). No logo means the one the server ships. The design is not in it: that comes with
 *  the phone item. */
export interface PhoneStyle {
    logo?:    string;
    rings?:   number;
    bezel?:   number;
    buttons?: number;
}

/** What this server lets a player choose for the phone itself, and what they have chosen. `looks`
 *  holds the design of the phone on show, and `logos` the logos offered on it. */
export interface PhoneOptions {
    enabled: boolean;
    looks:   string[];
    logos:   Record<string, string[]>;
    trims:   TrimKind[];
    style:   PhoneStyle | false;
}

/** The phone's build the pictures are drawn for: the regular body or the foldable shut, and its design. */
export type PhoneBody = 'plain' | 'shut';
export type PhoneLook = 'classic' | 'slate';

const asBody = (v: unknown): PhoneBody => (v === 'shut' ? 'shut' : 'plain');
export const asLook = (v: unknown): PhoneLook => (v === 'slate' ? 'slate' : 'classic');

/** One of the phones the player carries: its frame colour (a frameColors name), the item's label,
 *  whether it is a foldable and its design. A phone is all three: a player can carry a classic, a
 *  classic foldable, a Slate and a Slate foldable phone in one colour. */
export interface PhoneItem { color: string; label: string; fold: boolean; look: PhoneLook }

/** Everything a case store shows, as the game sends it when the player walks up to the counter.
 *  With `items` a bought case becomes an inventory item, and `owned` holds only designs bought
 *  before that, waiting to be collected; without it `owned` is the list the player keeps. */
export interface StoreState {
    store:    string;
    catalog:  Catalog;
    balance:  number;
    equipped: Design | false;
    owned:    Design[];
    maxOwned: number;
    items:    boolean;
    /** The frame colour of the phone on show. */
    frame:    string;
    /** The phone on show comes in its own case and cannot wear another. */
    blocked:  boolean;
    /** The body of the phone on show. */
    body:     PhoneBody;
    /** The design of the phone on show, which every picture is drawn in. */
    look:     PhoneLook;
    /** The phones the player carries; with more than one the panel offers to show another. */
    phones:   PhoneItem[];
    /** The free choices about the phone itself, made under the store's Phone tab. */
    phone:    PhoneOptions;
}

/** The Phone Case page in Settings: the case the phone is wearing. */
export interface PhonePage {
    equipped: Design | false;
    frame:    string;
    blocked:  boolean;
    items:    boolean;
    catalog:  Catalog;
    body:     PhoneBody;
    look:     PhoneLook;
}

/** Which part of the phone the store camera frames; `trim` is the cameras and the side buttons. */
export type CaseView = 'body' | 'accessory' | 'charm' | 'sticker' | 'trim';

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
    if (allow.sticker) {
        const kept: Sticker[] = [];
        let photo = false;
        for (const st of stickersOf(d)) {
            if (kept.length >= MAX_STICKERS) break;
            if (!st || typeof st.id !== 'string' || !st.id) continue;
            if (st.id === PHOTO_STICKER) {
                if (photo || !d.photo || catalog.photoPrice === undefined) continue;
                photo = true;
            }
            kept.push(placedSticker(st.id, st));
        }
        if (kept.length) out.stickers = kept;
        if (photo) out.photo = d.photo;
    }
    return out;
}

/** What one part costs, or 0 for no part or one the catalog does not list. */
export function priceIn(list: Priced[], id?: string): number {
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
        + stickersOf(d).reduce((sum, st) => sum + stickerPrice(catalog, st.id), 0);
}

/** A design's identity, for "is this the same case" checks. Its stickers come in stack order, each
 *  its id plus `@x,z,turn,size` (snapped like the server) when not at home, joined by `|`; a design
 *  with no stickers, or with one never moved, keeps the key it had before there could be several. */
export function designKey(d: Design | null | false | undefined): string {
    if (!d) return '';
    const list = stickersOf(d);
    const stickers = list.map(st => {
        const p = stickerPlace(st);
        return atHome(p) ? st.id : `${st.id}@${p.x},${p.z},${p.turn},${p.size}`;
    }).join('|');
    return [
        d.style, d.color,
        d.pattern ?? '-', d.pattern ? d.patternColor ?? 0 : 0,
        d.accessory ?? '-', d.accessory ? d.accessoryColor ?? 0 : 0,
        d.charm ?? '-', d.charm ? d.charmColor ?? 0 : 0,
        stickers || '-', list.some(st => st.id === PHOTO_STICKER) ? d.photo ?? '' : '',
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
    if (Math.random() < 0.5 && catalog.stickers.length) d.stickers = [{ id: pick(catalog.stickers).id }];
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

interface DevState {
    catalog:  Catalog;
    owned:    Design[];
    equipped: Design | false;
    balance:  number;
    maxOwned: number;
    items:    boolean;
    frame:    string;
    blocked:  boolean;
    body:     PhoneBody;
    look:     PhoneLook;
    phones:   PhoneItem[];
    phone:    PhoneOptions;
}

let dev: DevState | null = null;

/** The stand-in's phones: the four kinds in black, and a leather one that comes in its own case. */
const DEV_PHONES: PhoneItem[] = [
    { color: 'black', label: 'Black Phone', fold: false, look: 'classic' },
    { color: 'black', label: 'Foldable Black Phone', fold: true, look: 'classic' },
    { color: 'black', label: 'Black Slate Phone', fold: false, look: 'slate' },
    { color: 'black', label: 'Foldable Black Slate Phone', fold: true, look: 'slate' },
    { color: 'leather_brown', label: 'Brown Leather Phone', fold: false, look: 'classic' },
];

const DEV_LOGOS: Record<PhoneLook, string[]> = { classic: ['sd', 'ifruit', 'generic'], slate: ['sd', 'ifruit'] };

function devPhone(color: string, fold: boolean, look: PhoneLook): { frame: string; blocked: boolean; body: PhoneBody; look: PhoneLook } {
    return { frame: color, blocked: color.startsWith('leather_'), body: fold ? 'shut' : 'plain', look };
}

/** What the stand-in offers on a design: only that design, and its own logos. */
function devOptions(look: PhoneLook, style: PhoneStyle | false): PhoneOptions {
    return { enabled: true, looks: [look], logos: { [look]: DEV_LOGOS[look] }, trims: ['rings', 'bezel', 'buttons'], style };
}

/** The browser stand-in for the server. `?casestore=list` is a server without case items, where the
 *  designs a player buys are kept on a list; `&blocked` shows the phone with its own case first,
 *  `&body=shut` a foldable black one and `&look=slate` a Slate one. */
function devState(): DevState {
    if (!dev) {
        const params = new URLSearchParams(window.location.search);
        const look = asLook(params.get('look'));
        const shown = params.has('blocked')
            ? devPhone('leather_brown', false, 'classic')
            : devPhone('black', asBody(params.get('body')) === 'shut', look);
        const owned: Design[] = [
            { style: 'leather', color: 4, charm: 'heart', charmColor: 17 },
            {
                style: 'rugged', color: 9, pattern: 'camo', patternColor: 30, accessory: 'ring', accessoryColor: 6,
                stickers: [{ id: 'skull' }, { id: 'star', x: 15, z: -26, turn: 20, size: 16 }, { id: 'sprunk', x: -12, z: 12, turn: -15 }],
            },
        ];
        dev = {
            catalog: devCatalog(), owned, equipped: owned[1], balance: 5000, maxOwned: 12,
            items: params.get('casestore') !== 'list', ...shown, phones: DEV_PHONES,
            phone: devOptions(shown.look, false),
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

/** Lua sends an empty table for an empty list, which arrives as `{}`; every list is read through here. */
function readCatalog(c: Partial<Catalog> | undefined): Catalog {
    return {
        palette:     list(c?.palette),
        styles:      list(c?.styles),
        patterns:    list(c?.patterns),
        accessories: list(c?.accessories),
        charms:      list(c?.charms),
        stickers:    list(c?.stickers),
        photoPrice:  typeof c?.photoPrice === 'number' ? c.photoPrice : undefined,
    };
}

function phoneOptions(p: Partial<PhoneOptions> | undefined): PhoneOptions {
    const logos: Record<string, string[]> = {};
    for (const look of list<string>(p?.looks)) logos[look] = list(p?.logos?.[look]);
    return { enabled: p?.enabled === true, looks: list(p?.looks), logos, trims: list(p?.trims), style: p?.style || false };
}

/** The store as the game opened it, with every list made a real array. */
export function readStore(raw: Partial<StoreState> | undefined): StoreState {
    return {
        store:    typeof raw?.store === 'string' ? raw.store : '',
        catalog:  readCatalog(raw?.catalog),
        balance:  typeof raw?.balance === 'number' ? raw.balance : 0,
        equipped: raw?.equipped || false,
        owned:    list(raw?.owned),
        maxOwned: typeof raw?.maxOwned === 'number' ? raw.maxOwned : 0,
        items:    raw?.items === true,
        frame:    typeof raw?.frame === 'string' ? raw.frame : '',
        blocked:  raw?.blocked === true,
        body:     asBody(raw?.body),
        look:     asLook(raw?.look),
        phones:   list<PhoneItem>(raw?.phones).filter(p => typeof p?.color === 'string' && p.color !== '')
            .map(p => ({ color: p.color, label: typeof p.label === 'string' ? p.label : '', fold: p.fold === true, look: asLook(p.look) })),
        phone:    phoneOptions(raw?.phone),
    };
}

/** The store the browser opens with `?casestore=1` (or `=list`), with no game around it. */
export function devStore(): StoreState {
    const s = devState();
    return copy({
        store: 'Digital Den', catalog: s.catalog, balance: s.balance, equipped: s.equipped, owned: s.owned,
        maxOwned: s.maxOwned, items: s.items, frame: s.frame, blocked: s.blocked, body: s.body, look: s.look,
        phones: s.phones, phone: s.phone,
    });
}

/** The phone now on the counter, and the choices about it: its design decides the logos offered. */
export interface ShownPhone { frame: string; blocked: boolean; body: PhoneBody; look: PhoneLook; phone: PhoneOptions }

/** Puts another of the player's phones on the counter, by its frame colour, kind and design. */
export async function showPhone(color: string, fold: boolean, look: PhoneLook): Promise<Envelope<ShownPhone>> {
    if (!isFiveM) {
        const s = devState();
        if (!s.phones.some(p => p.color === color && p.fold === fold && p.look === look)) return devFail('cases.phoneNotCarried', 'You do not have that phone on you');
        Object.assign(s, devPhone(color, fold, look));
        s.phone = devOptions(look, s.phone.style);
        return { success: true, data: copy({ frame: s.frame, blocked: s.blocked, body: s.body, look: s.look, phone: s.phone }) };
    }
    const res = await apiCall<ShownPhone>('sd-phone:casestore:phone', { color, fold, look });
    const d = res.data;
    if (res.success && d) {
        d.frame = typeof d.frame === 'string' ? d.frame : color;
        d.blocked = d.blocked === true;
        d.body = asBody(d.body);
        d.look = d.look === undefined ? look : asLook(d.look);
        d.phone = phoneOptions(d.phone);
    }
    return res;
}

/** Lights the screen of the phone on show, or turns it off again (it starts off). */
export function showScreen(on: boolean): void {
    void fetchNui('sd-phone:casestore:screen', { on });
}

/** Dresses the phone in front of the store camera; false shows it bare. */
export function previewDesign(design: Design | false): void {
    void fetchNui('sd-phone:casestore:preview', { design });
}

/** Turns the phone by the pixels the pointer moved over the stage. */
export function rotateView(dx: number, dy: number): void {
    void fetchNui('sd-phone:casestore:rotate', { dx, dy });
}

/** Moves the camera in (-1) or out (1) one step. */
export function zoomView(delta: number): void {
    void fetchNui('sd-phone:casestore:zoom', { delta });
}

/** Frames the part of the phone being worked on. */
export function frameView(view: CaseView): void {
    void fetchNui('sd-phone:casestore:view', { view });
}

/** Tells the game the player walked away from the counter. */
export function leaveStore(): void {
    void fetchNui('sd-phone:casestore:close', {});
}

export interface BuyResult { balance: number; equipped: Design | false; owned: Design[]; item: boolean }

/** Buys a design, and puts it on the phone straight away when `wear` is set. With case items it
 *  goes into the inventory (`item`), otherwise onto the list the player keeps. */
export async function buyCase(design: Design, wear: boolean): Promise<Envelope<BuyResult>> {
    if (!isFiveM) {
        const s = devState();
        if (!s.catalog.styles.some(x => x.id === design.style)) return devFail('cases.invalidDesign', 'That case cannot be made');
        const clean = cleanDesign(s.catalog, design);
        if (!s.items && s.owned.length >= s.maxOwned) return devFail('cases.full', 'You can keep {n} cases. Delete one first.', { n: s.maxOwned });
        const price = designPrice(s.catalog, clean);
        if (s.balance < price) return devFail('cases.insufficientFunds', 'Not enough money in the bank');
        s.balance -= price;
        if (!s.items) s.owned.push(clean);
        if (wear && !s.blocked) s.equipped = clean;
        return { success: true, data: copy({ balance: s.balance, equipped: s.equipped, owned: s.owned, item: s.items }) };
    }
    const res = await apiCall<BuyResult>('sd-phone:casestore:buy', { design, wear });
    if (res.success && res.data) {
        res.data.owned = list(res.data.owned);
        res.data.equipped = res.data.equipped || false;
        res.data.item = res.data.item === true;
    }
    return res;
}

/** Hands out the designs bought before cases were items, as items. */
export async function collectCases(): Promise<Envelope<{ owned: Design[]; given: number }>> {
    if (!isFiveM) {
        const s = devState();
        const given = s.owned.length;
        s.owned = [];
        return { success: true, data: { owned: [], given } };
    }
    const res = await apiCall<{ owned: Design[]; given: number }>('sd-phone:casestore:collect', {});
    if (res.success && res.data) res.data.owned = list(res.data.owned);
    return res;
}

/** Puts on owned[index - 1] (the server counts from 1), or takes the case off with null. */
export async function equipCase(index: number | null): Promise<Envelope<{ equipped: Design | false }>> {
    if (!isFiveM) {
        const s = devState();
        const design = index === null ? false : s.owned[index - 1];
        if (design === undefined) return devFail('cases.notOwned', 'You do not own that case');
        if (design && s.blocked) return devFail('cases.buyBlocked', 'This phone cannot wear a case');
        s.equipped = design;
        return { success: true, data: copy({ equipped: s.equipped }) };
    }
    const res = await apiCall<{ equipped: Design | false }>('sd-phone:casestore:equip', { index });
    if (res.success && res.data) res.data.equipped = res.data.equipped || false;
    return res;
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
    const res = await apiCall<{ owned: Design[]; equipped: Design | false }>('sd-phone:casestore:remove', { index });
    if (res.success && res.data) {
        res.data.owned = list(res.data.owned);
        res.data.equipped = res.data.equipped || false;
    }
    return res;
}

/** Sets the logo and trims of the player's own phone from a case store's Phone tab. It is free and
 *  applies at once: the game rebuilds the phone on the counter. false goes back to the server's
 *  default phone. */
export async function stylePhone(style: PhoneStyle | false): Promise<Envelope<PhoneOptions>> {
    if (!isFiveM) {
        const s = devState();
        s.phone = { ...s.phone, style };
        return { success: true, data: copy(s.phone) };
    }
    const res = await apiCall<PhoneOptions>('sd-phone:casestore:style', { style });
    if (res.success && res.data) res.data = phoneOptions(res.data);
    return res;
}

export async function fetchPhonePage(): Promise<Envelope<PhonePage>> {
    if (!isFiveM) {
        const s = devState();
        return { success: true, data: copy({ equipped: s.equipped, frame: s.frame, blocked: s.blocked, items: s.items, catalog: s.catalog, body: s.body, look: s.look }) };
    }
    const res = await apiCall<PhonePage>('sd-phone:cases:phone', {});
    const d = res.data;
    if (res.success && d) {
        d.equipped = d.equipped || false;
        d.frame = typeof d.frame === 'string' ? d.frame : '';
        d.blocked = d.blocked === true;
        d.items = d.items === true;
        d.catalog = readCatalog(d.catalog);
        d.body = asBody(d.body);
        d.look = asLook(d.look);
    }
    return res;
}

/** Takes the case off the phone: back into the pockets as an item, or onto the kept list. */
export async function takeOffCase(): Promise<Envelope<{ equipped: false }>> {
    if (!isFiveM) {
        devState().equipped = false;
        return { success: true, data: { equipped: false } };
    }
    return apiCall<{ equipped: false }>('sd-phone:cases:takeoff', {});
}
