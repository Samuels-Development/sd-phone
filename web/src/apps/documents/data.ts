import { formatListDate } from '@/lib/time';

type DocKind = 'text' | 'image' | 'file';

export interface DocFolder {
    id:       string;
    name:     string;
    parentId: string | null;
}

export interface DocSignature {
    id:       string;
    /** Signer display name, frozen at signing time server-side. */
    signer:   string;
    /** PNG data-URL of the drawn signature; null renders the cursive-name fallback. */
    image?:   string | null;
    signedAt: number;
}

export interface DocFile {
    id:        string;
    name:      string;
    kind:      DocKind;
    folderId:  string | null;
    size:      number;
    locked:    boolean;
    /** True when the document carries at least one signature (content + name frozen). */
    signed?:   boolean;
    /** Present on full reads only, like content. */
    signatures?: DocSignature[];
    source?:   string | null;
    url?:      string | null;
    content?:  string;
    createdAt: number;
    updatedAt: number;
}

export interface DocList {
    folders: DocFolder[];
    docs:    DocFile[];
}

export const MAX_TEXT_LENGTH = 25000;
export const MAX_NAME_LENGTH = 60;
export const RECENTS_LIMIT   = 30;
export const ALLOW_SHARE     = true;

export function nowSec(): number {
    return Math.floor(Date.now() / 1000);
}

export function byteLength(str: string): number {
    let n = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
        else n += 3;
    }
    return n;
}

export function formatSize(bytes: number): string {
    if (!bytes || bytes < 1) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function formatDocDate(epochSecs: number): string {
    return formatListDate(epochSecs * 1000);
}

export function childFolders(list: DocList, parentId: string | null): DocFolder[] {
    return list.folders
        .filter(f => (f.parentId ?? null) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function childDocs(list: DocList, folderId: string | null): DocFile[] {
    return list.docs
        .filter(d => (d.folderId ?? null) === folderId)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function countChildren(list: DocList, folderId: string): number {
    return list.folders.filter(f => (f.parentId ?? null) === folderId).length
        + list.docs.filter(d => (d.folderId ?? null) === folderId).length;
}

// Depth-first folder ordering with an indentation depth, for the move picker.
export function orderedFolders(folders: DocFolder[]): { folder: DocFolder; depth: number }[] {
    const out: { folder: DocFolder; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
        folders
            .filter(f => (f.parentId ?? null) === parent)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(f => { out.push({ folder: f, depth }); walk(f.id, depth + 1); });
    };
    walk(null, 0);
    return out;
}

const SAMPLE = 'This is a sample document. In dev mode the Files app runs entirely off local mocks so every screen is navigable without the game.';

export const MOCK_FOLDERS: DocFolder[] = [
    { id: 'f-work',     name: 'Work',     parentId: null },
    { id: 'f-personal', name: 'Personal', parentId: null },
    { id: 'f-reports',  name: 'Reports',  parentId: 'f-work' },
];

export const MOCK_DOCS: DocFile[] = [
    { id: 'd-todo',    name: 'To-do',            kind: 'text',  folderId: null,        size: byteLength(SAMPLE), locked: false, content: SAMPLE, createdAt: nowSec() - 3600,  updatedAt: nowSec() - 600 },
    {
        id: 'd-contract', name: 'Sales Contract', kind: 'text', folderId: null, size: byteLength(SAMPLE),
        locked: false, signed: true, content: SAMPLE, createdAt: nowSec() - 14400, updatedAt: nowSec() - 14400,
        signatures: [{ id: 's-1', signer: 'Jordan Reyes', image: null, signedAt: nowSec() - 14000 }],
    },
    { id: 'd-lease',   name: 'Apartment Lease',  kind: 'text',  folderId: 'f-personal', size: byteLength(SAMPLE), locked: true,  source: 'sd-housing', content: SAMPLE, createdAt: nowSec() - 86400, updatedAt: nowSec() - 86400 },
    { id: 'd-q3',      name: 'Q3 Summary',       kind: 'text',  folderId: 'f-reports',  size: byteLength(SAMPLE), locked: false, content: SAMPLE, createdAt: nowSec() - 7200,  updatedAt: nowSec() - 7200 },
    { id: 'd-photo',   name: 'Site Photo',       kind: 'image', folderId: 'f-work',     size: 184320,             locked: false, url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800', createdAt: nowSec() - 5400, updatedAt: nowSec() - 5400 },
    { id: 'd-receipt', name: 'Receipt.pdf',      kind: 'file',  folderId: null,        size: 51200,              locked: false, source: 'sd-banking', url: 'https://example.com/receipt.pdf', createdAt: nowSec() - 9000, updatedAt: nowSec() - 9000 },
];
