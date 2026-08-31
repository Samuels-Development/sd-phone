import { ChefHat, Croissant, Factory, Flame, Hand, Landmark, MousePointer2, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { t } from '@/i18n';
import { readJson, writeJson } from '@/lib/storage';


type UpgradeKind = 'click' | 'cps';

export interface Upgrade {
    id:       string;
    name:     string;
    blurb:    string;
    kind:     UpgradeKind;
    baseCost: number;
    inc:      number;
    scale:    number;
    icon:     LucideIcon;
}

export function getUpgrades(): Upgrade[] {
    return [
        { id: 'cursor',  name: t('cookie.upCursorName', 'Auto Cursor'),       blurb: t('cookie.upCursorBlurb', 'Taps the cookie for you'), kind: 'cps',   baseCost: 15,       inc: 0.2,  scale: 1.15, icon: MousePointer2 },
        { id: 'finger',  name: t('cookie.upFingerName', 'Reinforced Finger'), blurb: t('cookie.upFingerBlurb', '+1 per tap'),              kind: 'click', baseCost: 50,       inc: 1,    scale: 1.3,  icon: Hand },
        { id: 'grandma', name: t('cookie.upGrandmaName', 'Grandma'),          blurb: t('cookie.upGrandmaBlurb', 'Bakes with love'),        kind: 'cps',   baseCost: 120,      inc: 1.2,  scale: 1.15, icon: ChefHat },
        { id: 'oven',    name: t('cookie.upOvenName', 'Oven'),                blurb: t('cookie.upOvenBlurb', 'Fresh batches, always'),     kind: 'cps',   baseCost: 1_100,    inc: 9,    scale: 1.15, icon: Flame },
        { id: 'spatula', name: t('cookie.upSpatulaName', 'Golden Spatula'),   blurb: t('cookie.upSpatulaBlurb', '+8 per tap'),             kind: 'click', baseCost: 9_000,    inc: 8,    scale: 1.4,  icon: Sparkles },
        { id: 'bakery',  name: t('cookie.upBakeryName', 'Bakery'),            blurb: t('cookie.upBakeryBlurb', 'A whole shop of dough'),   kind: 'cps',   baseCost: 13_000,   inc: 52,   scale: 1.15, icon: Croissant },
        { id: 'factory', name: t('cookie.upFactoryName', 'Factory'),          blurb: t('cookie.upFactoryBlurb', 'Mass production'),        kind: 'cps',   baseCost: 150_000,  inc: 290,  scale: 1.15, icon: Factory },
        { id: 'bank',    name: t('cookie.upBankName', 'Cookie Bank'),         blurb: t('cookie.upBankBlurb', 'Cookies earn cookies'),      kind: 'cps',   baseCost: 1_700_000, inc: 1_500, scale: 1.15, icon: Landmark },
    ];
}

export function costOf(u: Upgrade, owned: number): number {
    return Math.ceil(u.baseCost * Math.pow(u.scale, owned));
}

export function deriveStats(owned: Record<string, number>): { clickPower: number; cps: number } {
    let clickPower = 1;
    let cps = 0;
    for (const u of getUpgrades()) {
        const n = owned[u.id] ?? 0;
        if (!n) continue;
        if (u.kind === 'click') clickPower += u.inc * n;
        else                    cps        += u.inc * n;
    }
    return { clickPower, cps };
}


interface AchCtx {
    earned:     number;
    cps:        number;
    clickPower: number;
    owned:      Record<string, number>;
}

export interface Achievement {
    id:   string;
    name: string;
    desc: string;
    test: (s: AchCtx) => boolean;
}

const earnedAt = (n: number) => (s: AchCtx) => s.earned >= n;
const cpsAt    = (n: number) => (s: AchCtx) => s.cps >= n;
const clickAt  = (n: number) => (s: AchCtx) => s.clickPower >= n;
const ownAt    = (id: string, n: number) => (s: AchCtx) => (s.owned[id] ?? 0) >= n;

export const getAchievements = (): Achievement[] => [
    { id: 'a100',  name: t('cookie.achA100Name', 'Crumbs'),        desc: t('cookie.achA100Desc', 'Bake 100 cookies'),   test: earnedAt(100) },
    { id: 'a1k',   name: t('cookie.achA1kName', 'Snack Time'),     desc: t('cookie.achA1kDesc', 'Bake 1K cookies'),     test: earnedAt(1_000) },
    { id: 'a10k',  name: t('cookie.achA10kName', 'Cookie Jar'),    desc: t('cookie.achA10kDesc', 'Bake 10K cookies'),   test: earnedAt(10_000) },
    { id: 'a100k', name: t('cookie.achA100kName', 'Bakery Boss'),  desc: t('cookie.achA100kDesc', 'Bake 100K cookies'), test: earnedAt(100_000) },
    { id: 'a1m',   name: t('cookie.achA1mName', 'Cookie Tycoon'),  desc: t('cookie.achA1mDesc', 'Bake 1M cookies'),     test: earnedAt(1_000_000) },
    { id: 'a10m',  name: t('cookie.achA10mName', 'Crumb Empire'),  desc: t('cookie.achA10mDesc', 'Bake 10M cookies'),   test: earnedAt(10_000_000) },
    { id: 'cps5',   name: t('cookie.achCps5Name', 'Warming Up'),     desc: t('cookie.achCps5Desc', 'Reach 5 / second'),    test: cpsAt(5) },
    { id: 'cps50',  name: t('cookie.achCps50Name', 'Conveyor Belt'), desc: t('cookie.achCps50Desc', 'Reach 50 / second'),  test: cpsAt(50) },
    { id: 'cps500', name: t('cookie.achCps500Name', 'Cookie Factory'), desc: t('cookie.achCps500Desc', 'Reach 500 / second'), test: cpsAt(500) },
    { id: 'cps5k',  name: t('cookie.achCps5kName', 'Industrial Oven'), desc: t('cookie.achCps5kDesc', 'Reach 5K / second'),  test: cpsAt(5_000) },
    { id: 'clk10', name: t('cookie.achClk10Name', 'Heavy Hand'),   desc: t('cookie.achClk10Desc', 'Reach 10 per tap'), test: clickAt(10) },
    { id: 'clk50', name: t('cookie.achClk50Name', 'Power Tapper'), desc: t('cookie.achClk50Desc', 'Reach 50 per tap'), test: clickAt(50) },
    { id: 'cur25',  name: t('cookie.achCur25Name', 'Cursor Swarm'),  desc: t('cookie.achCur25Desc', 'Own 25 Auto Cursors'), test: ownAt('cursor', 25) },
    { id: 'gran10', name: t('cookie.achGran10Name', "Granny's Army"), desc: t('cookie.achGran10Desc', 'Own 10 Grandmas'),     test: ownAt('grandma', 10) },
    { id: 'allup',  name: t('cookie.achAllupName', 'Fully Stocked'), desc: t('cookie.achAllupDesc', 'Own every upgrade'),   test: s => getUpgrades().every(u => (s.owned[u.id] ?? 0) >= 1) },
    { id: 'a100m', name: t('cookie.achA100mName', 'Crumb Galaxy'), desc: t('cookie.achA100mDesc', 'Bake 100M cookies'), test: earnedAt(100_000_000) },
    { id: 'a1b',   name: t('cookie.achA1bName', 'Cookie Deity'), desc: t('cookie.achA1bDesc', 'Bake 1B cookies'),   test: earnedAt(1_000_000_000) },
    { id: 'cps50k', name: t('cookie.achCps50kName', 'Singularity'),   desc: t('cookie.achCps50kDesc', 'Reach 50K / second'), test: cpsAt(50_000) },
    { id: 'clk250', name: t('cookie.achClk250Name', 'Cookie Crusher'), desc: t('cookie.achClk250Desc', 'Reach 250 per tap'), test: clickAt(250) },
    { id: 'cur50',  name: t('cookie.achCur50Name', 'Cursor Storm'),  desc: t('cookie.achCur50Desc', 'Own 50 Auto Cursors'), test: ownAt('cursor', 50) },
    { id: 'oven10', name: t('cookie.achOven10Name', 'Toasty'),        desc: t('cookie.achOven10Desc', 'Own 10 Ovens'),        test: ownAt('oven', 10) },
    { id: 'bake10', name: t('cookie.achBake10Name', 'Franchise'),     desc: t('cookie.achBake10Desc', 'Own 10 Bakeries'),     test: ownAt('bakery', 10) },
    { id: 'fact5',  name: t('cookie.achFact5Name', 'Industrialist'), desc: t('cookie.achFact5Desc', 'Own 5 Factories'),     test: ownAt('factory', 5) },
    { id: 'bank3',  name: t('cookie.achBank3Name', 'Investor'),      desc: t('cookie.achBank3Desc', 'Own 3 Cookie Banks'),  test: ownAt('bank', 3) },
    { id: 'allup5', name: t('cookie.achAllup5Name', 'Mass Producer'), desc: t('cookie.achAllup5Desc', 'Own 5 of every upgrade'), test: s => getUpgrades().every(u => (s.owned[u.id] ?? 0) >= 5) },
];

const SUFFIXES = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];

export function fmt(n: number): string {
    if (n < 1000) return Math.floor(n).toString();
    let v = n;
    let i = -1;
    while (v >= 1000 && i < SUFFIXES.length - 1) { v /= 1000; i++; }
    return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v).toString()) + SUFFIXES[i];
}

export function fmtRate(n: number): string {
    if (n < 100) return (Math.round(n * 10) / 10).toString();
    return fmt(n);
}

export interface SaveState {
    cookies:      number;
    earned:       number;
    owned:        Record<string, number>;
    achievements: string[];
    rainOn:       boolean;
}


export interface LeaderRow { name: string; cookies: number; you?: boolean; }

const MOCK_RIVALS: LeaderRow[] = [
    { name: 'Cookie Kang',  cookies: 184_000_000 },
    { name: 'DoughLord',    cookies: 92_500_000 },
    { name: 'ChipWizard',   cookies: 41_200_000 },
    { name: 'Crumbelina',   cookies: 18_900_000 },
    { name: 'BakeRunner',   cookies: 7_350_000 },
    { name: 'SugarRush99',  cookies: 2_140_000 },
    { name: 'MilkDipper',   cookies: 880_000 },
    { name: 'NomNom',       cookies: 305_000 },
    { name: 'TinyBaker',    cookies: 96_000 },
    { name: 'FreshDough',   cookies: 24_500 },
    { name: 'CrumbCollector', cookies: 5_200 },
    { name: 'NewKid',       cookies: 410 },
];

export function rankWithYou(rivals: LeaderRow[], earned: number, youName = t('cookie.you', 'You')): LeaderRow[] {
    return [...rivals, { name: youName, cookies: Math.floor(earned), you: true }]
        .sort((a, b) => b.cookies - a.cookies);
}

export function leaderboard(earned: number): LeaderRow[] {
    return rankWithYou(MOCK_RIVALS, earned);
}

const KEY = 'sd-phone:cookie:v1';

export const EMPTY_SAVE: SaveState = { cookies: 0, earned: 0, owned: {}, achievements: [], rainOn: true };

export function normalizeSave(p: Partial<SaveState> | null | undefined): SaveState {
    if (!p || typeof p.cookies !== 'number') return { ...EMPTY_SAVE };
    const owned = (p.owned && typeof p.owned === 'object' && !Array.isArray(p.owned))
        ? p.owned as Record<string, number> : {};
    return {
        cookies:      p.cookies,
        earned:       typeof p.earned === 'number' ? p.earned : p.cookies,
        owned,
        achievements: Array.isArray(p.achievements) ? p.achievements : [],
        rainOn:       p.rainOn !== false, // default on
    };
}

export function loadGame(): SaveState {
    return normalizeSave(readJson<Partial<SaveState>>(KEY));
}

export function saveGame(s: SaveState): void {
    writeJson(KEY, s);
}
