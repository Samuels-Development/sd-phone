
import { t } from '@/i18n';
import { formatClockTime, relTimeCompact } from '@/lib/time';
import type { MsgKind, Reaction } from '@/shared/chat/data';

export interface BirdyAuthor {
    name:     string;
    handle:   string;
    verified: boolean;
    avatar?:  string;
}

export interface BirdyProfile {
    name:         string;
    handle:       string;
    verified:     boolean;
    bio:          string;
    joined:       string;
    following:    number;
    followers:    number;
    protected:    boolean;
    avatar?:      string;
    banner?:      string;
    isMe?:        boolean;
    isFollowing?: boolean;
}

export interface BirdyFollowUser {
    name:        string;
    handle:      string;
    verified:    boolean;
    bio:         string;
    avatar?:     string;
    followsYou:  boolean;
    isFollowing: boolean;
}

export interface BirdyPost {
    id:        string;
    author:    BirdyAuthor;
    body:      string;
    createdAt: number;
    replies:   number;
    reposts:   number;
    reposted?: boolean;
    likes:     number;
    liked:     boolean;
    images?:   string[];
    views?:    number;
    thread?:   BirdyPost[];
}

export const BLUE   = '#1d9bf0';
export const META   = '#657786';
export const LIKE   = '#f91880';
export const REPOST = '#00ba7c';
export const BG     = '#e5e5e5';
export const PILL   = '#d9d9d9';

export const CURRENT_USER: BirdyAuthor = { name: 'Los Santos',  handle: 'lossantos', verified: true };
export const MARCUS:       BirdyAuthor = { name: 'Marcus',      handle: 'marcus', verified: false };
export const TOMMY:        BirdyAuthor = { name: 'Tommy V',     handle: 'tommy',  verified: false };

export const MAX_POST_LENGTH = 280;

const HOUR = 3_600_000;

const MARCUS_REPLY: BirdyPost = {
    id:        'reply-1',
    author:    MARCUS,
    body:      'finally, been waiting for this for ages!',
    createdAt: Date.now() - 2 * HOUR,
    replies:   0,
    reposts:   0,
    likes:     0,
    liked:     false,
};

export const SEED_POSTS: BirdyPost[] = [
    {
        id:        'seed-1',
        author:    CURRENT_USER,
        body:      'Just got my new phone set up and honestly this thing is slick',
        createdAt: Date.now() - 2 * HOUR,
        replies:   1,
        reposts:   0,
        likes:     4,
        liked:     false,
        views:     2,
        thread:    [MARCUS_REPLY],
    },
    {
        id:        'seed-2',
        author:    MARCUS,
        body:      'wow, the birdy app really is cool',
        createdAt: Date.now() - 3 * HOUR,
        replies:   0,
        reposts:   0,
        likes:     1,
        liked:     true,
        views:     1,
    },
    {
        id:        'seed-3',
        author:    CURRENT_USER,
        body:      'Hello, world!',
        createdAt: Date.now() - 5 * HOUR,
        replies:   0,
        reposts:   0,
        likes:     0,
        liked:     false,
        views:     3,
    },
];

export type BirdyNotification =
    | { id: string; kind: 'reply';  post: BirdyPost }
    | { id: string; kind: 'like';   user: BirdyAuthor; text: string; post?: BirdyPost }
    | { id: string; kind: 'repost'; user: BirdyAuthor; text: string; post?: BirdyPost }
    | { id: string; kind: 'post';   user: BirdyAuthor; text: string; post?: BirdyPost }
    | { id: string; kind: 'follow'; user: BirdyAuthor };

export const SEED_NOTIFICATIONS: BirdyNotification[] = [
    { id: 'n1', kind: 'reply',  post: MARCUS_REPLY },
    { id: 'n2', kind: 'like',   user: TOMMY, text: 'liked your post', post: SEED_POSTS[0] },
    { id: 'n3', kind: 'follow', user: TOMMY },
    { id: 'n4', kind: 'follow', user: MARCUS },
];

export interface BirdyMessage {
    id:     string;
    fromMe: boolean;
    body:   string;
    at:     string;
    ts?:    number;
    kind?:  MsgKind;
    gifUrl?:    string;
    amount?:    number;
    requested?: boolean;
    duration?:  number;
    audioUrl?:  string;
    waveform?:  number[];
    wpCode?:    string;
    wpSub?:     string;
    reactions?: Reaction[];
    replyTo?:   { name: string; body: string };
}

export interface BirdyConversation {
    id:       string;
    user:     BirdyAuthor;
    updated:  string;
    unread?:  number;
    messages: BirdyMessage[];
}

const MIN = 60_000;
export const SEED_CONVERSATIONS: BirdyConversation[] = [
    {
        id:      'c1',
        user:    MARCUS,
        updated: '5h',
        unread:  1,
        messages: [
            { id: 'm1', fromMe: false, body: 'great job on the new update, really proud of you!', at: '16:42', ts: Date.now() - 5 * HOUR },
        ],
    },
    {
        id:      'c2',
        user:    TOMMY,
        updated: '1d',
        messages: [
            { id: 'm2', fromMe: false, body: 'hey, loved the latest release',   at: 'Yesterday', ts: Date.now() - 26 * HOUR },
            { id: 'm3', fromMe: true,  body: 'thanks! glad you like it',         at: 'Yesterday', ts: Date.now() - 26 * HOUR + 2 * MIN },
            { id: 'm4', fromMe: false, body: 'thanks for responding, haha!',     at: 'Yesterday', ts: Date.now() - 26 * HOUR + 4 * MIN },
        ],
    },
];

let seq = 0;
export function newId(prefix = 'id'): string {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
}

export function relativeTime(from: number, now: number = Date.now()): string {
    return relTimeCompact(from, { now, nowLabel: t('birdy.now', 'now') });
}

export function absoluteTime(ms: number): string {
    const d = new Date(ms);
    return `${formatClockTime(d, true)} · ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
