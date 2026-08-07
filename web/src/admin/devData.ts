import type {
    AdminAuditEntry, AdminBirdyPost, AdminCall, AdminContentItem,
    AdminMessage, AdminMute, AdminNumberRow, AdminOverview, AdminPlayerHit, AdminSimLookup, AdminStats,
} from './types';
import bg3 from '@/assets/photos/background3.webp';
import bg4 from '@/assets/photos/background4.webp';
import bg5 from '@/assets/photos/background5.webp';
import bg6 from '@/assets/photos/background6.webp';
import bg7 from '@/assets/photos/background7.webp';
import bg8 from '@/assets/photos/background8.webp';
import bg10 from '@/assets/photos/background10.webp';
import bg11 from '@/assets/photos/background11.webp';
import bg12 from '@/assets/photos/background12.webp';
import bg13 from '@/assets/photos/background13.webp';
import bg14 from '@/assets/photos/background14.webp';
import bg15 from '@/assets/photos/background15.webp';

// Real bundled photos rather than a placeholder path: the moderation pages are
// mostly image grids, and an empty frame makes them look broken.
const PHOTOS: string[] = [bg3, bg4, bg5, bg6, bg7, bg8, bg10, bg11, bg12, bg13, bg14, bg15];

const photo = (i: number) => PHOTOS[i % PHOTOS.length];

const HOUR = 3600;
const DAY = 86400;

const now = () => Math.floor(Date.now() / 1000);
const ago = (seconds: number) => now() - seconds;

interface DevPlayer {
    citizenid: string;
    name:      string;
    number:    string;
    online:    boolean;
    handle:    string;
    display:   string;
    bio:       string;
    verified:  string | null;
}

export const DEV_PLAYERS: DevPlayer[] = [
    { citizenid: 'C3106S6K', name: 'Samuel Black',   number: '5550142', online: true,  handle: 'sblack',    display: 'Samuel Black',   bio: 'Runs the yard on Popular St.',           verified: 'blue' },
    { citizenid: 'A7742J1M', name: 'Dana Kovac',     number: '5550198', online: true,  handle: 'danak',     display: 'Dana K',         bio: 'Street racer. Two podiums, one engine.',  verified: null },
    { citizenid: 'B2210K9P', name: 'Marcus Reyes',   number: '5550233', online: false, handle: 'mreyes',    display: 'M. Reyes',       bio: 'Mechanic, Mirror Park.',                  verified: null },
    { citizenid: 'D5518L3Q', name: 'Tola Okafor',    number: '5550317', online: true,  handle: 'tokafor',   display: 'Tola',           bio: 'Weazel News, city desk.',                 verified: 'gold' },
    { citizenid: 'E9903M7R', name: 'Jonas Lindqvist',number: '5550451', online: false, handle: 'jlind',     display: 'Jonas L',        bio: 'Taxi driver. Ask me about the tunnel.',   verified: null },
    { citizenid: 'F1147N2S', name: 'Priya Raman',    number: '5550566', online: true,  handle: 'praman',    display: 'Priya',          bio: 'EMS. Off shift, mostly.',                 verified: 'grey' },
    { citizenid: 'G6634P8T', name: 'Ade Balogun',    number: '5550619', online: false, handle: 'adeb',      display: 'Ade',            bio: 'Buying anything with four wheels.',       verified: null },
    { citizenid: 'H8871Q4V', name: 'Nina Sokolova',  number: '5550702', online: true,  handle: 'nsokol',    display: 'Nina',           bio: 'Photographer. DMs open.',                 verified: null },
    { citizenid: 'J2295R6W', name: 'Curtis Vaughn',  number: '5550833', online: false, handle: 'cvaughn',   display: 'Curtis',         bio: 'Bank job? Never heard of it.',            verified: null },
    { citizenid: 'K4408T1X', name: 'Elena Marchetti',number: '5550947', online: true,  handle: 'emarch',    display: 'Elena',          bio: 'Defence attorney. Rates negotiable.',     verified: 'blue' },
];

const byCid = (cid: string) => DEV_PLAYERS.find(p => p.citizenid === cid) ?? DEV_PLAYERS[0];

export const DEV_STATS: AdminStats = {
    phones:      DEV_PLAYERS.length,
    appAccounts: 34,
    birdyPosts:  128,
    messages:    2417,
    activeMutes: 3,
    online:      DEV_PLAYERS.filter(p => p.online).length,
};

export function devSearch(q: string): AdminPlayerHit[] {
    const term = q.trim().toLowerCase();
    return DEV_PLAYERS
        .filter(p => !term
            || p.name.toLowerCase().includes(term)
            || p.citizenid.toLowerCase().includes(term)
            || p.number.includes(term))
        .map(p => ({
            citizenid:   p.citizenid,
            name:        p.name,
            phoneNumber: p.number,
            online:      p.online,
            matchedOn:   term && p.number.includes(term) ? 'number' : undefined,
        }));
}

const APPS = [
    'phone', 'messages', 'mail', 'camera', 'photos', 'settings', 'appstore', 'maps',
    'bank', 'garages', 'birdy', 'photogram', 'music', 'weather', 'notes', 'racing',
];

const DOWNLOADABLE = [
    { id: 'vibez', label: 'Vibez' }, { id: 'cherry', label: 'Cherry' },
    { id: 'darkchat', label: 'Dark Chat' }, { id: 'marketplace', label: 'Marketplace' },
    { id: 'pages', label: 'Pages' }, { id: 'stocks', label: 'Stocks' },
    { id: 'wordle', label: 'Wordle' }, { id: 'chess', label: 'Chess' },
];

export const DEV_MUTES: AdminMute[] = [
    { id: 1, citizenid: 'J2295R6W', name: 'Curtis Vaughn',  online: false, scope: 'birdy',    reason: 'Repeated slurs in replies after a warning.', adminName: 'Demo Admin', expiresAt: now() + 5 * DAY, createdAt: ago(2 * DAY) },
    { id: 2, citizenid: 'G6634P8T', name: 'Ade Balogun',    online: false, scope: 'sms',      reason: 'Mass advertising to random numbers.',        adminName: 'Demo Admin', expiresAt: now() + 12 * HOUR, createdAt: ago(6 * HOUR) },
    { id: 3, citizenid: 'B2210K9P', name: 'Marcus Reyes',   online: false, scope: 'darkchat', reason: 'Selling real currency. Permanent.',          adminName: 'S. Nicol',   expiresAt: null, createdAt: ago(11 * DAY) },
];

export function devOverview(cid: string): AdminOverview {
    const p = byCid(cid);
    return {
        citizenid: p.citizenid,
        name:      p.name,
        online:    p.online,
        settings: {
            phoneNumber:   p.number,
            hasPasscode:   true,
            faceId:        true,
            airplane:      false,
            locale:        'en',
            theme:         'dark',
            darkTheme:     'graphite',
            cardName:      p.name,
            cardEmail:     `${p.handle}@lifeinvader.com`,
            installedApps: APPS,
            updatedAt:     ago(3 * HOUR),
        },
        accounts: [
            { id: 101, app: 'birdy',      username: p.handle,          displayName: p.display, email: `${p.handle}@lifeinvader.com`, phone: p.number, createdAt: ago(90 * DAY) },
            { id: 102, app: 'photogram',  username: `${p.handle}_pics`, displayName: p.display, email: `${p.handle}@lifeinvader.com`, phone: p.number, createdAt: ago(61 * DAY) },
            { id: 103, app: 'mail',       username: p.handle,          displayName: p.name,    email: `${p.handle}@lifeinvader.com`, phone: null,     createdAt: ago(120 * DAY) },
            { id: 104, app: 'marketplace', username: p.handle,         displayName: p.display, email: null,                          phone: p.number, createdAt: ago(30 * DAY) },
        ],
        birdy: [{
            handle:       p.handle,
            displayName:  p.display,
            bio:          p.bio,
            verified:     p.verified !== null,
            verifiedType: p.verified,
            loggedIn:     p.online,
            protected:    false,
            createdAt:    ago(90 * DAY),
        }],
        counts: { birdyPosts: 23, messages: 412, calls: 68, photos: 51, contacts: 34 },
        mutes: DEV_MUTES.filter(m => m.citizenid === p.citizenid),
        downloadable: DOWNLOADABLE,
        sim: {
            mode: 'tray',
            sims: [
                { number: p.number,   identity: `SIM-${p.citizenid}-1`, ownerCid: p.citizenid, createdAt: ago(120 * DAY) },
                { number: '5551180',  identity: `SIM-${p.citizenid}-2`, ownerCid: p.citizenid, createdAt: ago(14 * DAY) },
            ],
            backup: { profiles: 2, enabled: true, hasPassword: true },
            activeNumber: p.online ? p.number : null,
            carried: [
                { number: p.number,  color: 'black', active: true },
                { number: '5551180', color: 'blue',  active: false },
            ],
        },
    };
}

export function devNumbers(q: string): AdminNumberRow[] {
    const term = q.trim().toLowerCase();
    return DEV_PLAYERS
        .filter(p => !term || p.number.includes(term) || p.name.toLowerCase().includes(term))
        .map((p, i) => ({
            number:       p.number,
            identity:     `SIM-${p.citizenid}-1`,
            ownerCid:     p.citizenid,
            ownerName:    p.name,
            createdAt:    ago((i + 4) * DAY),
            boundProfile: i % 3 !== 0,
            holder:       p.online ? { cid: p.citizenid, name: p.name } : null,
        }));
}

export function devSimLookup(number: string): AdminSimLookup {
    const p = DEV_PLAYERS.find(x => x.number === number.replace(/\D/g, '')) ?? DEV_PLAYERS[0];
    return {
        number:       p.number,
        identity:     `SIM-${p.citizenid}-1`,
        ownerCid:     p.citizenid,
        ownerName:    p.name,
        boundProfile: true,
        holder:       { cid: p.citizenid, name: p.name, active: p.online },
    };
}

const POST_BODIES = [
    'anyone else lose power on Elgin last night or just me',
    'selling the Sultan. two owners, one honest. DMs open.',
    'the tunnel is closed AGAIN. third time this week.',
    'photo dump from the Vinewood meet, link in replies',
    'reminder that the racing board resets at midnight',
    'lost a black duffel near the pier. reward, no questions.',
    'whoever keeps parking across two bays at the hospital, we know',
    'new track went live tonight. 14 checkpoints, all corners.',
    'coffee at Bean Machine has doubled in price. rioting.',
    'if you called me at 4am you know what you did',
    'finally hit 1500 MMR. only took nine months.',
    'PSA the ATM on Vespucci eats cards. use the one inside.',
];

export function devBirdyPosts(q?: string, cid?: string): AdminBirdyPost[] {
    const term = (q ?? '').trim().toLowerCase();
    return POST_BODIES.map((body, i) => {
        const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
        return {
            id:           `post-${i + 1}`,
            authorCid:    p.citizenid,
            authorName:   p.name,
            authorOnline: p.online,
            body,
            parentId:     i % 5 === 4 ? `post-${i}` : null,
            images:       i % 4 === 3 ? [photo(i)] : null,
            views:        420 + i * 137,
            likes:        3 + (i * 7) % 41,
            replies:      (i * 3) % 9,
            handle:       p.handle,
            display:      p.display,
            verified:     p.verified !== null,
            verifiedType: p.verified,
            createdAt:    ago(i * 5 * HOUR + HOUR),
        };
    }).filter(post => (!cid || post.authorCid === cid)
        && (!term || post.body.toLowerCase().includes(term) || (post.handle ?? '').includes(term)));
}

const TEXTS = [
    'you around later?', 'on my way, five minutes', 'did you pick up the parts',
    'call me when you can', 'thanks again for the tow', 'the meet moved to the docks',
    'sending the money now', 'no worries, take your time', 'did you see the news',
    'my phone died sorry', 'bring the spare key', 'that was quick',
];

export function devMessages(cid: string): AdminMessage[] {
    const p = byCid(cid);
    return TEXTS.map((body, i): AdminMessage => {
        const other = DEV_PLAYERS[(i + 1) % DEV_PLAYERS.length];
        return {
            id:           `msg-${i + 1}`,
            conversation: other.number,
            sender:       i % 2 === 0 ? p.number : other.number,
            direction:    i % 2 === 0 ? 'out' : 'in',
            kind:         i % 6 === 5 ? 'image' : 'text',
            body:         i % 6 === 5 ? null : body,
            createdAt:    ago(i * 90 * 60 + 600),
        };
    });
}

export function devCalls(): AdminCall[] {
    return DEV_PLAYERS.slice(0, 8).map((other, i) => ({
        id:        `call-${i + 1}`,
        number:    other.number,
        name:      other.name,
        direction: i % 3 === 0 ? 'in' : i % 3 === 1 ? 'out' : 'missed',
        duration:  i % 3 === 2 ? 0 : 45 + i * 73,
        calledAt:  ago(i * 4 * HOUR + HOUR),
    }));
}

const CONTENT: Record<string, { label: string; titles: string[]; bodies: string[]; priced?: boolean; imaged?: boolean }> = {
    messages:    { label: 'Text',    titles: [], bodies: TEXTS },
    darkchat:    { label: 'Message', titles: [], bodies: ['anyone moving tonight', 'price list is up', 'not here. DM.', 'room is getting watched', 'new drop location posted', 'stop using real names'] },
    photogram:   { label: 'Post',    titles: [], bodies: ['sunset off the pier', 'new wheels finally on', 'coffee and a long shift', 'found this alley downtown', 'race night', 'no filter, promise'], imaged: true },
    vibez:       { label: 'Vibe',    titles: [], bodies: ['drift compilation', 'day in the life of a paramedic', 'how to lose $40k in 90 seconds', 'tunnel run at 3am', 'my garage tour', 'worst parking job in the city'], imaged: true },
    cherry:      { label: 'Profile', titles: ['Dana, 27', 'Marcus, 31', 'Tola, 24', 'Jonas, 35', 'Priya, 29', 'Ade, 26'], bodies: ['Looking for someone who drives.', 'Mechanic. Ask me anything.', 'Journalist, terrible cook.', 'Taxi driver, great stories.', 'EMS. I work nights.', 'Car guy. Obviously.'] },
    marketplace: { label: 'Listing', titles: ['Sultan RS', 'Set of 18s', 'Apartment sublet', 'Toolbox, full', 'Camera body', 'Spare engine'], bodies: ['Two owners, clean.', 'Kerb mark on one lip.', 'Two months, Mirror Park.', 'Everything in the photo.', 'Barely used.', 'Pulled from a runner.'], priced: true },
    pages:       { label: 'Post',    titles: ['Mechanic wanted', 'Lost dog', 'Race night Friday', 'Room to let', 'Selling my spot', 'Tow service'], bodies: ['Popular St yard, ask for Sam.', 'Answers to Bruno. Reward.', 'Meet at the docks, 11pm.', 'Quiet building, no pets.', 'Vinewood, good views.', '24/7, fair rates.'] },
    gallery:     { label: 'Photo',   titles: [], bodies: [], imaged: true },
};

export function devContent(app: string, q?: string): { items: AdminContentItem[]; deletable: boolean } {
    const cfg = CONTENT[app] ?? CONTENT.pages;
    const term = (q ?? '').trim().toLowerCase();
    const count = app === 'gallery' ? 12 : Math.max(cfg.bodies.length, cfg.titles.length, 6);

    const items: AdminContentItem[] = Array.from({ length: count }, (_, i) => {
        const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
        return {
            id:           `${app}-${i + 1}`,
            createdAt:    ago(i * 7 * HOUR + HOUR),
            authorCid:    p.citizenid,
            authorName:   p.name,
            authorOnline: p.online,
            label:        cfg.label,
            title:        cfg.titles[i % Math.max(cfg.titles.length, 1)] ?? null,
            body:         cfg.bodies[i % Math.max(cfg.bodies.length, 1)] ?? null,
            kind:         app === 'messages' ? (i % 6 === 5 ? 'image' : 'text') : null,
            images:       cfg.imaged ? 1 + (i % 3) : null,
            imageUrl:     cfg.imaged ? photo(i) : null,
            price:        cfg.priced ? 1500 + i * 2750 : null,
        };
    });

    const filtered = term
        ? items.filter(it => `${it.title ?? ''} ${it.body ?? ''} ${it.authorName ?? ''}`.toLowerCase().includes(term))
        : items;

    return { items: filtered, deletable: app !== 'messages' };
}

const AUDIT_ACTIONS: [string, string][] = [
    ['mute',                'birdy for 5d: Repeated slurs in replies after a warning.'],
    ['birdySetVerified',    'sblack -> blue'],
    ['contentDelete',       'marketplace listing marketplace-3'],
    ['resetPasscode',       'passcode cleared'],
    ['setNumber',           '5550233 -> 5550241'],
    ['giveSim',             'new SIM issued, bound to profile'],
    ['forceLogout',         'signed out of photogram'],
    ['setApp',              'installed darkchat'],
    ['unmute',              'sms lifted early'],
    ['wipePhone',           '1284 rows removed'],
    ['racingSetFlag',       'Devils Gambit marked verified'],
    ['racingDelete',        'Harbour Sprint deleted'],
    ['resetAccountPassword','photogram account 102'],
    ['birdyDeletePost',     'post-7'],
];

export const DEV_AUDIT: AdminAuditEntry[] = AUDIT_ACTIONS.map(([action, detail], i) => {
    const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
    return {
        id:        1000 - i,
        adminCid:  'C3106S6K',
        adminName: i % 4 === 3 ? 'S. Nicol' : 'Demo Admin',
        action,
        targetCid: p.citizenid,
        detail,
        createdAt: ago(i * 3 * HOUR + 900),
    };
});
