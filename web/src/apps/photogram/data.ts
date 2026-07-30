
import type { MsgKind, Reaction } from '@/shared/chat/data';
import { formatClockTime } from '@/lib/time';
import bg3  from '@/assets/photos/background3.webp';
import bg4  from '@/assets/photos/background4.webp';
import bg5  from '@/assets/photos/background5.webp';
import bg6  from '@/assets/photos/background6.webp';
import bg7  from '@/assets/photos/background7.webp';
import bg8  from '@/assets/photos/background8.webp';
import bg9  from '@/assets/photos/background9.webp';
import bg10 from '@/assets/photos/background10.webp';
import bg11 from '@/assets/photos/background11.webp';
import bg12 from '@/assets/photos/background12.webp';

export const IG = {
    blue: '#0095F6',   // verified badge / links / active tab
    red:  '#ED4956',   // likes
    sub:  '#737373',   // secondary text
    line: 'rgba(0,0,0,0.08)',
    ring: 'linear-gradient(45deg, #FEDA75, #FA7E1E 28%, #D62976 62%, #8134AF)',
};

export interface User { id: string; handle: string; avatar: string; verified?: boolean }

export interface Story { user: User; seen?: boolean; frames: string[] }

export interface Post {
    id:       string;
    user:     User;
    location?: string;
    images:   string[];
    caption:  string;
    likes:    number;
    liked?:   boolean;
    saved?:   boolean;
    comments: number;
    time:     string;
}

export interface Comment { id: string; user: User; text?: string; time: string; gifUrl?: string; likes?: number; liked?: boolean }

export interface Notif { id: string; user: User; text: string; time: string; thumb?: string; follow?: boolean }

export interface SharedPost { id: string; image: string; author: string; avatar?: string; caption?: string }

export interface DMsg  {
    id:         string;
    body:       string;
    at:         string;
    mine?:      boolean;
    ts?:        number;
    kind?:      MsgKind | 'post';
    gifUrl?:    string;
    duration?:  number;
    audioUrl?:  string;
    waveform?:  number[];
    reactions?: Reaction[];
    replyTo?:   { name: string; body: string };
    post?:      SharedPost;
}
export interface DM    { id: string; user: User; messages: DMsg[] }

const nia:   User = { id: 'nia',   handle: 'nia.builds',  avatar: bg11, verified: true };
const sasha: User = { id: 'sasha', handle: 'sashagrills', avatar: bg3,  verified: true };
const hugo:  User = { id: 'hugo',  handle: 'hugoruiz',    avatar: bg9 };
const tobi:  User = { id: 'tobi',  handle: 'tobi.k',      avatar: bg8 };
const bea:   User = { id: 'bea',   handle: 'beatriz.p',   avatar: bg12 };

export const STORIES: Story[] = [
    { user: sasha, frames: [bg3, bg10] },
    { user: bea,   frames: [bg12, bg7, bg4] },
    { user: nia,   frames: [bg11] },
    { user: tobi,  seen: true, frames: [bg8] },
];

export const POSTS: Post[] = [
    {
        id: 'p1', user: sasha, location: 'Vespucci Canals',
        images: [bg3, bg10], caption: 'birria plate is back on the board, twelve bucks, cash only', likes: 96, comments: 7, time: '2 hours ago', saved: true,
    },
    {
        id: 'p2', user: nia, location: 'La Mesa',
        images: [bg11], caption: 'coilovers went in this morning, wheels next week', likes: 312, comments: 19, time: '6 hours ago', liked: true,
    },
    {
        id: 'p3', user: bea, location: 'Mirror Park',
        images: [bg12, bg7, bg4], caption: 'first week in the new place, still no curtains and the corner shop already knows my coffee order', likes: 41, comments: 3, time: '11 hours ago',
    },
    {
        id: 'p4', user: hugo,
        images: [bg9], caption: 'rain came in off the water before i got the bike home', likes: 8, comments: 0, time: 'Yesterday',
    },
    {
        id: 'p5', user: tobi, location: 'Vinewood',
        images: [bg8, bg6], caption: 'rooftop until three, ears still going', likes: 154, comments: 5, time: '2 days ago',
    },
];

export const COMMENTS: Record<string, Comment[]> = {
    p1: [
        { id: 'p1c1', user: hugo, text: 'saved me twice this week',  time: '90m', likes: 3 },
        { id: 'p1c2', user: bea,  text: 'what time do you park up',  time: '55m' },
    ],
    p2: [
        { id: 'p2c1', user: tobi,  text: 'sitting perfect 🔥',        time: '5h', likes: 6 },
        { id: 'p2c2', user: sasha, text: 'who did the alignment',     time: '4h' },
        { id: 'p2c3', user: hugo,  text: 'that ride height is illegal surely', time: '3h', likes: 2 },
    ],
    p3: [
        { id: 'p3c1', user: nia, text: 'curtains are overrated', time: '9h', likes: 1 },
    ],
};

export const EXPLORE: string[] = [bg7, bg5, bg12, bg10, bg4, bg9, bg6, bg3, bg11, bg8, bg5, bg7, bg10, bg12, bg6, bg4];

export const ACTIVITY: Notif[] = [
    { id: 'n1', user: sasha, text: 'commented: "pull up saturday"',  time: '40m', thumb: bg5 },
    { id: 'n2', user: bea,   text: 'started following you.',         time: '3h',  follow: true },
    { id: 'n3', user: nia,   text: 'and 6 others liked your photo.', time: '8h',  thumb: bg7 },
    { id: 'n4', user: tobi,  text: 'liked your photo.',              time: '2d',  thumb: bg10 },
];

const dmNow = Date.now();
const H = 3_600_000, M = 60_000;
export const DMS: DM[] = [
    { id: 'd1', user: nia, messages: [
        { id: 'm1', body: 'what did you end up eating after the meet', at: '13:40', ts: dmNow - 3 * H },
        { id: 'm2', body: '', at: '13:44', mine: true, ts: dmNow - 3 * H + 4 * M, kind: 'post', post: { id: 'p1', image: bg3, author: 'sashagrills', avatar: bg3, caption: 'birria plate is back on the board, twelve bucks, cash only' } },
        { id: 'm3', body: 'the place bea moved into, did you see the photos', at: '13:51', ts: dmNow - 3 * H + 11 * M, kind: 'post', post: { id: 'p3', image: bg12, author: 'beatriz.p', avatar: bg12, caption: 'first week in the new place, still no curtains and the corner shop already knows my coffee order' } },
        { id: 'm4', body: 'curtains still not up apparently', at: '13:53', mine: true, ts: dmNow - 3 * H + 13 * M },
    ] },
    { id: 'd2', user: sasha, messages: [
        { id: 's1', body: 'on the canals till nine if you want a plate', at: '17:30',              ts: dmNow - 7 * H },
        { id: 's2', body: 'be there straight after work',                at: '17:41', mine: true, ts: dmNow - 7 * H + 11 * M },
    ] },
    { id: 'd3', user: hugo, messages: [
        { id: 'h1', body: 'bike is dry, that spot was worth the soaking', at: 'Mon', ts: dmNow - 29 * H },
    ] },
];

export const MY_POSTS: string[] = [bg5, bg7, bg10, bg4, bg6, bg9, bg12];

export interface ProfileData { name: string; bio: string; avatar: string; private: boolean }

export function nowTime(): string {
    return formatClockTime(new Date(), true);
}
