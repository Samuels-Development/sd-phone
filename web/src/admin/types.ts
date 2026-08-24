// Shapes returned by the server admin module (server/admin/actions.lua).

import { formatPhone } from '@/lib/phone';

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

interface AdminAccount {
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
    birdy: AdminBirdyProfile[];
    counts?: {
        birdyPosts: number;
        messages:   number;
        calls:      number;
        photos:     number;
        contacts:   number;
    };
    mutes:        AdminMute[];
    downloadable: { id: string; label: string }[];
    /** Unique-phones footprint; absent while the SIM feature is off. */
    sim?: {
        mode: 'tray' | 'metadata';
        sims: AdminSimRow[];
        backup?: { profiles: number; enabled: boolean; hasPassword: boolean } | null;
        /** Only while the player is online. */
        activeNumber?: string | null;
        carried?: { number: string; color: string; active: boolean }[];
    } | null;
}

interface AdminSimRow {
    number:     string;
    identity:   string;
    ownerCid?:  string | null;
    createdAt?: number;
}

export interface AdminNumberRow {
    number:       string;
    identity:     string;
    ownerCid?:    string | null;
    ownerName?:   string | null;
    createdAt?:   number;
    boundProfile: boolean;
    holder?: { cid?: string | null; name?: string | null } | null;
}

export interface AdminSimLookup {
    number:       string;
    identity:     string;
    ownerCid?:    string | null;
    ownerName?:   string | null;
    boundProfile: boolean;
    holder?: { cid?: string | null; name?: string | null; active: boolean } | null;
}

export interface AdminBirdyProfile {
    handle:      string;
    displayName: string;
    bio:         string;
    verified:    boolean;
    verifiedType?: string | null;
    loggedIn:    boolean;
    protected:   boolean;
    createdAt?:  number;
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
    verifiedType?: string | null;
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

export interface AdminContentMedia {
    url:    string;
    video?: string | null;
    audio?: string | null;
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
    imageUrl?:     string | null;
    media?:        AdminContentMedia[] | null;
    likes?:        number | null;
    comments?:     number | null;
    views?:        number | null;
    price?:        number | null;
}

export interface AdminThreadItem {
    id:            string;
    createdAt:     number;
    authorCid?:    string | null;
    authorName?:   string | null;
    authorOnline?: boolean;
    handle?:       string | null;
    body?:         string | null;
    kind?:         string | null;
    direction?:    string | null;
    media?:        AdminContentMedia[] | null;
    likes?:        number | null;
    anchor?:       boolean;
}

export type AdminFlagStatus = 'open' | 'actioned' | 'dismissed';

export interface AdminFlag {
    id:            number;
    app:           string;
    targetId:      string;
    ruleId:        string;
    ruleLabel:     string;
    matched:       string;
    authorCid?:    string | null;
    authorName?:   string | null;
    authorOnline?: boolean;
    excerpt:       string;
    status:        AdminFlagStatus;
    handledName?:  string | null;
    handledAt?:    number | null;
    createdAt:     number;
}

export interface AdminBinEntry {
    id:            number;
    app:           string;
    targetId:      string;
    excerpt:       string;
    lost?:         string | null;
    authorCid?:    string | null;
    authorName?:   string | null;
    authorOnline?: boolean;
    adminName?:    string | null;
    restoredAt?:   number | null;
    restoredBy?:   string | null;
    createdAt:     number;
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

export interface AdminMediaItem {
    app:       string;
    id:        string;
    url:       string;
    video?:    string;
    author:    string;
    createdAt: number;
}

export interface AdminLivePlayer {
    source: number;
    name:   string;
    cid:    string;
    x:      number;
    y:      number;
}

export interface AdminTrends {
    messages?:   number[];
    calls?:      number[];
    birdyPosts?: number[];
    cloutPosts?: number[];
    photos?:     number[];
    accounts?:   number[];
}

export interface AdminStats {
    phones:      number;
    appAccounts: number;
    birdyPosts:  number;
    messages:    number;
    activeMutes: number;
    online:      number;
    openFlags?:  number;
    trends?:     AdminTrends;
    days?:       string[];
}

export interface MuteScopeDef {
    id:     string;
    label:  string;
    social: boolean;
}

// Mirrors SCOPES in server/admin/moderation.lua.
export const MUTE_SCOPES: MuteScopeDef[] = [
    { id: 'birdy',     label: 'Squawk',    social: true },
    { id: 'photogram', label: 'Photogram', social: true },
    { id: 'vibez',     label: 'Clout',     social: true },
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
    if (!d) return '—';
    return formatPhone(d);
}

export type MigrationDomainStatus = 'pending' | 'done' | 'disabled';

export interface MigrationDomain {
    key:       string;
    label:     string;
    title?:    string;
    blurb?:    string;
    rows:      number;
    status:    MigrationDomainStatus;
    requires?: string;
    estimate:  string;
    locked?:   boolean;
    summary?:  string;
    stats?:    Record<string, number>;
}

export interface MigrationIdentity {
    total:      number;
    resolved:   number;
    unresolved: number;
    ambiguous:  number;
}

export interface MigrationScan {
    lbFound:   boolean;
    busy:      boolean;
    domains:   MigrationDomain[];
    totalRows: number;
    estimate?: string;
    identity?: MigrationIdentity;
}

export type MigrationPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export type MigrationRunStatus = 'queued' | 'running' | 'done' | 'failed';

export interface MigrationRunDomain {
    status:   MigrationRunStatus;
    rows:     number;
    summary?: string;
}

export interface MigrationState {
    phase:         MigrationPhase;
    dryRun?:       boolean;
    by?:           string;
    startedAt?:    number;
    finishedAt?:   number;
    totalRows?:    number;
    doneRows?:     number;
    currentDomain?: string;
    currentRows?:  number;
    currentTotal?: number;
    currentStage?: 'reading' | 'building' | 'writing';
    writeDone?:    number;
    writeTotal?:   number;
    etaSeconds?:   number;
    okCount?:      number;
    failedList?:   string[];
    identity?:     MigrationIdentity;
    domains?:      Record<string, MigrationRunDomain>;
}

export interface MigrationLine {
    id:    number;
    at:    number;
    level: 'info' | 'warn' | 'error' | 'ok';
    text:  string;
}

export interface MigrationSample {
    t:    number;
    rows: number;
}

export interface MigrationMark {
    t:   number;
    key: string;
}

export interface MigrationSnapshot {
    state:   MigrationState;
    lines:   MigrationLine[];
    series?: MigrationSample[];
    marks?:  MigrationMark[];
}

export interface MigrationPush {
    reset?: boolean;
    state?: MigrationState;
    lines?: MigrationLine[];
}
