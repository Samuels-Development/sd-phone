
import type { Message, Reaction } from '@/shared/chat/data';
import { formatClockTime } from '@/lib/time';

export type { Reaction };

type DarkChatKind = 'text' | 'image' | 'gif' | 'voice' | 'location';

export interface ChatMessage {
    id:     string;
    author: string;
    body:   string;
    at:     string;
    mine?:  boolean;
    kind?:      DarkChatKind;
    mediaUrl?:  string;
    audioUrl?:  string;
    duration?:  number;
    waveform?:  number[];
    wpCode?:    string;
    wpSub?:     string;
    replyTo?:   { name: string; body: string };
    reactions?: Reaction[];
}

export interface DarkChatDraft {
    kind:      DarkChatKind;
    body:      string;
    mediaUrl?: string;
    audioUrl?: string;
    duration?: number;
    waveform?: number[];
    wpCode?:   string;
    wpSub?:    string;
    replyTo?:  { name: string; body: string };
}

export function toBubbleMsg(m: ChatMessage): Message {
    return {
        id:        m.id,
        from:      m.mine ? 'me' : m.author,
        body:      m.body,
        kind:      m.kind ?? 'text',
        ts:        0,
        read:      true,
        reactions: m.reactions,
        gifUrl:    m.mediaUrl,
        audioUrl:  m.audioUrl,
        duration:  m.duration,
        waveform:  m.waveform,
        wpCode:    m.wpCode,
        wpSub:     m.wpSub,
        replyTo:   m.replyTo,
    };
}

export interface Room {
    id:        string;
    name:      string;
    topic:     string;
    members:   number;
    isPrivate: boolean;
    code?:     string;
    messages:  ChatMessage[];
}

export interface RoomMember {
    id:       string;
    name:     string;
    creator?: boolean;
}

export interface RoomInfo {
    notifications: boolean;
    isCreator:     boolean;
    members?:      RoomMember[];
}

export const PUBLIC_ROOMS: Room[] = [
    {
        id: 'r-general', name: 'City General', topic: 'Anything goes — keep it civil.', members: 42, isPrivate: false,
        messages: [
            { id: 'g1', author: 'Ghost',  body: 'anyone selling a clean sandking? hmu', at: '10:31' },
            { id: 'g2', author: 'Raven',  body: 'check the black market room, saw one listed earlier', at: '10:33' },
            { id: 'g3', author: 'Vee',    body: 'lol cops are crawling all over vinewood rn, stay clear', at: '10:40' },
            { id: 'g4', author: 'Ghost',  body: 'appreciate it', at: '10:41' },
        ],
    },
    {
        id: 'r-market', name: 'The Black Market', topic: 'Buy, sell, trade. No questions asked.', members: 17, isPrivate: false,
        messages: [
            { id: 'm1', author: 'Cipher', body: 'WTS fully kitted kuruma, armored. serious offers only', at: '09:58' },
            { id: 'm2', author: 'NoName', body: 'still got those parts from last week?', at: '10:05' },
            { id: 'm3', author: 'Cipher', body: 'yeah, plenty. open all night', at: '10:06' },
        ],
    },
    {
        id: 'r-grid', name: 'Off the Grid', topic: "For people who'd rather not be found.", members: 8, isPrivate: false,
        messages: [
            { id: 'o1', author: 'Wraith', body: 'stay safe out there everyone', at: '02:14' },
            { id: 'o2', author: 'Echo',   body: 'anyone else feel like theyre being followed downtown?', at: '02:20' },
        ],
    },
    {
        id: 'r-night', name: 'Night Shift', topic: 'Late-night crew only.', members: 23, isPrivate: false,
        messages: [
            { id: 'n1', author: 'Mox',  body: 'whos running tonight', at: '23:48' },
            { id: 'n2', author: 'Zero', body: 'im down, usual spot in 20', at: '23:51' },
        ],
    },
    {
        id: 'r-rumor', name: 'Rumor Mill', topic: 'What did you hear?', members: 31, isPrivate: false,
        messages: [
            { id: 'ru1', author: 'Tattle', body: 'heard the bank job last week was an inside thing', at: '18:02' },
            { id: 'ru2', author: 'Vee',    body: 'no way. who told you that', at: '18:09' },
        ],
    },
];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function genCode(): string {
    let out = '';
    for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return out;
}

export function nowTime(): string {
    return formatClockTime(new Date(), true);
}
