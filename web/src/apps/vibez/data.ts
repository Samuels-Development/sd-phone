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

// Vibez brand palette: neon violet-to-pink.
export const ACCENT    = '#A855F7';
export const HEART     = '#EC4899';
export const GRAD_FROM = '#8B5CF6';
export const GRAD_TO   = '#F472B6';

export interface VUser {
    id:       string;
    handle:   string;
    avatar:   string;
    verified: boolean;
    name?:    string;
}

export interface VPost {
    id:        string;
    user:      VUser;
    video:     string;
    thumb?:    string;
    caption:   string;
    sound:     string;
    likes:     number;
    liked:     boolean;
    saves:     number;
    saved:     boolean;
    comments:  number;
    views:     number;
    following: boolean;
    time:      string;
}

export interface VComment {
    id:    string;
    user:  VUser;
    text:  string;
    likes: number;
    liked: boolean;
    time:  string;
}

export type VNotifKind = 'like' | 'comment' | 'mention' | 'follow' | 'post';

export interface VNotif {
    id:      string;
    kind:    VNotifKind;
    user:    VUser;
    text:    string;
    thumb?:  string;
    postId?: string;
    seen:    boolean;
    time:    string;
}

export interface VProfile {
    username:       string;
    name:           string;
    bio:            string;
    avatar:         string;
    verified:       boolean;
    isMe:           boolean;
    following:      boolean;
    followsMe:      boolean;
    posts:          number;
    followers:      number;
    followingCount: number;
    likes:          number;
}

export interface VLive {
    user:      VUser;
    liveId:    string;
    startedAt: number;
}

/** Deterministic hue per handle for the generated fallback avatar. */
function handleHue(handle: string): number {
    let h = 0;
    for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
    return h % 360;
}

/** The account's avatar URL, or a generated gradient-initial tile for avatarless accounts. */
export function avatarFor(handle: string, url?: string): string {
    if (url && url.length > 0) return url;
    const hue = handleHue(handle);
    const letter = (handle[0] ?? '?').toUpperCase();
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' width='40' height='40'>` +
        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='hsl(${hue} 72% 52%)'/>` +
        `<stop offset='1' stop-color='hsl(${(hue + 60) % 360} 68% 38%)'/>` +
        `</linearGradient></defs>` +
        `<rect width='40' height='40' fill='url(#g)'/>` +
        `<text x='20' y='26.5' font-family='Inter, sans-serif' font-size='18' font-weight='700' fill='white' text-anchor='middle'>${letter}</text>` +
        `</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function fmt(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1_000_000) {
        const k = n / 1000;
        return (k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)) + 'K';
    }
    const m = n / 1_000_000;
    return (m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)) + 'M';
}

// --- Browser dev seeds (never served in FiveM) -------------------------------

function devUser(handle: string, verified = false): VUser {
    return { id: handle, handle, avatar: avatarFor(handle), verified };
}

const luna = devUser('luna.vibe', true);
const dex  = devUser('dex');
const mira = devUser('mira_ls', true);
const kobe = devUser('kobe.rdr');
const sora = devUser('sora', true);
const nox  = devUser('nox404');

export const DEV_ME: VProfile = {
    username: 'dev', name: 'Dev', bio: 'just vibing in los santos ✦',
    avatar: avatarFor('dev'), verified: true, isMe: true, following: false, followsMe: false,
    posts: 4, followers: 4271, followingCount: 128, likes: 58300,
};

function devPost(id: string, user: VUser, video: string, caption: string, sound: string,
    likes: number, comments: number, saves: number, views: number, extra?: Partial<VPost>): VPost {
    return {
        id, user, video, caption, sound, likes, comments, saves, views,
        liked: false, saved: false, following: false, time: '3h', ...extra,
    };
}

export const DEV_POSTS: VPost[] = [
    devPost('v1', luna, bg6,  'Trippy vibes 🌌 catch the sunset before it’s gone #sunset', 'original sound — luna.vibe', 16, 1, 1, 480),
    devPost('v2', dex,  bg5,  'view from the top never gets old 🌃 #lossantos', 'Night Drive — synthwave', 1243, 88, 42, 12400, { liked: true }),
    devPost('v3', mira, bg9,  'beach day with the whole crew ☀️ #lossantos #beach', 'original sound — mira_ls', 5821, 204, 311, 88100),
    devPost('v4', kobe, bg8,  'late night drive, no destination #nightdrive', 'lofi hours — chill beats', 932, 31, 64, 7040),
    devPost('v5', sora, bg11, 'golden hour hits different up here ✨ #goldenhour', 'original sound — sora', 28400, 1290, 2200, 402000, { saved: true }),
    devPost('v6', nox,  bg3,  'found this spot at 3am 🔥 worth it', 'Phonk Mix — nightcore', 412, 17, 9, 3900),
];

export const DEV_DISCOVER: VPost[] = [
    ...DEV_POSTS,
    devPost('v7', luna, bg12, 'city lights forever #lossantos', 'original sound — luna.vibe', 214, 9, 3, 920400),
    devPost('v8', dex,  bg4,  'garage day 🔧', 'original sound — dex', 87, 4, 1, 12700),
    devPost('v9', sora, bg7,  'rooftop sunrise club', 'Morning Air — chillhop', 460, 21, 12, 460),
    devPost('v10', mira, bg10, 'weekend loading… #beach', 'original sound — mira_ls', 1350, 66, 40, 2400000),
];

export const DEV_TRENDS = ['#lossantos', '#sunset', '#nightdrive', '#beach', '#goldenhour'];

export const DEV_COMMENTS: Record<string, VComment[]> = {
    v2: [
        { id: 'c1', user: mira, text: 'this is insane 🔥', likes: 12, liked: false, time: '1h' },
        { id: 'c2', user: sora, text: 'where is this??', likes: 3, liked: true, time: '48m' },
        { id: 'c3', user: nox,  text: 'need the sound 🙏', likes: 1, liked: false, time: '12m' },
    ],
    v3: [
        { id: 'c4', user: luna, text: 'take me next time 😭', likes: 40, liked: false, time: '4h' },
    ],
};

export const DEV_NOTIFS: VNotif[] = [
    { id: 'n1', kind: 'like',    user: sora, text: 'liked your vibe.',      thumb: bg11, postId: 'v5', seen: false, time: '2m' },
    { id: 'n2', kind: 'follow',  user: dex,  text: 'started following you.',                          seen: false, time: '18m' },
    { id: 'n3', kind: 'comment', user: mira, text: 'commented: "this is insane 🔥"', thumb: bg9, postId: 'v3', seen: true, time: '1h' },
    { id: 'n4', kind: 'mention', user: luna, text: 'mentioned you.',        thumb: bg6,  postId: 'v1', seen: true, time: '6h' },
    { id: 'n5', kind: 'post',    user: nox,  text: 'posted a new vibe.',    thumb: bg3,  postId: 'v6', seen: true, time: '1d' },
];

export const DEV_MY_POSTS: VPost[] = [
    devPost('m1', devUser('dev', true), bg10, 'my city 🌆', 'original sound — dev', 120, 4, 2, 957),
    devPost('m2', devUser('dev', true), bg7,  'sunrise shift', 'original sound — dev', 84, 2, 1, 1794),
    devPost('m3', devUser('dev', true), bg5,  'skyline', 'Night Drive — synthwave', 402, 12, 8, 2631),
    devPost('m4', devUser('dev', true), bg12, 'downtown run', 'original sound — dev', 61, 1, 0, 3468),
];
