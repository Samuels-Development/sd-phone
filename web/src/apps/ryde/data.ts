
import { t } from '@/i18n';
import { useMocks } from '@/core/demo';
import { readJson, writeJson } from '@/lib/storage';
import { newId } from '@/lib/format';

export interface Place {
    id:   string;
    name: string;
    sub:  string;
    x:    number;
    y:    number;
}

interface Tier {
    id:    string;
    name:  string;
    desc:  string;
    emoji: string;
    seats: number;
    mult:  number;
    etaAdd: number;
}

const TIERS: Tier[] = [
    { id: 'x',       name: 'RydeX',     desc: 'Affordable everyday rides',    emoji: '🚗', seats: 4, mult: 1.0, etaAdd: 0 },
    { id: 'comfort', name: 'Comfort',   desc: 'Newer cars, more legroom',     emoji: '🚙', seats: 4, mult: 1.35, etaAdd: 1 },
    { id: 'xl',      name: 'RydeXL',    desc: 'Affordable rides for groups',  emoji: '🚐', seats: 6, mult: 1.75, etaAdd: 2 },
    { id: 'black',   name: 'Black',     desc: 'Premium rides in luxury cars', emoji: '🚘', seats: 4, mult: 2.4, etaAdd: 1 },
];

export type RideStatus =
    | 'finding' | 'offered' | 'enroute_pickup' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';

export function getRideStatusLabel(): Record<RideStatus, string> {
    return {
        finding: t('ryde.statusFinding', 'Finding a nearby driver…'),
        offered: t('ryde.statusOffered', 'Fare offered'),
        enroute_pickup: t('ryde.statusEnroutePickup', 'Driver on the way'),
        arriving: t('ryde.statusArriving', 'Driver is arriving'),
        in_progress: t('ryde.statusInProgress', 'On trip'),
        completed: t('ryde.statusCompleted', 'Completed'),
        cancelled: t('ryde.statusCancelled', 'Cancelled'),
    };
}

export interface DriverInfo {
    name:    string;
    car:     string;
    plate:   string;
    color:   string;
    rating:  number;
    number?: string;
}

export interface RideOffer {
    tripId: string;
    fare:   number;
    driver: DriverInfo;
}

export interface Ride {
    id:       string;
    role:     'rider' | 'driver';
    tripId?:  string;
    tierId?:   string;
    tierName?: string;
    pickup:   Place;
    dropoff:  Place;
    distanceKm: number;
    durationMin: number;
    fare:     number;
    payment:  'card' | 'cash';
    status:   RideStatus;
    driver?:  DriverInfo;
    offers?:  RideOffer[];
    riderName?: string;
    riderNumber?: string;
    placedAt: number;
    etaMin:   number;
    tip?:     number;
    rated?:   number;
    earn?:    number;
}

export interface DriverProfile {
    enabled:  boolean;
    online:   boolean;
    car:      string;
    plate:    string;
    color:    string;
    rating:   number;
    ratingCount: number;
    trips:    number;
    earningsTotal: number;
    onlineSince?: number;
}

export interface RyderState {
    payment:  'card' | 'cash';
    home?:    Place;
    work?:    Place;
}

const BASE = 2.5, PER_KM = 1.35, PER_MIN = 0.22, MIN_FARE = 5, BOOKING = 1.5;

export function distanceKm(a: Place, b: Place): number {
    return Math.hypot(a.x - b.x, a.y - b.y) / 1000;
}
function quote(a: Place, b: Place, tier: Tier): { km: number; min: number; fare: number; eta: number } {
    const km = distanceKm(a, b);
    const min = Math.max(3, Math.round(km * 2.4));
    const fare = Math.max(MIN_FARE, (BASE + BOOKING + km * PER_KM + min * PER_MIN) * tier.mult);
    const eta = 2 + tier.etaAdd + Math.round(km * 0.4);
    return { km, min, fare: Math.round(fare * 100) / 100, eta };
}

export function suggestFare(km: number): number {
    return Math.max(MIN_FARE, Math.round(BASE + BOOKING + km * 2.2));
}

export function money(n: number): string { return '$' + (Number(n) || 0).toFixed(2); }
export { newId };

export const DRIVERS: DriverInfo[] = [
    { name: 'Marcus T.',  car: 'Declasse Asea',    plate: 'LSX 4421', color: '#3b82f6', rating: 4.9, number: '5550142' },
    { name: 'Priya S.',   car: 'Karin Dilettante', plate: '88 KMA 2', color: '#22c55e', rating: 4.8, number: '5550188' },
    { name: 'Dmitri V.',  car: 'Vapid Stanier',    plate: 'NORTH 19', color: '#ef4444', rating: 4.7, number: '5550173' },
    { name: 'Lena W.',    car: 'Übermacht Oracle',  plate: 'CMF 0093', color: '#a855f7', rating: 5.0, number: '5550109' },
    { name: 'Carlos M.',  car: 'Cheval Fugitive',  plate: 'VESP 771', color: '#f59e0b', rating: 4.9, number: '5550155' },
];
export const RIDER_NAMES = ['Jordan', 'Aaliyah', 'Mike', 'Sofia', 'Ethan', 'Noor', 'Liam', 'Chloe'];

export interface LeaderEntry { name: string; rating: number; trips: number; color: string; username?: string }

export function leaderScore(rating: number, trips: number, prior = 4.5, weight = 10): number {
    return (rating * trips + prior * weight) / (trips + weight);
}
export const LEADERBOARD: LeaderEntry[] = [
    { name: 'Lena W.',   rating: 5.00, trips: 1842, color: '#a855f7' },
    { name: 'Marcus T.', rating: 4.99, trips: 1610, color: '#3b82f6' },
    { name: 'Priya S.',  rating: 4.98, trips: 1387, color: '#22c55e' },
    { name: 'Carlos M.', rating: 4.97, trips: 1255, color: '#f59e0b' },
    { name: 'Yuki N.',   rating: 4.96, trips: 1190, color: '#ef4444' },
    { name: 'Dmitri V.', rating: 4.95, trips: 1098, color: '#14b8a6' },
    { name: 'Amara O.',  rating: 4.94, trips: 980,  color: '#ec4899' },
    { name: 'Sven H.',   rating: 4.93, trips: 902,  color: '#6366f1' },
    { name: 'Rosa G.',   rating: 4.92, trips: 845,  color: '#f97316' },
    { name: 'Tariq B.',  rating: 4.91, trips: 790,  color: '#0ea5e9' },
    { name: 'Mei L.',    rating: 4.90, trips: 712,  color: '#8b5cf6' },
    { name: 'Owen K.',   rating: 4.89, trips: 655,  color: '#10b981' },
    { name: 'Bianca R.', rating: 4.88, trips: 601,  color: '#e11d48' },
    { name: 'Felix A.',  rating: 4.87, trips: 540,  color: '#2563eb' },
];
export const CAR_COLORS = ['#111', '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#fff'];

export const PLACES: Place[] = [
    { id: 'legion',   name: 'Legion Square',          sub: 'Downtown Los Santos',  x: 195,   y: -930 },
    { id: 'airport',  name: 'Los Santos Intl Airport', sub: 'LSIA, Terminal 1',     x: -1037, y: -2738 },
    { id: 'pier',     name: 'Del Perro Pier',         sub: 'Del Perro Beach',      x: -1850, y: -1240 },
    { id: 'arena',    name: 'Maze Bank Arena',        sub: 'La Puerta',            x: -250,  y: -2030 },
    { id: 'vinewood', name: 'Vinewood Sign',          sub: 'Vinewood Hills',       x: 720,   y: 1200 },
    { id: 'vespucci', name: 'Vespucci Beach',         sub: 'Vespucci',             x: -1230, y: -1490 },
    { id: 'sandy',    name: 'Sandy Shores',           sub: 'Blaine County',        x: 1960,  y: 3740 },
    { id: 'paleto',   name: 'Paleto Bay',             sub: 'North Blaine County',  x: -160,  y: 6360 },
    { id: 'mirror',   name: 'Mirror Park',            sub: 'East Los Santos',      x: 1140,  y: -645 },
    { id: 'casino',   name: 'Diamond Casino',         sub: 'East Vinewood',        x: 925,   y: 46 },
];

export function getDefaultPickup(): Place {
    return { id: 'cur', name: t('ryde.currentLocation', 'Current location'), sub: t('ryde.yourLocation', 'Your location'), x: 230, y: -870 };
}

const RIDES_KEY = 'sd-phone:ryde:rides:v1';
const DRV_KEY   = 'sd-phone:ryde:driver:v1';
const ST_KEY    = 'sd-phone:ryde:state:v1';
const NOSEED_KEY = 'sd-phone:ryde:devNoSeed';

export function ryDevDataHidden(): boolean {
    try { return localStorage.getItem(NOSEED_KEY) === '1'; } catch { return false; }
}
export function ryDevToggleData(): boolean {
    const hide = !ryDevDataHidden();
    try {
        if (hide) localStorage.setItem(NOSEED_KEY, '1'); else localStorage.removeItem(NOSEED_KEY);
        localStorage.removeItem(RIDES_KEY);
    } catch { /* */ }
    return hide;
}

function seedRides(): Ride[] {
    const HOUR = 3_600_000;
    const place = (id: string): Place => (id === 'cur' ? getDefaultPickup() : PLACES.find(p => p.id === id)!);
    const specs: { from: string; to: string; tier: string; status: RideStatus; hrs: number; pay: 'card' | 'cash'; rated?: number; tip?: number; driver?: number }[] = [
        { from: 'cur',      to: 'airport',  tier: 'black',   status: 'completed', hrs: 3,   pay: 'card', rated: 5, tip: 5,  driver: 3 },
        { from: 'cur',      to: 'legion',   tier: 'x',       status: 'completed', hrs: 27,  pay: 'cash', rated: 4,          driver: 0 },
        { from: 'mirror',   to: 'casino',   tier: 'comfort', status: 'completed', hrs: 51,  pay: 'card', rated: 5, tip: 3,  driver: 1 },
        { from: 'cur',      to: 'pier',     tier: 'x',       status: 'cancelled', hrs: 74,  pay: 'card' },
        { from: 'vespucci', to: 'arena',    tier: 'xl',      status: 'completed', hrs: 99,  pay: 'card', rated: 4,          driver: 2 },
        { from: 'cur',      to: 'vinewood', tier: 'comfort', status: 'completed', hrs: 121, pay: 'cash', rated: 5, tip: 4,  driver: 4 },
        { from: 'casino',   to: 'cur',      tier: 'x',       status: 'completed', hrs: 150, pay: 'card', rated: 5,          driver: 0 },
        { from: 'cur',      to: 'sandy',    tier: 'black',   status: 'completed', hrs: 200, pay: 'card', rated: 5, tip: 10, driver: 3 },
        { from: 'cur',      to: 'mirror',   tier: 'x',       status: 'cancelled', hrs: 240, pay: 'cash' },
        { from: 'pier',     to: 'paleto',   tier: 'xl',      status: 'completed', hrs: 280, pay: 'card', rated: 4, tip: 2,  driver: 1 },
    ];
    const now = Date.now();
    const rider = specs.map((s): Ride => {
        const a = place(s.from), b = place(s.to);
        const tier = TIERS.find(t => t.id === s.tier)!;
        const q = quote(a, b, tier);
        const tip = s.tip ?? 0;
        return {
            id: newId('seed'),
            role: 'rider',
            tierId: tier.id, tierName: tier.name,
            pickup: a, dropoff: b,
            distanceKm: q.km, durationMin: q.min,
            fare: Math.round((q.fare + tip) * 100) / 100,
            payment: s.pay,
            status: s.status,
            driver: s.driver != null ? DRIVERS[s.driver] : undefined,
            placedAt: now - s.hrs * HOUR,
            etaMin: q.eta,
            tip: tip || undefined,
            rated: s.rated,
        };
    });

    const driverSpecs: { from: string; to: string; tier: string; hrs: number; rider: number; rated?: number; tip?: number }[] = [
        { from: 'legion',   to: 'vinewood', tier: 'comfort', hrs: 1,   rider: 0 },                       // recent — rider hasn't rated yet
        { from: 'airport',  to: 'mirror',   tier: 'x',       hrs: 5,   rider: 2, rated: 5, tip: 5 },
        { from: 'arena',    to: 'casino',   tier: 'black',   hrs: 23,  rider: 4, rated: 5, tip: 10 },
        { from: 'pier',     to: 'legion',   tier: 'x',       hrs: 49,  rider: 1, rated: 4 },
        { from: 'vespucci', to: 'sandy',    tier: 'xl',      hrs: 78,  rider: 3, rated: 5, tip: 3 },
        { from: 'mirror',   to: 'airport',  tier: 'comfort', hrs: 103, rider: 5, rated: 4 },
        { from: 'casino',   to: 'paleto',   tier: 'black',   hrs: 147, rider: 6, rated: 5, tip: 2 },
        { from: 'legion',   to: 'vespucci', tier: 'x',       hrs: 199, rider: 7, rated: 3 },
    ];
    const driver = driverSpecs.map((s): Ride => {
        const a = place(s.from), b = place(s.to);
        const tier = TIERS.find(t => t.id === s.tier)!;
        const q = quote(a, b, tier);
        return {
            id: newId('seed'),
            role: 'driver',
            tierId: tier.id, tierName: tier.name,
            pickup: a, dropoff: b,
            distanceKm: q.km, durationMin: q.min,
            fare: q.fare,
            payment: 'card',
            status: 'completed',
            riderName: RIDER_NAMES[s.rider % RIDER_NAMES.length],
            placedAt: now - s.hrs * HOUR,
            etaMin: q.eta,
            earn: q.fare,            // whole fare (DriverCut 1.0) — no phantom client cut
            rated: s.rated,
            tip: s.tip,
        };
    });

    return [...rider, ...driver];
}

function numifyRide(r: Ride): Ride {
    return {
        ...r,
        fare: Number(r.fare) || 0,
        ...(r.earn != null ? { earn: Number(r.earn) || 0 } : {}),
        ...(r.tip  != null ? { tip:  Number(r.tip)  || 0 } : {}),
    };
}

export function loadRides(): Ride[] {
    const raw = readJson<Ride[]>(RIDES_KEY, p => Array.isArray(p) && p.length > 0);
    if (raw) return raw.map(numifyRide);
    if (useMocks && !ryDevDataHidden()) { const seed = seedRides(); saveRides(seed); return seed; }
    return [];
}
export function saveRides(r: Ride[]): void { writeJson(RIDES_KEY, r); }

export const DEFAULT_DRIVER: DriverProfile = { enabled: false, online: false, car: '', plate: '', color: '#111', rating: 5, ratingCount: 0, trips: 0, earningsTotal: 0 };

export function loadDriver(): DriverProfile {
    const r = readJson<DriverProfile>(DRV_KEY);
    if (r) return r;
    if (useMocks) {
        return { enabled: true, online: false, car: 'Karin Sultan', plate: '12 ABC 34', color: '#111', rating: 4.92, ratingCount: 138, trips: 8, earningsTotal: 0 };
    }
    return { ...DEFAULT_DRIVER };
}
export function saveDriver(d: DriverProfile): void { writeJson(DRV_KEY, d); }

export function clearRydeData(): void {
    try {
        localStorage.removeItem(RIDES_KEY);
        localStorage.removeItem(DRV_KEY);
        localStorage.removeItem(ST_KEY);
    } catch { /* */ }
}

export function loadState(): RyderState {
    return readJson<RyderState>(ST_KEY) ?? { payment: 'card' };
}
export function saveState(s: RyderState): void { writeJson(ST_KEY, s); }

export function resetLiveState(): void {
    const d = readJson<DriverProfile>(DRV_KEY);
    if (d?.online) writeJson(DRV_KEY, { ...d, online: false, onlineSince: undefined });

    const arr = readJson<Ride[]>(RIDES_KEY);
    if (!arr) return;
    const preTrip = ['finding', 'offered'];
    const inTrip  = ['enroute_pickup', 'arriving', 'in_progress'];
    let changed = false;
    const next = arr
        .filter(r => { if (preTrip.includes(r.status)) { changed = true; return false; } return true; })
        .map(r => { if (inTrip.includes(r.status)) { changed = true; return { ...r, status: 'cancelled' as RideStatus }; } return r; });
    if (changed) writeJson(RIDES_KEY, next);
}

export function startOfToday(): number { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
