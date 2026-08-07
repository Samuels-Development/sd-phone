import { apiCall, apiData, type Envelope } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import {
    DEFAULT_HUD,
    DEFAULT_LIMITS,
    RANKS_PER_PAGE,
    TRACKS_PER_PAGE,
    emptyPage,
    routeLengthMetres,
    type AdminTrackRow,
    type Coords,
    type HudSettings,
    type Page,
    type PastRace,
    type Race,
    type RaceClass,
    type RaceMode,
    type RaceSetupDraft,
    type RaceStatus,
    type RacerProfile,
    type RacingBootstrap,
    type RankRow,
    type RoutePoint,
    type Standing,
    type TrackDetail,
    type TrackFlag,
    type TrackRecord,
    type TrackRow,
    type TrackSort,
} from './data';

const DAY = 86400;
const nowSec = Math.floor(Date.now() / 1000);

const DEV_CLASSES: RacingBootstrap['classes'] = {
    D: { level: 1,  label: 'Rookie',  color: '#9ca3af' },
    C: { level: 1,  label: 'Amateur', color: '#4ade80' },
    B: { level: 5,  label: 'Pro',     color: '#60a5fa' },
    A: { level: 15, label: 'Elite',   color: '#c084fc' },
    S: { level: 25, label: 'Legend',  color: '#fbbf24' },
};

const DEV_GATE_WIDTH = 12;

function devNoise(seed: number): number {
    const spun = Math.sin(seed * 12.9898) * 43758.5453;
    return spun - Math.floor(spun);
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function pts(raw: number[][]): Coords[] {
    return raw.map(([x, y, z]) => ({ x, y, z }));
}

function devLoop(anchor: Coords, gates: number, radius: number, seed: number): Coords[] {
    const path: Coords[] = [];
    for (let i = 0; i < gates; i++) {
        const angle = (i / gates) * Math.PI * 2;
        const wobble = 0.72 + devNoise(seed + i) * 0.56;
        path.push({
            x: round1(anchor.x + Math.cos(angle) * radius * wobble),
            y: round1(anchor.y + Math.sin(angle) * radius * wobble * 0.82),
            z: round1(Math.max(2, anchor.z + (devNoise(seed + i * 3) - 0.4) * 9)),
        });
    }
    path.push({ ...path[0] });
    return path;
}

function devRun(anchor: Coords, gates: number, stride: number, seed: number): Coords[] {
    const path: Coords[] = [];
    let heading = devNoise(seed) * Math.PI * 2;
    let x = anchor.x;
    let y = anchor.y;
    let z = anchor.z;
    for (let i = 0; i < gates; i++) {
        path.push({ x: round1(x), y: round1(y), z: round1(Math.max(2, z)) });
        heading += (devNoise(seed + i * 5) - 0.5) * 0.85;
        x += Math.cos(heading) * stride;
        y += Math.sin(heading) * stride;
        z += (devNoise(seed + i * 11) - 0.4) * 9;
    }
    return path;
}

function devRoute(path: Coords[]): RoutePoint[] {
    return path.map((point, i) => {
        const ahead = path[i + 1 < path.length ? i + 1 : Math.max(0, i - 1)];
        const dx = ahead.x - point.x;
        const dy = ahead.y - point.y;
        const span = Math.hypot(dx, dy) || 1;
        const nx = (-dy / span) * (DEV_GATE_WIDTH / 2);
        const ny = (dx / span) * (DEV_GATE_WIDTH / 2);
        return {
            x: point.x, y: point.y, z: point.z,
            ax: round1(point.x + nx), ay: round1(point.y + ny), az: point.z,
            bx: round1(point.x - nx), by: round1(point.y - ny), bz: point.z,
        };
    });
}

interface TrackSeed {
    id:        number;
    name:      string;
    author:    string;
    mode:      RaceMode;
    verified:  boolean;
    featured:  boolean;
    published: boolean;
    ageDays:   number;
    plays:     number;
    path:      Coords[];
}

const DEV_TRACK_SEEDS: TrackSeed[] = [
    {
        id: 1, name: 'Vinewood Hills Descent', author: 'Dana Whitlock', mode: 'sprint',
        verified: true, featured: true, published: true, ageDays: 74, plays: 486,
        path: pts([
            [-170, 1150, 320], [-30, 1020, 302], [120, 900, 281], [290, 780, 249],
            [420, 620, 208], [480, 430, 168], [430, 260, 121], [330, 120, 95],
            [220, -20, 78], [120, -150, 62],
        ]),
    },
    {
        id: 2, name: 'Del Perro Freeway Loop', author: 'Marcus Kerrigan', mode: 'circuit',
        verified: true, featured: true, published: true, ageDays: 51, plays: 402,
        path: pts([
            [-1600, -320, 45], [-1420, -580, 35], [-1180, -820, 15], [-940, -1080, 5],
            [-1080, -1300, 5], [-1360, -1180, 4], [-1580, -930, 13], [-1720, -680, 20],
            [-1660, -430, 40], [-1600, -320, 45],
        ]),
    },
    {
        id: 3, name: 'Port of LS Container Circuit', author: 'Priya Odenkirk', mode: 'circuit',
        verified: true, featured: false, published: true, ageDays: 39, plays: 351,
        path: pts([
            [830, -2960, 6], [1080, -2870, 6], [1200, -2650, 6], [1080, -2420, 6],
            [830, -2350, 6], [610, -2480, 6], [560, -2720, 6], [680, -2910, 6],
            [830, -2960, 6],
        ]),
    },
    {
        id: 4, name: 'Sandy Shores Dust Run', author: 'Ruth Tillman', mode: 'sprint',
        verified: true, featured: false, published: true, ageDays: 88, plays: 297,
        path: pts([
            [1380, 3600, 35], [1600, 3520, 35], [1830, 3620, 34], [2020, 3780, 32],
            [2180, 3960, 33], [2340, 4180, 40], [2450, 4420, 39], [2520, 4680, 41],
        ]),
    },
    {
        id: 5, name: 'Mount Chiliad Ascent', author: 'Andre Garcia', mode: 'sprint',
        verified: true, featured: true, published: true, ageDays: 27, plays: 264,
        path: pts([
            [-180, 4020, 60], [-260, 4250, 112], [-400, 4480, 173], [-520, 4700, 241],
            [-620, 4930, 318], [-700, 5180, 421], [-760, 5420, 529], [-820, 5620, 618],
        ]),
    },
    {
        id: 6, name: 'Downtown Underpass GP', author: 'Miles Okafor', mode: 'circuit',
        verified: true, featured: false, published: true, ageDays: 16, plays: 233,
        path: pts([
            [210, -880, 30], [380, -740, 30], [480, -520, 32], [400, -300, 40],
            [200, -220, 45], [20, -340, 42], [-40, -560, 38], [60, -790, 32],
            [210, -880, 30],
        ]),
    },
    { id: 7,  name: 'Vespucci Boardwalk Dash',   author: 'Rosa Bianchi',   mode: 'circuit', verified: true,  featured: false, published: true,  ageDays: 12,  plays: 211, path: devLoop({ x: -1180, y: -1420, z: 5 },  11, 250, 7) },
    { id: 8,  name: 'Grapeseed Farm Sprint',     author: 'Theo Alvarez',   mode: 'sprint',  verified: true,  featured: false, published: true,  ageDays: 33,  plays: 188, path: devRun({ x: 2200, y: 4800, z: 40 },   9,  210, 8) },
    { id: 9,  name: 'Paleto Bay Coastal Run',    author: 'Simone Dunphy',  mode: 'sprint',  verified: true,  featured: false, published: true,  ageDays: 44,  plays: 176, path: devRun({ x: -100, y: 6300, z: 30 },   10, 195, 9) },
    { id: 10, name: 'Cypress Flats Industrial',  author: 'Bo Farrier',     mode: 'circuit', verified: true,  featured: false, published: true,  ageDays: 21,  plays: 164, path: devLoop({ x: 950, y: -1900, z: 30 },  10, 235, 10) },
    { id: 11, name: 'Mirror Park Night Loop',    author: 'Dana Whitlock',  mode: 'circuit', verified: true,  featured: false, published: true,  ageDays: 9,   plays: 152, path: devLoop({ x: 1180, y: -520, z: 60 },  9,  225, 11) },
    { id: 12, name: 'La Mesa Rail Yard Blitz',   author: 'Marcus Kerrigan', mode: 'sprint', verified: true,  featured: false, published: true,  ageDays: 58,  plays: 141, path: devRun({ x: 820, y: -1650, z: 30 },   8,  180, 12) },
    { id: 13, name: 'Route 68 Desert Crossing',  author: 'Ruth Tillman',   mode: 'sprint',  verified: true,  featured: false, published: true,  ageDays: 65,  plays: 133, path: devRun({ x: 600, y: 2800, z: 60 },    11, 240, 13) },
    { id: 14, name: 'Chumash Coast Cruise',      author: 'Priya Odenkirk', mode: 'sprint',  verified: true,  featured: false, published: true,  ageDays: 30,  plays: 122, path: devRun({ x: -2900, y: 1500, z: 20 },  10, 205, 14) },
    { id: 15, name: 'Great Ocean Highway North', author: 'Andre Garcia',   mode: 'sprint',  verified: true,  featured: false, published: true,  ageDays: 47,  plays: 114, path: devRun({ x: -2200, y: 3200, z: 30 },  12, 215, 15) },
    { id: 16, name: 'Redwood Lights Circuit',    author: 'Miles Okafor',   mode: 'circuit', verified: true,  featured: false, published: true,  ageDays: 19,  plays: 103, path: devLoop({ x: 900, y: 3200, z: 50 },   10, 265, 16) },
    { id: 17, name: 'Zancudo Airfield Sprint',   author: 'Theo Alvarez',   mode: 'sprint',  verified: false, featured: false, published: true,  ageDays: 7,   plays: 96,  path: devRun({ x: -1800, y: 2900, z: 25 },  9,  225, 17) },
    { id: 18, name: 'Elysian Island Dockyard',   author: 'Rosa Bianchi',   mode: 'circuit', verified: false, featured: false, published: true,  ageDays: 5,   plays: 88,  path: devLoop({ x: 200, y: -2600, z: 8 },   11, 210, 18) },
    { id: 19, name: 'Tataviam Mountain Climb',   author: 'Bo Farrier',     mode: 'sprint',  verified: false, featured: false, published: true,  ageDays: 14,  plays: 74,  path: devRun({ x: 2500, y: 2200, z: 60 },   10, 195, 19) },
    { id: 20, name: 'Pacific Bluffs Sweep',      author: 'Simone Dunphy',  mode: 'circuit', verified: false, featured: false, published: true,  ageDays: 23,  plays: 66,  path: devLoop({ x: -2500, y: 200, z: 20 },  9,  245, 20) },
    { id: 21, name: 'Rockford Hills Nightline',  author: 'Dana Whitlock',  mode: 'circuit', verified: false, featured: false, published: true,  ageDays: 3,   plays: 48,  path: devLoop({ x: -800, y: -200, z: 40 },  10, 230, 21) },
    { id: 22, name: 'Alamo Sea Shoreline',       author: 'Marcus Kerrigan', mode: 'sprint', verified: false, featured: false, published: true,  ageDays: 2,   plays: 31,  path: devRun({ x: 700, y: 3900, z: 30 },    9,  200, 22) },
    { id: 23, name: 'Fort Zancudo Perimeter',    author: 'Theo Alvarez',   mode: 'circuit', verified: false, featured: false, published: false, ageDays: 1,   plays: 6,   path: devLoop({ x: -2300, y: 3300, z: 32 }, 10, 255, 23) },
    { id: 24, name: 'Blaine County Backroads',   author: 'Bo Farrier',     mode: 'sprint',  verified: false, featured: false, published: false, ageDays: 1,   plays: 2,   path: devRun({ x: 1600, y: 2500, z: 60 },   12, 230, 24) },
];

interface DevTrack extends TrackSeed {
    route:     RoutePoint[];
    lengthM:   number;
    createdAt: number;
}

let DEV_TRACKS: DevTrack[] = DEV_TRACK_SEEDS.map(seed => {
    const route = devRoute(seed.path);
    return { ...seed, route, lengthM: Math.round(routeLengthMetres(route)), createdAt: nowSec - seed.ageDays * DAY };
});

function devTrackById(id: number): DevTrack | undefined {
    return DEV_TRACKS.find(track => track.id === id);
}

function devTrackRow(track: DevTrack): TrackRow {
    return {
        id: track.id,
        name: track.name,
        author: track.author,
        mode: track.mode,
        gates: track.path.length,
        plays: track.plays,
        verified: track.verified,
        featured: track.featured,
        coords: { ...track.path[0] },
    };
}

function devAdminRow(track: DevTrack): AdminTrackRow {
    return { ...devTrackRow(track), published: track.published, createdAt: track.createdAt };
}

const DEV_VEHICLES: { label: string; class: RaceClass }[] = [
    { label: 'Adder',          class: 'S' },
    { label: 'Zentorno',       class: 'S' },
    { label: 'Emerus',         class: 'S' },
    { label: 'Comet',          class: 'A' },
    { label: 'Itali RSX',      class: 'A' },
    { label: '9F',             class: 'A' },
    { label: 'Sultan RS',      class: 'B' },
    { label: 'Elegy Retro',    class: 'B' },
    { label: 'ZR380',          class: 'B' },
    { label: 'Kuruma',         class: 'C' },
    { label: 'Jester Classic', class: 'C' },
    { label: 'Tampa',          class: 'C' },
    { label: 'Futo',           class: 'D' },
    { label: 'Sultan Classic', class: 'D' },
];

const DEV_RACER_NAMES = [
    'Kaz Halloran', 'Nina Vasquez', 'Ivo Petrakis', 'Marcus Kerrigan', 'Sable Yoon',
    'Dex Fontaine', 'Priya Odenkirk', 'Roman Estevez', 'Cass Delacroix', 'Theo Alvarez',
    'Mika Sorensen', 'Andre Garcia', 'Lena Brightwater', 'Ruth Tillman', 'Otis Vance',
    'Camila Reyes', 'Jonah Whitfield', 'Rosa Bianchi', 'Yuki Tanaka', 'Bo Farrier',
    'Elena Moreno', 'Simone Dunphy', 'Hal Brennan', 'Miles Okafor', 'Talia Rourke',
    'Dana Whitlock', 'Sam Nicol', 'Ezra Lindqvist', 'Nadia Kowalski', 'Cody Bashir',
    'Iris Nakamura', 'Grace Hartley', 'Rafe Sandoval', 'Wren Alcott',
];

const DEV_YOU_INDEX = 26;

function devCid(name: string, index: number): string {
    const initials = name.split(' ').map(part => part[0]).join('');
    return `${initials}${String(31000 + index * 137)}`;
}

const DEV_RANKS: RankRow[] = DEV_RACER_NAMES.map((name, i) => {
    const races = 42 + Math.floor(devNoise(i + 3) * 180);
    return {
        rank: i + 1,
        citizenid: devCid(name, i),
        name,
        mmr: 2040 - i * 31 - Math.floor(devNoise(i) * 18),
        races,
        wins: Math.max(0, Math.floor(races * (0.34 - i * 0.008) + devNoise(i + 7) * 4)),
        you: i === DEV_YOU_INDEX,
    };
});

const DEV_YOU = DEV_RANKS[DEV_YOU_INDEX];

let DEV_ALIAS: string | null = 'Nitro';
let DEV_AVATAR: string | null = null;
let DEV_HUD: HudSettings = { ...DEFAULT_HUD };

function devVehicleAt(index: number): { label: string; class: RaceClass } {
    return DEV_VEHICLES[index % DEV_VEHICLES.length];
}

function devRecords(track: DevTrack): TrackRecord[] {
    const base = Math.max(38, track.lengthM / 27);
    return Array.from({ length: 10 }, (_, i) => {
        const racer = DEV_RANKS[(track.id * 5 + i * 3) % DEV_RANKS.length];
        const vehicle = devVehicleAt(track.id + i * 2);
        return {
            rank: i + 1,
            racer: racer.name,
            citizenid: racer.citizenid,
            timeSec: round1(base * (1 + i * 0.021 + devNoise(track.id * 17 + i) * 0.015)),
            vehicle: vehicle.label,
            class: vehicle.class,
            at: nowSec - Math.floor(devNoise(track.id + i * 4) * 26 * DAY),
        };
    });
}

function devTrackDetail(track: DevTrack): TrackDetail {
    const records = devRecords(track);
    const chart = Array.from({ length: 7 }, (_, i) => Math.floor(devNoise(track.id * 9 + i) * (track.plays / 24) + 1));
    const fastest = records[0].timeSec;
    return {
        track: devTrackRow(track),
        timesPlayed: track.plays,
        totalTimeSec: Math.round(fastest * track.plays * 1.28),
        chart,
        fastestSec: fastest,
        holder: records[0].racer,
        records,
    };
}

interface RaceSeed {
    id:         string;
    name:       string;
    trackId:    number;
    class:      RaceClass;
    status:     RaceStatus;
    laps:       number;
    startsIn:   number;
    entryFee:   number;
    prizePool:  number;
    maxRacers:  number;
    registered: number;
    joined:     boolean;
    custom:     boolean;
    phasing:    Race['phasing'];
    camera:     Race['camera'];
}

const DEV_RACE_SEEDS: RaceSeed[] = [
    { id: 'race-1', name: 'Midnight Descent',   trackId: 1,  class: 'A', status: 'registering', laps: 1, startsIn: 214,  entryFee: 1500, prizePool: 12000, maxRacers: 14, registered: 9,  joined: true,  custom: false, phasing: 'full',  camera: 'none' },
    { id: 'race-2', name: 'Neon Freeway Cup',   trackId: 2,  class: 'S', status: 'registering', laps: 3, startsIn: 640,  entryFee: 2500, prizePool: 24500, maxRacers: 16, registered: 12, joined: false, custom: false, phasing: 'full',  camera: 'none' },
    { id: 'race-3', name: 'Chrome Container GP', trackId: 3, class: 'B', status: 'live',        laps: 4, startsIn: -180, entryFee: 750,  prizePool: 8600,  maxRacers: 12, registered: 11, joined: false, custom: false, phasing: 'timed', camera: 'third' },
    { id: 'race-4', name: 'Redline Dust Sprint', trackId: 4, class: 'C', status: 'registering', laps: 1, startsIn: 1320, entryFee: 500,  prizePool: 5200,  maxRacers: 10, registered: 4,  joined: false, custom: false, phasing: 'full',  camera: 'none' },
    { id: 'race-5', name: 'Chiliad Showdown',   trackId: 5,  class: 'D', status: 'registering', laps: 1, startsIn: 2680, entryFee: 250,  prizePool: 3100,  maxRacers: 8,  registered: 2,  joined: false, custom: false, phasing: 'off',   camera: 'none' },
    { id: 'race-6', name: 'Phantom Underpass',  trackId: 6,  class: 'A', status: 'live',        laps: 5, startsIn: -520, entryFee: 1200, prizePool: 14800, maxRacers: 16, registered: 16, joined: false, custom: false, phasing: 'full',  camera: 'first' },
    { id: 'race-7', name: 'Boardwalk Blitz',    trackId: 7,  class: 'B', status: 'registering', laps: 2, startsIn: 3900, entryFee: 900,  prizePool: 9400,  maxRacers: 12, registered: 6,  joined: true,  custom: false, phasing: 'full',  camera: 'none' },
    { id: 'race-8', name: 'Mirror Park Night Loop', trackId: 11, class: 'C', status: 'registering', laps: 3, startsIn: 460, entryFee: 400, prizePool: 0, maxRacers: 8, registered: 3, joined: false, custom: true, phasing: 'timed', camera: 'none' },
    { id: 'race-9', name: 'Rail Yard Grudge',   trackId: 12, class: 'S', status: 'registering', laps: 1, startsIn: 5400, entryFee: 5000, prizePool: 0,     maxRacers: 6,  registered: 5,  joined: false, custom: true,  phasing: 'off',   camera: 'none' },
];

function devRace(seed: RaceSeed): Race {
    const track = devTrackById(seed.trackId) ?? DEV_TRACKS[0];
    return {
        id: seed.id,
        name: seed.name,
        trackId: track.id,
        trackName: track.name,
        author: track.author,
        class: seed.class,
        mode: track.mode,
        status: seed.status,
        laps: track.mode === 'sprint' ? 1 : seed.laps,
        gates: track.path.length,
        distance: Math.round(track.lengthM * (track.mode === 'sprint' ? 1 : seed.laps)),
        startsAt: nowSec + seed.startsIn,
        entryFee: seed.entryFee,
        prizePool: seed.custom ? seed.entryFee * seed.registered : seed.prizePool,
        maxRacers: seed.maxRacers,
        registered: seed.registered,
        joined: seed.joined,
        custom: seed.custom,
        phasing: seed.phasing,
        camera: seed.camera,
        requiredLevel: DEV_CLASSES[seed.class].level,
        start: { ...track.path[0] },
    };
}

let DEV_RACES: Race[] = DEV_RACE_SEEDS.map(devRace);

let DEV_HOSTED = 0;

const DEV_STANDINGS: Standing[] = [
    { pos: 1, name: DEV_RANKS[2].name,  deltaMs: null,   you: false },
    { pos: 2, name: DEV_RANKS[5].name,  deltaMs: 1840,   you: false },
    { pos: 3, name: DEV_RANKS[9].name,  deltaMs: 4270,   you: false },
    { pos: 4, name: DEV_YOU.name,       deltaMs: 6910,   you: true },
    { pos: 5, name: DEV_RANKS[14].name, deltaMs: 11_320, you: false },
    { pos: 6, name: DEV_RANKS[18].name, deltaMs: 18_640, you: false },
];

function devPastRaces(seedBase: number): PastRace[] {
    return Array.from({ length: 9 }, (_, i) => {
        const track = DEV_TRACKS[(seedBase + i * 5) % DEV_TRACKS.length];
        const roll = devNoise(seedBase * 3 + i);
        const dnf = roll > 0.86;
        const position = dnf ? null : 1 + Math.floor(devNoise(seedBase + i * 7) * 8);
        return {
            trackName: track.name,
            mode: track.mode,
            position,
            delta: dnf ? -18 : Math.round((5 - (position ?? 5)) * 6 + devNoise(seedBase + i * 13) * 9),
            dnf,
            ranked: roll > 0.2,
            vehicle: devVehicleAt(seedBase + i * 3).label,
            at: nowSec - Math.floor((i + 1) * 1.7 * DAY) - Math.floor(devNoise(i + seedBase) * DAY),
        };
    });
}

function devProfile(citizenid: string): RacerProfile | null {
    const row = DEV_RANKS.find(rank => rank.citizenid === citizenid);
    if (!row) return null;

    const seedBase = row.rank;
    const pastRaces = devPastRaces(seedBase);
    const dnfs = pastRaces.filter(past => past.dnf).length + Math.floor(devNoise(seedBase * 5) * 6);
    const placed = pastRaces.filter(past => past.position !== null);
    const avg = placed.length
        ? placed.reduce((total, past) => total + (past.position ?? 0), 0) / placed.length
        : 0;

    const chart = Array.from({ length: 14 }, (_, i) => Math.round(
        row.mmr - (13 - i) * 9 + (devNoise(seedBase * 11 + i) - 0.5) * 46,
    ));
    chart[chart.length - 1] = row.mmr;

    return {
        citizenid: row.citizenid,
        name: row.name,
        alias: row.you ? DEV_ALIAS : null,
        avatar: row.you ? DEV_AVATAR : null,
        mmr: row.mmr,
        rank: row.rank,
        racesCompleted: row.races,
        racesWon: row.wins,
        racesDnf: dnfs,
        avgPosition: Math.round(avg * 10) / 10,
        mostUsedVehicle: devVehicleAt(seedBase).label,
        totalTimeSec: row.races * (95 + Math.floor(devNoise(seedBase * 2) * 70)),
        chart,
        pastRaces,
    };
}

function devSortTracks(rows: DevTrack[], sort: TrackSort): DevTrack[] {
    const sorted = [...rows];
    sorted.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (sort === 'plays') return b.plays - a.plays;
        if (sort === 'gates') return b.path.length - a.path.length;
        if (sort === 'newest') return b.createdAt - a.createdAt;
        return a.name.localeCompare(b.name);
    });
    return sorted;
}

function devMatches(query: string, ...fields: string[]): boolean {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return fields.some(field => field.toLowerCase().includes(term));
}

function devPaginate<T>(rows: T[], page: number, perPage: number): Page<T> {
    const at = Math.max(1, Math.floor(page || 1));
    return { rows: rows.slice((at - 1) * perPage, at * perPage), total: rows.length };
}

export async function racingBootstrap(): Promise<RacingBootstrap | null> {
    if (!isFiveM) {
        return {
            me: {
                citizenid: DEV_YOU.citizenid,
                name: DEV_YOU.name,
                alias: DEV_ALIAS,
                avatar: DEV_AVATAR,
                mmr: DEV_YOU.mmr,
                rank: DEV_YOU.rank,
            },
            hud: { ...DEV_HUD },
            admin: true,
            creator: true,
            classes: DEV_CLASSES,
            limits: { ...DEFAULT_LIMITS },
        };
    }
    return apiData<RacingBootstrap>('sd-phone:racing:bootstrap');
}

export async function racingRaces(): Promise<Race[]> {
    if (!isFiveM) return DEV_RACES.map(race => ({ ...race }));
    return (await apiData<{ races: Race[] }>('sd-phone:racing:races'))?.races ?? [];
}

export async function racingTracks(params: { query: string; sort: TrackSort; verifiedOnly: boolean; page: number }): Promise<Page<TrackRow>> {
    if (!isFiveM) {
        const hits = DEV_TRACKS.filter(track => track.published
            && (!params.verifiedOnly || track.verified)
            && devMatches(params.query, track.name, track.author));
        return devPaginate(devSortTracks(hits, params.sort).map(devTrackRow), params.page, TRACKS_PER_PAGE);
    }
    return (await apiData<Page<TrackRow>>('sd-phone:racing:tracks', params)) ?? emptyPage<TrackRow>();
}

export async function racingTrack(trackId: number): Promise<TrackDetail | null> {
    if (!isFiveM) {
        const track = devTrackById(trackId);
        return track ? devTrackDetail(track) : null;
    }
    return apiData<TrackDetail>('sd-phone:racing:track', { trackId });
}

export async function racingTrackRoute(trackId: number): Promise<RoutePoint[]> {
    if (!isFiveM) return devTrackById(trackId)?.route.map(point => ({ ...point })) ?? [];
    return (await apiData<{ points: RoutePoint[] }>('sd-phone:racing:trackRoute', { trackId }))?.points ?? [];
}

export async function racingJoin(raceId: string): Promise<Envelope<{ races: Race[]; start: Coords | null }>> {
    if (!isFiveM) {
        const race = DEV_RACES.find(entry => entry.id === raceId);
        if (!race) return { success: false, message: t('racing.raceGone', 'That race is no longer listed') };
        if (race.joined) return { success: false, message: t('racing.alreadyJoined', 'You are already registered for this race') };
        DEV_RACES = DEV_RACES.map(entry => (entry.id === raceId
            ? { ...entry, joined: true, registered: Math.min(entry.maxRacers, entry.registered + 1) }
            : entry));
        return { success: true, data: { races: DEV_RACES.map(entry => ({ ...entry })), start: race.start } };
    }
    return apiCall<{ races: Race[]; start: Coords | null }>('sd-phone:racing:join', { raceId });
}

export async function racingLeave(raceId: string): Promise<Envelope<{ races: Race[] }>> {
    if (!isFiveM) {
        DEV_RACES = DEV_RACES.map(entry => (entry.id === raceId
            ? { ...entry, joined: false, registered: Math.max(0, entry.registered - 1) }
            : entry));
        return { success: true, data: { races: DEV_RACES.map(entry => ({ ...entry })) } };
    }
    return apiCall<{ races: Race[] }>('sd-phone:racing:leave', { raceId });
}

export async function racingHost(trackId: number, draft: RaceSetupDraft): Promise<Envelope<{ race: Race; start: Coords | null }>> {
    if (!isFiveM) {
        const track = devTrackById(trackId);
        if (!track) return { success: false, message: t('racing.trackGone', 'That track is no longer available') };
        DEV_HOSTED += 1;
        const race = devRace({
            id: `race-custom-${DEV_HOSTED}`,
            name: track.name,
            trackId,
            class: draft.vehicleClass === 'all' ? 'S' : draft.vehicleClass,
            status: 'registering',
            laps: draft.laps,
            startsIn: draft.delay,
            entryFee: draft.buyIn,
            prizePool: 0,
            maxRacers: 8,
            registered: 1,
            joined: true,
            custom: true,
            phasing: draft.phasing,
            camera: draft.camera,
        });
        DEV_RACES = [race, ...DEV_RACES];
        return { success: true, data: { race, start: race.start } };
    }
    return apiCall<{ race: Race; start: Coords | null }>('sd-phone:racing:host', { trackId, ...draft });
}

export async function racingSpectate(raceId: string): Promise<Envelope<{ start: Coords | null; standings: Standing[] }>> {
    if (!isFiveM) {
        const race = DEV_RACES.find(entry => entry.id === raceId);
        if (!race) return { success: false, message: t('racing.raceGone', 'That race is no longer listed') };
        return { success: true, data: { start: race.start, standings: DEV_STANDINGS.map(entry => ({ ...entry })) } };
    }
    return apiCall<{ start: Coords | null; standings: Standing[] }>('sd-phone:racing:spectate', { raceId });
}

export async function racingRankings(page: number): Promise<{ rows: RankRow[]; total: number; me: RankRow | null }> {
    if (!isFiveM) {
        const paged = devPaginate(DEV_RANKS, page, RANKS_PER_PAGE);
        return { rows: paged.rows.map(row => ({ ...row })), total: paged.total, me: { ...DEV_YOU } };
    }
    return (await apiData<{ rows: RankRow[]; total: number; me: RankRow | null }>('sd-phone:racing:rankings', { page }))
        ?? { rows: [], total: 0, me: null };
}

export async function racingRacer(citizenid: string): Promise<RacerProfile | null> {
    if (!isFiveM) return devProfile(citizenid);
    return apiData<RacerProfile>('sd-phone:racing:racer', { citizenid });
}

export async function racingSetAlias(alias: string): Promise<Envelope<{ alias: string | null }>> {
    if (!isFiveM) {
        DEV_ALIAS = alias.trim() || null;
        return { success: true, data: { alias: DEV_ALIAS } };
    }
    return apiCall<{ alias: string | null }>('sd-phone:racing:setAlias', { alias });
}

export async function racingSetAvatar(avatar: string): Promise<Envelope<{ avatar: string | null }>> {
    if (!isFiveM) {
        const trimmed = avatar.trim();
        if (trimmed && !trimmed.startsWith('https://')) {
            return { success: false, message: t('racing.avatarNeedsHttps', 'The avatar link has to start with https://') };
        }
        DEV_AVATAR = trimmed || null;
        return { success: true, data: { avatar: DEV_AVATAR } };
    }
    return apiCall<{ avatar: string | null }>('sd-phone:racing:setAvatar', { avatar });
}

export async function racingSetHud(hud: HudSettings): Promise<Envelope<{ hud: HudSettings }>> {
    if (!isFiveM) {
        DEV_HUD = { ...hud };
        return { success: true, data: { hud: { ...DEV_HUD } } };
    }
    return apiCall<{ hud: HudSettings }>('sd-phone:racing:setHud', { hud });
}

export async function racingWaypoint(x: number, y: number): Promise<void> {
    if (!isFiveM) return;
    await apiCall<unknown>('sd-phone:racing:waypoint', { x, y });
}

export async function racingVehicle(): Promise<{ model: string; class: RaceClass; onFoot: boolean } | null> {
    if (!isFiveM) return { model: 'Elegy Retro Custom', class: 'B', onFoot: false };
    return apiData<{ model: string; class: RaceClass; onFoot: boolean }>('sd-phone:racing:vehicle');
}

export async function racingAdminTracks(params: { query: string; page: number }): Promise<Page<AdminTrackRow>> {
    if (!isFiveM) {
        const hits = DEV_TRACKS.filter(track => devMatches(params.query, track.name, track.author));
        return devPaginate(devSortTracks(hits, 'newest').map(devAdminRow), params.page, TRACKS_PER_PAGE);
    }
    return (await apiData<Page<AdminTrackRow>>('sd-phone:racing:adminTracks', params)) ?? emptyPage<AdminTrackRow>();
}

export async function racingAdminSetFlag(trackId: number, flag: TrackFlag, value: boolean): Promise<Envelope<null>> {
    if (!isFiveM) {
        DEV_TRACKS = DEV_TRACKS.map(track => {
            if (track.id !== trackId) return track;
            if (flag === 'verified') return { ...track, verified: value };
            if (flag === 'featured') return { ...track, featured: value };
            return { ...track, published: value };
        });
        return { success: true, data: null };
    }
    return apiCall<null>('sd-phone:racing:adminSetFlag', { trackId, flag, value });
}

export async function racingAdminDelete(trackId: number): Promise<Envelope<null>> {
    if (!isFiveM) {
        DEV_TRACKS = DEV_TRACKS.filter(track => track.id !== trackId);
        return { success: true, data: null };
    }
    return apiCall<null>('sd-phone:racing:adminDelete', { trackId });
}
