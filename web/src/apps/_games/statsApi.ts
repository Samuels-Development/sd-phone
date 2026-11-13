import { isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { readJson, writeJson } from '@/lib/storage';

export interface Tally { wins: number; losses: number; draws: number }
export interface GameStats { cpu: Tally; online: Tally; won: number; lost: number; high?: number; plays?: number; last?: number }
export type StatMode = 'cpu' | 'online';
export type StatResult = 'win' | 'loss' | 'draw';

const ZERO: Tally = { wins: 0, losses: 0, draws: 0 };
const emptyStats = (): GameStats => ({ cpu: { ...ZERO }, online: { ...ZERO }, won: 0, lost: 0, high: 0, plays: 0, last: 0 });
const keyFor = (game: string) => `sd-phone:${game}:v1`;

function norm(t: { wins?: number; losses?: number; draws?: number } | undefined): Tally {
    return { wins: t?.wins ?? 0, losses: t?.losses ?? 0, draws: t?.draws ?? 0 };
}

interface DevBlob { cpu?: Tally; online?: Tally; won?: number; lost?: number; wins?: number; high?: number; plays?: number; last?: number }

function devRead(game: string): GameStats {
    const p = readJson<DevBlob>(keyFor(game));
    if (p && p.cpu) return { cpu: norm(p.cpu), online: norm(p.online), won: p.won ?? 0, lost: p.lost ?? 0, high: p.high ?? 0, plays: p.plays ?? 0, last: p.last ?? 0 };
    if (p && typeof p.wins === 'number') return { cpu: norm(p as Tally), online: { ...ZERO }, won: 0, lost: 0, high: p.high ?? 0, plays: p.plays ?? 0, last: p.last ?? 0 };
    return emptyStats();
}
function devWrite(game: string, s: GameStats) { writeJson(keyFor(game), s); }

const FIELD: Record<StatResult, keyof Tally> = { win: 'wins', loss: 'losses', draw: 'draws' };

export async function loadStats(game: string): Promise<GameStats> {
    if (!isFiveM) return devRead(game);
    return (await apiData<GameStats>('sd-phone:games:stats', { game })) ?? emptyStats();
}

export interface LeaderEntry { name: string | null; wins: number; losses: number }
export interface ChipLeaderEntry { name: string | null; won: number; lost: number; net: number }
export interface GameLeaderboard { cpu: LeaderEntry[]; online: LeaderEntry[]; winners: ChipLeaderEntry[]; losers: ChipLeaderEntry[] }

const DEV_LEADERBOARD: GameLeaderboard = {
    cpu: [
        { name: 'Ryan Carter', wins: 18, losses: 6 },
        { name: 'Maya Lopez', wins: 12, losses: 9 },
        { name: 'Dave Pirelli', wins: 7, losses: 4 },
        { name: 'Niko Mares', wins: 5, losses: 8 },
        { name: 'Jenny Voss', wins: 3, losses: 2 },
    ],
    online: [
        { name: 'Dave Pirelli', wins: 9, losses: 2 },
        { name: 'Ryan Carter', wins: 6, losses: 5 },
        { name: 'Jenny Voss', wins: 4, losses: 4 },
        { name: 'Maya Lopez', wins: 2, losses: 6 },
    ],
    winners: [
        { name: 'Dave Pirelli', won: 84500, lost: 21000, net: 63500 },
        { name: 'Ryan Carter', won: 51200, lost: 19800, net: 31400 },
        { name: 'Jenny Voss', won: 28000, lost: 16500, net: 11500 },
    ],
    losers: [
        { name: 'Niko Mares', won: 9000, lost: 47500, net: -38500 },
        { name: 'Maya Lopez', won: 14200, lost: 33000, net: -18800 },
        { name: 'Tom Riggs', won: 4000, lost: 12500, net: -8500 },
    ],
};

export async function loadLeaderboard(game: string): Promise<GameLeaderboard> {
    if (!isFiveM) return DEV_LEADERBOARD;
    return (await apiData<GameLeaderboard>('sd-phone:games:leaderboard', { game })) ?? { cpu: [], online: [], winners: [], losers: [] };
}

export async function recordResultApi(game: string, mode: StatMode, result: StatResult, amount = 0): Promise<GameStats | null> {
    if (!isFiveM) {
        const s = devRead(game);
        s[mode] = { ...s[mode], [FIELD[result]]: s[mode][FIELD[result]] + 1 };
        if (amount > 0) s.won += amount; else if (amount < 0) s.lost += -amount;
        devWrite(game, s);
        return s;
    }
    return await apiData<GameStats>('sd-phone:games:record', { game, mode, result, amount });
}

export interface ScoreEntry { name: string | null; score: number }

const DEV_SCOREBOARD: ScoreEntry[] = [
    { name: 'Ryan Carter', score: 128400 },
    { name: 'Maya Lopez', score: 96750 },
    { name: 'Dave Pirelli', score: 71200 },
    { name: 'Jenny Voss', score: 54300 },
    { name: 'Niko Mares', score: 38900 },
];

const cleanScore = (score: number) => Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));

export interface ScoreResult { best: number; isRecord: boolean; plays: number; last: number }

export async function submitScoreApi(game: string, score: number): Promise<ScoreResult> {
    if (!isFiveM) {
        const s = devRead(game);
        const prev = s.high ?? 0;
        const clean = cleanScore(score);
        const best = Math.max(prev, clean);
        const plays = (s.plays ?? 0) + 1;
        devWrite(game, { ...s, high: best, plays, last: clean });
        return { best, isRecord: clean > prev, plays, last: clean };
    }
    return (await apiData<ScoreResult>('sd-phone:games:submitScore', { game, score }))
        ?? { best: 0, isRecord: false, plays: 0, last: 0 };
}

export async function loadScoreboard(game: string): Promise<ScoreEntry[]> {
    if (!isFiveM) {
        const s = devRead(game);
        const mine: ScoreEntry[] = s.high ? [{ name: 'You', score: s.high }] : [];
        return [...DEV_SCOREBOARD, ...mine].sort((a, b) => b.score - a.score).slice(0, 20);
    }
    return (await apiData<ScoreEntry[]>('sd-phone:games:scoreboard', { game })) ?? [];
}
