import type {
    AdminAuditEntry, AdminBinEntry, AdminBirdyPost, AdminCall, AdminContentItem, AdminContentMedia,
    AdminFlag, AdminFlagStatus,
    AdminLivePlayer, AdminMediaItem,
    AdminMessage, AdminMute, AdminNumberRow, AdminOverview, AdminPlayerHit, AdminSimLookup, AdminStats,
    AdminThreadItem,
    MigrationDomain, MigrationScan, MigrationSnapshot,
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

const DEV_DAYS = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(2026, 7, 11 + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

export const DEV_STATS: AdminStats = {
    phones:      DEV_PLAYERS.length,
    appAccounts: 34,
    birdyPosts:  128,
    messages:    2417,
    activeMutes: 3,
    openFlags:   5,
    online:      DEV_PLAYERS.filter(p => p.online).length,
    days:        DEV_DAYS,
    trends: {
        messages:   [142, 168, 155, 191, 210, 186, 240, 264, 231, 258, 289, 274, 302, 288],
        calls:      [18, 24, 21, 30, 27, 19, 34, 41, 36, 30, 44, 39, 47, 52],
        birdyPosts: [6, 9, 4, 11, 8, 13, 7, 15, 12, 9, 18, 14, 11, 16],
        cloutPosts: [0, 0, 2, 5, 9, 14, 12, 21, 27, 24, 33, 41, 38, 46],
        photos:     [22, 19, 31, 28, 24, 35, 41, 30, 27, 38, 44, 36, 42, 39],
        accounts:   [2, 1, 3, 0, 4, 2, 5, 3, 1, 6, 4, 2, 3, 5],
    },
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
    { id: 'vibez', label: 'Clout' }, { id: 'cherry', label: 'Cherry' },
    { id: 'darkchat', label: 'Dark Chat' }, { id: 'marketplace', label: 'Marketplace' },
    { id: 'pages', label: 'Pages' }, { id: 'stocks', label: 'Stocks' },
    { id: 'wordle', label: 'Penta' }, { id: 'chess', label: 'Chess' },
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
    mail:        { label: 'Mailbox', titles: ['sam.black@ls.mail', 'dana.k@ls.mail', 'm.reyes@ls.mail', 'tola@weazel.mail', 'jonas.l@ls.mail', 'priya.r@ls.mail'], bodies: ['Samuel Black', 'Dana Kovac', 'Marcus Reyes', 'Tola Okafor', 'Jonas Lindqvist', 'Priya Raman'] },
    documents:   { label: 'text',    titles: ['Sale of vehicle', 'Tenancy agreement', 'Employment contract', 'Bill of sale', 'NDA', 'Insurance claim'], bodies: ['Both parties agree the vehicle is sold as seen.', 'Twelve months, rent payable monthly.', 'Full time, probation of thirty days.', 'Received in full, no balance owing.', 'Neither party will disclose the terms.', 'Claim submitted for the damage on Elgin.'] },
    weazelnews:  { label: 'City',    titles: ['Docks closed after overnight raid', 'Third street race this week ends in arrests', 'Mayor announces transit funding', 'Vinewood gallery opens to crowds', 'Hospital wing reopens', 'Storm warning issued for the coast'], bodies: ['Officers moved in shortly after two in the morning.', 'Residents say the noise has become nightly.', 'The plan covers two new lines.', 'The opening drew several hundred visitors.', 'Capacity is up by forty beds.', 'Sailings are suspended until further notice.'], imaged: true },
    notes:       { label: 'Note',    titles: [], bodies: ['dock code 4471', 'ask Dana about the engine', 'shopping: oil, filter, plugs', 'meet Thursday 9pm', 'do not lend the van again', 'plate: 46FGH921'] },
    voicememos:  { label: '0:42',    titles: ['Voice memo 1', 'Interview', 'Song idea', 'Reminder', 'Meeting notes', 'Voice memo 6'], bodies: [] },
    groups:      { label: '5 members', titles: ['Popular St Crew', 'Night Runners', 'Weazel City Desk', 'EMS Shift B', 'Tunnel Rats', 'Sunday Drivers'], bodies: [] },
};

const THREADED = new Set(['messages', 'darkchat', 'photogram', 'vibez', 'mail', 'documents']);

const UNDELETABLE = new Set(['messages', 'cherry', 'mail', 'notes', 'groups']);

const LIKED = new Set(['darkchat', 'photogram', 'vibez']);

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

function devMedia(app: string, i: number, count: number): AdminContentMedia[] {
    if (app === 'voicememos') return [{ url: SILENT_WAV, audio: SILENT_WAV }];
    return Array.from({ length: count }, (_, n) => {
        const url = photo(i * 3 + n);
        return app === 'vibez' ? { url, video: url } : { url };
    });
}

export function devContent(app: string, q?: string): { items: AdminContentItem[]; deletable: boolean; threaded: boolean } {
    const cfg = CONTENT[app] ?? CONTENT.pages;
    const term = (q ?? '').trim().toLowerCase();
    const count = app === 'gallery' ? 12 : Math.max(cfg.bodies.length, cfg.titles.length, 6);

    const items: AdminContentItem[] = Array.from({ length: count }, (_, i) => {
        const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
        const imageText = app === 'messages' && i % 6 === 5;
        const shots = imageText ? 1 : cfg.imaged ? (app === 'gallery' || app === 'vibez' ? 1 : 1 + (i % 3)) : 0;
        const media = app === 'voicememos' ? devMedia(app, i, 1) : devMedia(app, i, shots);
        return {
            id:           `${app}-${i + 1}`,
            createdAt:    ago(i * 7 * HOUR + HOUR),
            authorCid:    p.citizenid,
            authorName:   p.name,
            authorOnline: p.online,
            label:        cfg.label,
            title:        cfg.titles[i % Math.max(cfg.titles.length, 1)] ?? null,
            body:         cfg.bodies[i % Math.max(cfg.bodies.length, 1)] ?? null,
            kind:         app === 'messages' ? (imageText ? 'image' : 'text') : null,
            images:       shots || null,
            imageUrl:     media[0]?.url ?? null,
            media,
            likes:        LIKED.has(app) ? 4 + i * 13 : null,
            comments:     app === 'photogram' || app === 'vibez' ? 2 + (i % 5) : app === 'documents' ? i % 4 : null,
            views:        app === 'vibez' ? 900 + i * 1470 : app === 'weazelnews' ? 300 + i * 940 : null,
            price:        cfg.priced ? 1500 + i * 2750 : null,
        };
    });

    const filtered = term
        ? items.filter(it => `${it.title ?? ''} ${it.body ?? ''} ${it.authorName ?? ''}`.toLowerCase().includes(term))
        : items;

    return { items: filtered, deletable: !UNDELETABLE.has(app), threaded: THREADED.has(app) };
}

const THREAD_BODIES = [
    'where is this',
    'that is not the same car you posted last week',
    'dm me the price',
    'this is the third time. stop.',
    'lmao',
    'meet at the docks after',
    'reported',
    'my guy really said that out loud',
];

const MAIL_THREAD: [string, string][] = [
    ['Your delivery is waiting', 'Confirm your address to release the package. Reply with your bank details to cover the fee.'],
    ['Re: Sultan RS', 'Still available? I can collect tonight.'],
    ['Invoice 4471', 'Attached is the invoice for last month.'],
    ['Re: Invoice 4471', 'Paid, thanks. Receipt attached.'],
    ['Weazel News tip line', 'Someone is running races off the docks every Thursday.'],
    ['Account notice', 'Your password was changed. If this was not you, contact support.'],
];

const SIGNERS = ['S. Black', 'D. Kovac', 'M. Reyes', 'T. Okafor'];

export function devThread(app: string, id: string): { items: AdminThreadItem[]; deletable: boolean } {
    if (!THREADED.has(app)) return { items: [], deletable: false };

    if (app === 'mail') {
        return {
            items: MAIL_THREAD.map(([subject, body], i) => {
                const p = DEV_PLAYERS[(i + 1) % DEV_PLAYERS.length];
                return {
                    id:           `${id}-m${i + 1}`,
                    createdAt:    ago((MAIL_THREAD.length - i) * 5 * HOUR),
                    authorCid:    p.citizenid,
                    authorName:   p.name,
                    authorOnline: p.online,
                    handle:       `${p.handle}@ls.mail`,
                    kind:         i % 3 === 0 ? 'inbox' : 'sent',
                    body:         `${subject}\n${body}`,
                    media:        [],
                };
            }),
            deletable: false,
        };
    }

    if (app === 'documents') {
        return {
            items: SIGNERS.map((signer, i) => {
                const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
                return {
                    id:           `${id}-s${i + 1}`,
                    createdAt:    ago((SIGNERS.length - i) * 3 * HOUR),
                    authorCid:    p.citizenid,
                    authorName:   p.name,
                    authorOnline: p.online,
                    handle:       signer,
                    body:         null,
                    media:        [],
                };
            }),
            deletable: true,
        };
    }

    const anchorAt = app === 'photogram' || app === 'vibez' ? -1 : 3;
    const items: AdminThreadItem[] = Array.from({ length: 8 }, (_, i) => {
        const p = DEV_PLAYERS[(i + 2) % DEV_PLAYERS.length];
        return {
            id:           `${id}-t${i + 1}`,
            createdAt:    ago((8 - i) * 11 * 60),
            authorCid:    p.citizenid,
            authorName:   p.name,
            authorOnline: p.online,
            handle:       p.handle,
            body:         THREAD_BODIES[i % THREAD_BODIES.length],
            direction:    app === 'messages' && i % 3 === 1 ? 'incoming' : 'outgoing',
            media:        app === 'messages' ? [] : i % 4 === 2 ? [{ url: photo(i + 5) }] : [],
            likes:        app === 'messages' ? null : i % 3 === 0 ? i * 2 : null,
            anchor:       i === anchorAt,
        };
    });

    return { items, deletable: app !== 'messages' };
}

const FLAG_SEED: [string, string, string, string, string][] = [
    ['birdy',       'ooc-contact', 'Out-of-character contact', 'discord.gg/', 'join the discord.gg/lsrp we run the real races there'],
    ['darkchat',    'real-money',  'Real-money trading',       'paypal',      'can do 40 paypal for the whole crate, dm me'],
    ['marketplace', 'real-money',  'Real-money trading',       'cash app',    'selling the Sultan, taking cash app only, no in game money'],
    ['messages',    'ooc-contact', 'Out-of-character contact', 'teamspeak',   'get on teamspeak, easier than typing all this'],
    ['photogram',   'ooc-contact', 'Out-of-character contact', 'discord.gg/', 'full album on discord.gg/lscar meets every friday'],
    ['pages',       'real-money',  'Real-money trading',       'venmo',       'apartment sublet, venmo the deposit and its yours'],
    ['vibez',       'ooc-contact', 'Out-of-character contact', 'twitch.tv',   'live now on twitch.tv, come watch the tunnel run'],
];

export function devFlags(status: string): { flags: AdminFlag[]; nextCursor: null; openCount: number } {
    const all: AdminFlag[] = FLAG_SEED.map(([app, ruleId, ruleLabel, matched, excerpt], i) => {
        const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
        const state: AdminFlagStatus = i === 5 ? 'actioned' : i === 6 ? 'dismissed' : 'open';
        return {
            id:           520 - i,
            app,
            targetId:     `${app}-${i + 1}`,
            ruleId,
            ruleLabel,
            matched,
            authorCid:    p.citizenid,
            authorName:   p.name,
            authorOnline: p.online,
            excerpt,
            status:       state,
            handledName:  state === 'open' ? null : 'S. Nicol',
            handledAt:    state === 'open' ? null : ago(2 * HOUR),
            createdAt:    ago(i * 5 * HOUR + HOUR),
        };
    });

    const openCount = all.filter(f => f.status === 'open').length;
    const shown = status === 'all' ? all : all.filter(f => f.status === status);
    return { flags: shown, nextCursor: null, openCount };
}

const AUDIT_ACTIONS: [string, string][] = [
    ['mute',              'birdy for 5d: Repeated slurs in replies after a warning.'],
    ['birdy-verify',      'sblack -> blue'],
    ['delete-content',    'marketplace marketplace-3'],
    ['restore-content',   'bin entry 308'],
    ['reset-passcode',    'passcode cleared'],
    ['set-number',        '5550233 -> 5550241'],
    ['give-sim',          'new SIM issued, bound to profile'],
    ['force-logout',      'signed out of photogram'],
    ['install-app',       'installed darkchat'],
    ['unmute',            'sms lifted early'],
    ['wipe-phone',        '1284 rows removed'],
    ['flags-scan',        '3 filed from 1,240 rows'],
    ['flag-actioned',     'flag 517'],
    ['delete-comment',    'photogram photogram-3-t2'],
    ['reset-password',    'photogram account 102'],
    ['delete-birdy-post', 'post-7'],
];

const DEV_AUDIT: AdminAuditEntry[] = AUDIT_ACTIONS.map(([action, detail], i) => {
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

export function devAudit(q?: string, action?: string): AdminAuditEntry[] {
    const term = (q ?? '').trim().toLowerCase();
    return DEV_AUDIT.filter(e =>
        (!action || e.action === action)
        && (!term || `${e.adminName} ${e.targetCid ?? ''} ${e.detail}`.toLowerCase().includes(term)));
}

const BIN_SEED: [string, string, string, string][] = [
    ['photogram',   'race night, meet at the docks',            'its comments, likes and saves', 'Demo Admin'],
    ['marketplace', 'Sultan RS, taking cash app only',          '',                              'S. Nicol'],
    ['darkchat',    'price list is up, dm for the drop',        'its reactions',                 'Demo Admin'],
    ['pages',       'Room to let, no questions asked',          '',                              'Demo Admin'],
    ['weazelnews',  'Docks closed after overnight raid',        '',                              'S. Nicol'],
];

export const DEV_BIN: AdminBinEntry[] = BIN_SEED.map(([app, excerpt, lost, adminName], i) => {
    const p = DEV_PLAYERS[i % DEV_PLAYERS.length];
    return {
        id:           310 - i,
        app,
        targetId:     `${app}-${i + 1}`,
        excerpt,
        lost:         lost || null,
        authorCid:    p.citizenid,
        authorName:   p.name,
        authorOnline: p.online,
        adminName,
        restoredAt:   i === 3 ? ago(HOUR) : null,
        restoredBy:   i === 3 ? 'S. Nicol' : null,
        createdAt:    ago(i * 6 * HOUR + 2 * HOUR),
    };
});

const MIGRATION_DOMAINS: [string, number, MigrationDomain['status'], string | undefined, string][] = [
    ['numbers',    4821,   'done',     undefined,   'Phone numbers and lock passcodes. Everything else keys off this.'],
    ['contacts',   38104,  'done',     undefined,   'Saved contacts and their avatars.'],
    ['blocked',    1290,   'done',     undefined,   'Blocked number list.'],
    ['calls',      92640,  'done',     undefined,   'Call history.'],
    ['messages',   1284502,'pending',  undefined,   'SMS threads including group chats.'],
    ['reactions',  8841,   'pending',  'messages',  'Reactions on migrated messages.'],
    ['photos',     20418,  'pending',  undefined,   'Camera roll photos and albums.'],
    ['notes',      3907,   'pending',  undefined,   'Notes app entries.'],
    ['settings',   4821,   'pending',  undefined,   'Wallpaper, theme, clock format, ringtones, volumes, home layout.'],
    ['photogram',  418203, 'pending',  undefined,   'Photogram accounts, posts, comments, likes, follows, stories and DMs.'],
    ['birdy',      511066, 'pending',  undefined,   'Squawk accounts, posts and replies, likes, reposts, follows and DMs.'],
    ['mail',       64118,  'pending',  undefined,   'Mailboxes and their received messages.'],
    ['wallet',     150922, 'disabled', undefined,   'Wallet transaction history.'],
    ['voicememos', 2044,   'pending',  undefined,   'Voice memo recordings.'],
    ['sessions',   6210,   'pending',  'photogram', 'Keeps migrated players signed into their accounts.'],
];

function devEstimate(rows: number): string {
    const secs = rows / 8000;
    return secs < 90 ? `~${Math.max(1, Math.round(secs))}s` : `~${Math.max(1, Math.round(secs / 60))}m`;
}

export const DEV_MIGRATION_SCAN: MigrationScan = {
    lbFound:   true,
    busy:      false,
    domains:   MIGRATION_DOMAINS.map(([key, rows, status, requires, blurb]) => ({
        key,
        label:    key,
        title:    ({"numbers":"Phone numbers","contacts":"Contacts","blocked":"Blocked numbers","calls":"Call history","messages":"Messages","reactions":"Message reactions","photos":"Photos and albums","notes":"Notes","settings":"Phone settings","photogram":"Photogram (InstaPic)","birdy":"Squawk (Birdy)","mail":"Mail","wallet":"Bank (Wallet)","voicememos":"Voice Memos","sessions":"Signed-in accounts"})[key] ?? key,
        blurb,
        rows,
        status,
        requires,
        estimate: devEstimate(rows),
        locked:   status === 'done',
        summary:  status === 'done' ? `${Math.round(rows * 0.86).toLocaleString('en-US')} brought across` : undefined,
        stats:    status === 'done' ? { migrated: Math.round(rows * 0.86), skipped: Math.round(rows * 0.14) } : undefined,
    })),
    totalRows: MIGRATION_DOMAINS.filter(d => d[2] === 'pending').reduce((n, d) => n + d[1], 0),
    estimate:  devEstimate(MIGRATION_DOMAINS.filter(d => d[2] === 'pending').reduce((n, d) => n + d[1], 0)),
    identity:  { total: 4821, resolved: 4402, unresolved: 361, ambiguous: 58 },
};

export const DEV_MIGRATION_SNAPSHOT: MigrationSnapshot = { state: { phase: 'idle' }, lines: [] };

const NOW = Math.floor(Date.now() / 1000);

export const DEV_MEDIA: AdminMediaItem[] = [
    { app: 'photogram', id: 'p1',  url: bg6,  author: 'luna.vibe', createdAt: NOW - 60 * 8 },
    { app: 'clout',     id: 'v1',  url: bg5,  video: bg5, author: 'dex', createdAt: NOW - 60 * 22 },
    { app: 'photos',    id: 'g1',  url: bg13,  author: 'C3106S6K', createdAt: NOW - 60 * 47 },
    { app: 'squawk',    id: 's1',  url: bg8,  author: 'mira_ls', createdAt: NOW - 60 * 96 },
    { app: 'photogram', id: 'p2',  url: bg11, author: 'sora', createdAt: NOW - 60 * 140 },
    { app: 'clout',     id: 'v2',  url: bg3,  video: bg3, author: 'nox404', createdAt: NOW - 60 * 190 },
    { app: 'photos',    id: 'g2',  url: bg12, author: 'M79SIWTW', createdAt: NOW - 60 * 240 },
    { app: 'squawk',    id: 's2',  url: bg4,  author: 'kobe.rdr', createdAt: NOW - 60 * 300 },
    { app: 'photogram', id: 'p3',  url: bg10, author: 'luna.vibe', createdAt: NOW - 60 * 420 },
    { app: 'clout',     id: 'v3',  url: bg7,  video: bg7, author: 'sora', createdAt: NOW - 60 * 610 },
];

export const DEV_LIVE: AdminLivePlayer[] = [
    { source: 1, name: 'Samuel Black', cid: DEV_PLAYERS[0].citizenid, x: -260,  y: -970 },
    { source: 2, name: 'Samuel White', cid: DEV_PLAYERS[1]?.citizenid ?? 'M79SIWTW', x: 1980, y: 3760 },
    { source: 3, name: 'Mira Lopez',   cid: DEV_PLAYERS[2]?.citizenid ?? 'X1', x: -1810, y: -420 },
    { source: 4, name: 'Dex Farrow',   cid: DEV_PLAYERS[3]?.citizenid ?? 'X2', x: 430,   y: 6520 },
    { source: 5, name: 'Nox Reed',     cid: DEV_PLAYERS[4]?.citizenid ?? 'X3', x: -3140, y: 1010 },
];
