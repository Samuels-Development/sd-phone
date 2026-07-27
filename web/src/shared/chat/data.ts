export type MsgKind = 'text' | 'image' | 'gif' | 'voice' | 'location' | 'money' | 'locrequest';

export interface Reaction {
    emoji: string;
    count: number;
    mine:  boolean;
}

export interface Message {
    id:       string;
    from:     'me' | string;
    body:     string;
    kind:     MsgKind;
    ts:       number;
    read:     boolean;
    reactions?: Reaction[];
    gifUrl?:  string;
    amount?:  number;
    duration?: number;
    audioUrl?: string;
    waveform?: number[];
    wpCode?:  string;
    wpSub?:   string;
    replyTo?: { name: string; body: string };
    requested?: boolean;
    requestStatus?: 'pending' | 'paid' | 'declined' | 'accepted';
}

export interface Conversation {
    id:         string;
    groupName?: string;
    groupAvatar?: string;
    groupOwner?: boolean;
    participants: Contact[];
    messages:   Message[];
    pinned:     boolean;
    muted:      boolean;
    /** Server-side unread tally. Present on list rows, which carry only the last message. */
    unread?:    number;
    /** True while `messages` holds just the preview line; the full thread loads on open. */
    partial?:   boolean;
}

export interface Contact {
    id:       string;
    name:     string;
    initials: string;
    color:    string;
    avatar?:  string;
    phone?:   string;
}


export const CONTACTS: Record<string, Contact> = {
    'sam':   { id: 'sam',   name: 'Sam Nicol',    initials: 'SN', color: '#0A84FF' },
    'ryan':  { id: 'ryan',  name: 'Ryan Carter',  initials: 'RC', color: '#30D158' },
    'maya':  { id: 'maya',  name: 'Maya Lopez',   initials: 'ML', color: '#FF375F' },
    'chief': { id: 'chief', name: 'Chief Holloway',initials:'CH', color: '#FF9F0A' },
    'dave':  { id: 'dave',  name: 'Dave Pirelli', initials: 'DP', color: '#BF5AF2' },
    'jenny': { id: 'jenny', name: 'Jenny Voss',   initials: 'JV', color: '#FF453A' },
    'ghost': { id: 'ghost', name: 'Ghost',        initials: 'GH', color: '#636366' },
    'niko':  { id: 'niko',  name: 'Niko Mares',  initials: 'NM', color: '#5E5CE6' },
};

export const ME: Contact = { id: 'me', name: 'Me', initials: 'ME', color: '#0A84FF' };


const NOW  = Date.now();
const MIN  = 60_000;
const HR   = 60 * MIN;
const DAY  = 24 * HR;

function ago(ms: number) { return NOW - ms; }


export const CONVERSATIONS: Conversation[] = [
    {
        id: 'c-ryan', pinned: true, muted: false,
        participants: [CONTACTS['ryan']],
        messages: [
            { id: 'm1', from: 'ryan', body: 'Still on for the car meet tonight?', kind: 'text', ts: ago(5*MIN),  read: false },
            { id: 'm2', from: 'me',   body: 'Yeah 100%, Sandy Shores at 10',       kind: 'text', ts: ago(4*MIN),  read: true  },
            { id: 'm3', from: 'ryan', body: 'Perfect 🔥 Bringing the Sultan',       kind: 'text', ts: ago(2*MIN),  read: false },
            { id: 'm4', from: 'me', body: '$15', kind: 'money', amount: 15, requested: true, requestStatus: 'pending',  ts: ago(2*MIN), read: true },
            { id: 'm5', from: 'me', body: '$30', kind: 'money', amount: 30, requested: true, requestStatus: 'paid',     ts: ago(1*MIN), read: true },
            { id: 'm6', from: 'me', body: '$50', kind: 'money', amount: 50, requested: true, requestStatus: 'declined', ts: ago(1*MIN), read: true },
        ],
    },
    {
        id: 'c-maya', pinned: true, muted: false,
        participants: [CONTACTS['maya']],
        messages: [
            { id: 'm1', from: 'me',   body: 'Did you pick up the drop?',            kind: 'text', ts: ago(30*MIN), read: true  },
            { id: 'm2', from: 'maya', body: 'Clean. Money in the account 💰',       kind: 'text', ts: ago(28*MIN), read: true  },
            { id: 'm3', from: 'maya', body: 'Same spot next Tuesday?',              kind: 'text', ts: ago(27*MIN), read: true, reactions: [{ emoji: '👍', count: 1, mine: false }] },
            { id: 'm4', from: 'maya', body: '$25', kind: 'money', amount: 25, requested: true, ts: ago(20*MIN), read: false },
        ],
    },
    {
        id: 'c-chief', pinned: true, muted: false,
        participants: [CONTACTS['chief']],
        messages: [
            { id: 'm1', from: 'chief', body: 'You have 24 hours to report to the station.', kind: 'text', ts: ago(2*HR),  read: false },
        ],
    },
    {
        id: 'c-wolfpack', pinned: false, muted: false,
        groupName: 'Wolfpack', groupOwner: true,
        participants: [CONTACTS['ryan'], CONTACTS['dave'], CONTACTS['niko']],
        messages: [
            { id: 'm1', from: 'ryan',  body: 'Everyone online?',                   kind: 'text', ts: ago(45*MIN), read: true  },
            { id: 'm2', from: 'dave',  body: 'Yeah give me 5',                     kind: 'text', ts: ago(44*MIN), read: true  },
            { id: 'm3', from: 'niko',  body: 'Ready',                              kind: 'text', ts: ago(43*MIN), read: true  },
            { id: 'm4', from: 'me',    body: 'Same, loading in now',               kind: 'text', ts: ago(42*MIN), read: true  },
        ],
    },
    {
        id: 'c-jenny', pinned: false, muted: false,
        participants: [CONTACTS['jenny']],
        messages: [
            { id: 'm1', from: 'jenny', body: 'Hey are you around Vespucci today?', kind: 'text', ts: ago(3*HR),   read: true  },
            { id: 'm2', from: 'me',    body: 'Should be around noon',              kind: 'text', ts: ago(2.9*HR), read: true  },
            { id: 'm3', from: 'jenny', body: 'Great, swing by the pier 👋',        kind: 'text', ts: ago(2.8*HR), read: true  },
            { id: 'm4', from: 'jenny', body: 'Location sharing request',           kind: 'locrequest', requested: true, ts: ago(2.7*HR), read: false },
        ],
    },
    {
        id: 'c-ghost', pinned: false, muted: true,
        participants: [CONTACTS['ghost']],
        messages: [
            { id: 'm1', from: 'ghost', body: 'Leave the briefcase at Maze Bank tower parking level 3. Come alone.', kind: 'text', ts: ago(1*DAY), read: true },
        ],
    },
    {
        id: 'c-dave', pinned: false, muted: false,
        participants: [CONTACTS['dave']],
        messages: [
            { id: 'm1', from: 'me',   body: 'You still owe me for that job bro',   kind: 'text', ts: ago(2*DAY),  read: true  },
            { id: 'm2', from: 'dave', body: 'Lmaooo I got you this weekend',       kind: 'text', ts: ago(1.9*DAY),read: true  },
            { id: 'm3', from: 'me',   body: 'Location sharing request',            kind: 'locrequest', requested: true, requestStatus: 'pending', ts: ago(1.8*DAY), read: true },
        ],
    },
    {
        id: 'c-niko', pinned: false, muted: false,
        participants: [CONTACTS['niko']],
        messages: [
            { id: 'm1', from: 'niko', body: 'Map delivered ✅',                    kind: 'text', ts: ago(3*DAY),  read: true  },
        ],
    },
];


function lastMsg(c: Conversation): Message | undefined {
    return c.messages[c.messages.length - 1];
}

export function hasUnread(c: Conversation): boolean {
    return c.messages.some(m => m.from !== 'me' && !m.read);
}

export function unreadCount(c: Conversation): number {
    // A list row carries only its last message, so counting locally would under-report. The
    // server tally wins whenever it is present; the local count still covers dev data and
    // conversations built client-side before any fetch.
    if (typeof c.unread === 'number') return c.unread;
    return c.messages.filter(m => m.from !== 'me' && !m.read).length;
}

export function fmtConvTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < MIN)    return 'Just now';
    if (diff < HR)     return `${Math.round(diff / MIN)}m`;
    if (diff < DAY)    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff < 7*DAY)  return new Date(ts).toLocaleDateString([], { weekday: 'short' });
    return new Date(ts).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

export function fmtChatSeparator(ts: number): { lead: string; time: string } {
    const d    = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const startOfToday  = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfMsgDay = new Date(ts);  startOfMsgDay.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((startOfToday.getTime() - startOfMsgDay.getTime()) / DAY);

    let lead: string;
    if (dayDiff <= 0)     lead = 'Today';
    else if (dayDiff === 1) lead = 'Yesterday';
    else if (dayDiff < 7)   lead = d.toLocaleDateString([], { weekday: 'long' });
    else                    lead = d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

    return { lead, time };
}

export function convName(c: Conversation): string {
    if (c.groupName) return c.groupName;
    return c.participants[0]?.name ?? 'Unknown';
}

export function convPreview(c: Conversation): string {
    const m = lastMsg(c);
    if (!m) return '';
    const prefix = m.from === 'me' ? 'You: ' : c.groupName ? `${c.participants.find(p=>p.id===m.from)?.name.split(' ')[0] ?? 'Unknown'}: ` : '';
    return prefix + m.body;
}

