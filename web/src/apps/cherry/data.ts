
import { t } from '@/i18n';
import type { Message } from '@/shared/chat/data';

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

export const CHERRY = {
    pink:  '#FF3D6E',   // primary accent / logo / sent bubbles
    nope:  '#FF4D5E',   // ✕ button
    rewind:'#FFA320',   // ↺ button
    like:  '#3CCB7F',   // ♥ button (reference heart is green)
};

export function msgPreview(m: Message): string {
    if (m.kind === 'image')    return t('cherry.previewPhoto', '📷 Photo');
    if (m.kind === 'gif')      return t('cherry.previewGif', 'GIF');
    if (m.kind === 'money')    return m.requested
        ? t('cherry.previewRequested', '💵 Requested ${amount}', { amount: m.amount ?? 0 })
        : t('cherry.previewMoney', '💵 ${amount}', { amount: m.amount ?? 0 });
    if (m.kind === 'voice')    return t('cherry.previewVoice', '🎤 Voice message');
    if (m.kind === 'location') return t('cherry.previewLocation', '📍 Location');
    return m.body;
}

export interface SwipeProfile {
    id:        string;
    name:      string;
    age:       number;
    gender?:   Gender;
    bio:       string;
    photos:    string[];
    likesYou?: boolean;
}

export type InterestedIn = 'Women' | 'Men' | 'Everyone';
export type Gender       = 'Man' | 'Woman' | 'Nonbinary';

export interface MyProfile {
    name:         string;
    age:          number;
    photos:       string[];
    about:        string;
    interestedIn: InterestedIn;
    gender:       Gender;
    visible:      boolean;
}

export interface MatchPartner {
    username: string;
    name:     string;
    age:      number;
    gender?:  Gender;
    photo?:   string;
    about?:   string;
    photos?:  string[];
}

export interface Match {
    id:           string;
    partner:      MatchPartner;
    messages:     Message[];
    loaded?:      boolean;
    createdAt?:   number;
}

export const PROFILES: SwipeProfile[] = [
    { id: 'd1', name: 'Marisol', age: 31, gender: 'Woman',     bio: 'Taco truck on Vespucci Beach. I close up at nine.',        photos: [bg9, bg4] },
    { id: 'd2', name: 'Wren',    age: 24, gender: 'Nonbinary', bio: 'Thrift shops, cheap wine, long arguments about films.',    photos: [bg3, bg12], likesYou: true },
    { id: 'd3', name: 'Theo',    age: 34, gender: 'Man',       bio: 'Tow truck nights. I have seen every road in this county.', photos: [bg7, bg10, bg5] },
    { id: 'd4', name: 'Hana',    age: 27, gender: 'Woman',     bio: 'Two jobs, one dog. The dog gets my weekends.',             photos: [bg11, bg6], likesYou: true },
    { id: 'd5', name: 'Ade',     age: 29, gender: 'Man',       bio: 'Five a side in Rancho on Thursdays. Bring boots.',         photos: [bg5, bg8], likesYou: true },
    { id: 'd6', name: 'Sloane',  age: 26, gender: 'Woman',     bio: 'Paints murals in Mission Row. Currently up a ladder.',     photos: [bg12, bg9] },
    { id: 'd7', name: 'Frankie', age: 22, gender: 'Nonbinary', bio: 'Skate park after dark. I will teach you, badly.',          photos: [bg8, bg3] },
];

export const MY_PROFILE: MyProfile = {
    name:         'Noor',
    age:          29,
    photos:       [bg10, bg4, bg6],
    about:        'Nightshifts at the docks, so my mornings are free.',
    interestedIn: 'Everyone',
    gender:       'Woman',
    visible:      true,
};

const NOW = Date.now();
const MIN = 60_000;

export const MATCHES: Match[] = [
    {
        id: 'c1', loaded: true,
        partner: { username: 'marisol', name: 'Marisol', age: 31, gender: 'Woman', photo: bg9, photos: [bg9, bg4], about: 'Taco truck on Vespucci Beach. I close up at nine.' },
        messages: [
            { id: 'w1', from: 'marisol', body: 'we are parked by the pier until nine if you want food', kind: 'text', ts: NOW - 26 * MIN, read: true },
        ],
    },
    {
        id: 'c2', loaded: true,
        partner: { username: 'theo', name: 'Theo', age: 34, gender: 'Man', photo: bg7, photos: [bg7, bg10, bg5], about: 'Tow truck nights. I have seen every road in this county.' },
        messages: [
            { id: 'v1', from: 'theo', body: 'what does anyone do in this city at four in the morning', kind: 'text', ts: NOW - 212 * MIN, read: true },
            { id: 'v2', from: 'me',   body: 'the diner on san andreas ave. best coffee at that hour',  kind: 'text', ts: NOW - 206 * MIN, read: true },
            { id: 'v3', from: 'theo', body: 'is that the one with the broken sign',                    kind: 'text', ts: NOW - 178 * MIN, read: true },
            { id: 'v4', from: 'me',   body: 'that is the one. i finish at three if you want to try it', kind: 'text', ts: NOW - 170 * MIN, read: true },
        ],
    },
    {
        id: 'c3', loaded: true,
        partner: { username: 'sloane', name: 'Sloane', age: 26, photo: bg12 },
        messages: [],
    },
];
