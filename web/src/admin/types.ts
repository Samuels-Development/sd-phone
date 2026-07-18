// Shapes returned by the server admin module (server/admin/actions.lua).

export interface AdminPlayerHit {
    citizenid:    string;
    name?:        string;
    phoneNumber?: string;
    online:       boolean;
    matchedOn?:   string;
}

export interface AdminMute {
    id?:        number;
    citizenid?: string;
    name?:      string;
    online?:    boolean;
    scope:      string;
    reason:     string;
    adminName:  string;
    expiresAt?: number | null;
    createdAt:  number;
}

export interface AdminAccount {
    id:          number;
    app:         string;
    username:    string;
    displayName: string;
    email?:      string | null;
    phone?:      string | null;
    createdAt?:  number;
}

export interface AdminOverview {
    citizenid: string;
    name?:     string;
    online:    boolean;
    settings?: {
        phoneNumber?:  string | null;
        hasPasscode:   boolean;
        faceId:        boolean;
        airplane:      boolean;
        locale?:       string | null;
        theme?:        string | null;
        darkTheme?:    string | null;
        cardName?:     string | null;
        cardEmail?:    string | null;
        installedApps: string[];
        updatedAt?:    number;
    } | null;
    accounts: AdminAccount[];
    birdy?: {
        handle:      string;
        displayName: string;
        bio:         string;
        verified:    boolean;
        loggedIn:    boolean;
        protected:   boolean;
        createdAt?:  number;
    } | null;
    counts?: {
        birdyPosts: number;
        messages:   number;
        calls:      number;
        photos:     number;
        contacts:   number;
    };
    mutes:        AdminMute[];
    downloadable: { id: string; label: string }[];
}

export interface AdminBirdyPost {
    id:           string;
    authorCid:    string;
    authorName?:  string;
    authorOnline?: boolean;
    body:         string;
    parentId?:    string | null;
    images?:      string[] | null;
    views:        number;
    likes:        number;
    replies:      number;
    handle?:      string | null;
    display?:     string | null;
    verified:     boolean;
    createdAt:    number;
}

export interface AdminMessage {
    id:           string;
    conversation: string;
    sender:       string;
    direction:    string;
    kind:         string;
    body?:        string | null;
    createdAt:    number;
}

export interface AdminCall {
    id:        string;
    number:    string;
    name?:     string | null;
    direction: string;
    duration:  number;
    calledAt:  number;
}

export interface AdminContentItem {
    id:            string;
    createdAt:     number;
    authorCid?:    string | null;
    authorName?:   string | null;
    authorOnline?: boolean;
    label?:        string | null;
    title?:        string | null;
    body?:         string | null;
    kind?:         string | null;
    images?:       number | null;
    price?:        number | null;
}

export interface AdminAuditEntry {
    id:         number;
    adminCid:   string;
    adminName:  string;
    action:     string;
    targetCid?: string | null;
    detail:     string;
    createdAt:  number;
}

export interface AdminStats {
    phones:      number;
    appAccounts: number;
    birdyPosts:  number;
    messages:    number;
    activeMutes: number;
    online:      number;
}

export interface MuteScopeDef {
    id:     string;
    label:  string;
    social: boolean;
}

// Mirrors SCOPES in server/admin/moderation.lua.
export const MUTE_SCOPES: MuteScopeDef[] = [
    { id: 'birdy',     label: 'Birdy',     social: true },
    { id: 'photogram', label: 'Photogram', social: true },
    { id: 'cherry',    label: 'Cherry',    social: true },
    { id: 'darkchat',  label: 'Dark Chat', social: true },
    { id: 'sms',       label: 'Texts',     social: false },
    { id: 'calls',     label: 'Calls',     social: false },
];

export function scopeLabel(id: string): string {
    return MUTE_SCOPES.find(s => s.id === id)?.label ?? id;
}

// Epoch seconds OR milliseconds -> short local date-time. The server mixes both
// (TIMESTAMP columns arrive as seconds, BIGINT ms columns as milliseconds).
export function fmtTime(epoch?: number | null): string {
    if (!epoch) return '—';
    const ms = epoch > 1e12 ? epoch : epoch * 1000;
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fmtPhone(number?: string | null): string {
    const d = (number ?? '').replace(/\D/g, '');
    if (d.length !== 10) return d || '—';
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
