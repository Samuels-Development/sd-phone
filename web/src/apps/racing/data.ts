export type RaceClass = 'D' | 'C' | 'B' | 'A' | 'S';

export type RaceMode = 'circuit' | 'sprint';

export type RaceStatus = 'registering' | 'live';

export type RacingSection = 'races' | 'tracks' | 'rankings' | 'driver';

export type PhasingMode = 'off' | 'full' | 'timed';

export type CameraMode = 'none' | 'first' | 'third';

export type TrackSort = 'name' | 'plays' | 'gates' | 'newest';

export type HudStyle = 'simple' | 'casual' | 'advanced';

export type HudPosition =
    | 'top-left'    | 'top-center'    | 'top-right'
    | 'middle-left' | 'middle-center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type TrackFlag = 'verified' | 'featured' | 'published';

export interface Coords {
    x: number;
    y: number;
    z: number;
}

export interface RoutePoint {
    x:  number;
    y:  number;
    z:  number;
    ax: number;
    ay: number;
    az: number;
    bx: number;
    by: number;
    bz: number;
}

export interface Race {
    id:            string;
    name:          string;
    trackId:       number;
    trackName:     string;
    author:        string;
    class:         RaceClass;
    mode:          RaceMode;
    status:        RaceStatus;
    laps:          number;
    gates:         number;
    distance:      number;
    startsAt:      number;
    entryFee:      number;
    prizePool:     number;
    maxRacers:     number;
    registered:    number;
    joined:        boolean;
    custom:        boolean;
    phasing:       PhasingMode;
    camera:        CameraMode;
    requiredLevel: number;
    start:         Coords | null;
}

export interface TrackRow {
    id:       number;
    name:     string;
    author:   string;
    mode:     RaceMode;
    gates:    number;
    plays:    number;
    verified: boolean;
    featured: boolean;
    coords:   Coords | null;
}

export interface TrackRecord {
    rank:      number;
    racer:     string;
    citizenid: string;
    timeSec:   number;
    vehicle:   string;
    class:     RaceClass;
    solo?:     boolean;
    at:        number;
}

export interface TrackDetail {
    track:        TrackRow;
    timesPlayed:  number;
    totalTimeSec: number;
    chart:        number[];
    fastestSec:   number;
    holder:       string | null;
    records:      TrackRecord[];
}

export interface RankRow {
    rank:      number;
    citizenid: string;
    name:      string;
    mmr:       number;
    races:     number;
    wins:      number;
    you:       boolean;
}

export interface PastRace {
    trackName: string;
    mode:      RaceMode;
    position:  number | null;
    delta:     number | null;
    dnf:       boolean;
    ranked:    boolean;
    vehicle:   string;
    at:        number;
}

export interface RacerProfile {
    citizenid:       string;
    name:            string;
    alias:           string | null;
    avatar:          string | null;
    mmr:             number;
    rank:            number | null;
    racesCompleted:  number;
    racesWon:        number;
    racesDnf:        number;
    avgPosition:     number;
    mostUsedVehicle: string;
    totalTimeSec:    number;
    chart:           number[];
    pastRaces:       PastRace[];
}

export interface HudSettings {
    style:            HudStyle;
    position:         HudPosition;
    scale:            number;
    checkpointColor:  string;
    closestColor:     string;
    inAirWaypoints:   boolean;
}

export interface RacingMe {
    citizenid: string;
    name:      string;
    alias:     string | null;
    avatar:    string | null;
    mmr:       number;
    rank:      number | null;
}

export interface RacingBootstrap {
    me:                   RacingMe;
    hud:                  HudSettings;
    admin:                boolean;
    creator:              boolean;
    creatorNeedsApproval: boolean;
    classes:              Record<RaceClass, { level: number; label: string; color: string }>;
    limits:               RacingLimits;
}

export interface RacingLimits {
    delayMin:    number;
    delayMax:    number;
    lapsMin:     number;
    lapsMax:     number;
    buyInMin:    number;
    buyInMax:    number;
    phaseSecMin: number;
    phaseSecMax: number;
}

export interface RaceSetupDraft {
    delay:          number;
    laps:           number;
    phasing:        PhasingMode;
    phasingSeconds: number;
    buyIn:          number;
    vehicleClass:   RaceClass | 'all';
    camera:         CameraMode;
}

export interface Standing {
    pos:     number;
    name:    string;
    deltaMs: number | null;
    you:     boolean;
}

export interface HudSector {
    ms:   number;
    done: boolean;
}

export interface HudState {
    lap:                number;
    totalLaps:          number;
    cp:                 number;
    cpTotal:            number;
    progress:           number;
    bestLapMs:          number;
    lapStartElapsedMs:  number;
    sectors:            HudSector[];
    racers:             Standing[];
    pos:                number;
    totalRacers:        number;
    pbSectors?:         number[];
    pbLapMs?:           number;
}

export type LineupState = 'ready' | 'vehicle' | 'turn' | 'backup';

export interface StartBoard {
    id:         string;
    name:       string;
    trackName:  string;
    class:      RaceClass;
    mode:       RaceMode;
    laps:       number;
    gates:      number;
    entryFee:   number;
    prizePool:  number;
    registered: number;
    maxRacers:  number;
    startsAt:   number;
    joined:     boolean;
}

export interface HudMarker {
    label:   number;
    dist:    number;
    x:       number;
    y:       number;
    stem:    number;
    scale:   number;
    on:      boolean;
    primary: boolean;
}

export interface RaceResult {
    dnf:       boolean;
    position:  number;
    racers:    number;
    timeMs:    number;
    mmrDelta:  number;
    mmrAfter:  number;
    payout:    number;
}

export interface AdminTrackRow extends TrackRow {
    published: boolean;
    createdAt: number;
}

export type PublishStatus = 'pending' | 'published' | 'rejected';

export interface PendingTrackRow {
    id:               number;
    name:             string;
    author:           string;
    mode:             RaceMode;
    gates:            number;
    citizenid:        string;
    createdAt:        number;
    rejectionReason?: string | null;
}

export interface Page<T> {
    rows:  T[];
    total: number;
}

export const RACING_SECTIONS: readonly RacingSection[] = [
    'races', 'tracks', 'rankings', 'driver',
] as const;

export const CLASS_ORDER: readonly RaceClass[] = ['S', 'A', 'B', 'C', 'D'] as const;

export const CLASS_RANK: Record<RaceClass, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };

export const HUD_STYLES: readonly HudStyle[] = ['simple', 'casual', 'advanced'] as const;

export const HUD_POSITIONS: readonly HudPosition[] = [
    'top-left',    'top-center',    'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
] as const;

export const HUD_SCALE_MIN = 0.7;
export const HUD_SCALE_MAX = 1.8;

export const TRACKS_PER_PAGE = 20;
export const RANKS_PER_PAGE = 25;

export const DEFAULT_HUD: HudSettings = {
    style:           'casual',
    position:        'top-left',
    scale:           1.15,
    checkpointColor: '#0BF2B4',
    closestColor:    '#FFD60A',
    inAirWaypoints:  true,
};

export const DEFAULT_SETUP: RaceSetupDraft = {
    delay:          30,
    laps:           1,
    phasing:        'full',
    phasingSeconds: 30,
    buyIn:          0,
    vehicleClass:   'all',
    camera:         'none',
};

export const DEFAULT_LIMITS: RacingLimits = {
    delayMin:    10,
    delayMax:    600,
    lapsMin:     1,
    lapsMax:     20,
    buyInMin:    0,
    buyInMax:    100000,
    phaseSecMin: 5,
    phaseSecMax: 300,
};

export function emptyPage<T>(): Page<T> {
    return { rows: [], total: 0 };
}

export function classRank(cls: RaceClass | 'all' | undefined): number {
    if (!cls || cls === 'all') return CLASS_RANK.S;
    return CLASS_RANK[cls] ?? CLASS_RANK.D;
}

export function classAtOrBelow(mine: RaceClass, ceiling: RaceClass): boolean {
    return classRank(mine) <= classRank(ceiling);
}

export function formatRaceTime(ms: number): string {
    const cs = Math.floor(Math.max(0, ms) / 10);
    const m = Math.floor(cs / 6000);
    const s = Math.floor(cs / 100) % 60;
    const h = cs % 100;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(h).padStart(2, '0')}`;
}

export function formatLapTime(seconds: number): string {
    return formatRaceTime(Math.max(0, seconds) * 1000);
}

export function formatDelta(ms: number | null): string {
    if (ms === null) return '';
    return `+${(Math.max(0, ms) / 1000).toFixed(2)}`;
}

export function formatMoney(amount: number): string {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatMmrDelta(delta: number): string {
    return delta >= 0 ? `+${delta}` : String(delta);
}

export function prizeShare(custom: boolean, place: number, split: number[]): number {
    if (custom) return place === 1 ? 1 : 0;
    return split[place - 1] ?? 0;
}

export function routeLengthMetres(points: RoutePoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
}

export function startsInLabel(startsAt: number, nowSeconds: number): string {
    const left = Math.max(0, startsAt - nowSeconds);
    if (left < 60) return `${left}s`;
    const mins = Math.floor(left / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function clampHudScale(value: number): number {
    return Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, value));
}
