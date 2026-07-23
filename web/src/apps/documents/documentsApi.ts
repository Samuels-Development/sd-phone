import { isFiveM } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';
import { newId } from '@/lib/format';
import {
    MOCK_DOCS, MOCK_FOLDERS, byteLength, nowSec,
    type DocFile, type DocFolder, type DocList, type DocSignature,
} from './data';

// Dev store: a mutable in-memory mirror so isFiveM=false is fully navigable
// (create / rename / move / duplicate / delete all persist for the session).
const devFolders: DocFolder[] = MOCK_FOLDERS.map(f => ({ ...f }));
const devDocs:    DocFile[]   = MOCK_DOCS.map(d => ({ ...d }));
let devSignature: string | null = null;

function strip(d: DocFile): DocFile {
    const { content: _content, ...rest } = d;
    return rest;
}

function devSnapshot(): DocList {
    return {
        folders: devFolders.map(f => ({ ...f })),
        docs:    devDocs.map(strip),
    };
}

export async function apiList(): Promise<DocList | null> {
    if (!isFiveM) return devSnapshot();
    return apiData<DocList>('sd-phone:documents:list');
}

export async function apiGetDoc(id: string): Promise<DocFile | null> {
    if (!isFiveM) {
        const found = devDocs.find(d => d.id === id);
        return found ? { ...found } : null;
    }
    return (await apiData<{ doc: DocFile }>('sd-phone:documents:get', { id }))?.doc ?? null;
}

export async function apiCreateFolder(name: string, parentId: string | null): Promise<DocFolder | null> {
    if (!isFiveM) {
        const folder: DocFolder = { id: newId('f'), name: name.trim(), parentId };
        devFolders.push(folder);
        return { ...folder };
    }
    return (await apiData<{ folder: DocFolder }>('sd-phone:documents:createFolder', { name, parentId: parentId ?? undefined }))?.folder ?? null;
}

export async function apiCreateDoc(name: string, folderId: string | null): Promise<DocFile | null> {
    if (!isFiveM) {
        const ts = nowSec();
        const doc: DocFile = { id: newId('d'), name: name.trim(), kind: 'text', folderId, size: 0, locked: false, content: '', createdAt: ts, updatedAt: ts };
        devDocs.push(doc);
        return { ...doc };
    }
    return (await apiData<{ doc: DocFile }>('sd-phone:documents:createDoc', { name, folderId: folderId ?? undefined }))?.doc ?? null;
}

export async function apiSaveDoc(id: string, content: string): Promise<{ updatedAt: number; size: number } | null> {
    if (!isFiveM) {
        const doc = devDocs.find(d => d.id === id);
        if (!doc || doc.locked) return null;
        doc.content = content;
        doc.size = byteLength(content);
        doc.updatedAt = nowSec();
        return { updatedAt: doc.updatedAt, size: doc.size };
    }
    return apiData<{ updatedAt: number; size: number }>('sd-phone:documents:save', { id, content });
}

export async function apiRenameDoc(id: string, name: string): Promise<boolean> {
    if (!isFiveM) {
        const doc = devDocs.find(d => d.id === id);
        if (!doc || doc.locked) return false;
        doc.name = name.trim();
        doc.updatedAt = nowSec();
        return true;
    }
    return (await apiCall('sd-phone:documents:rename', { id, name })).success;
}

export async function apiRenameFolder(id: string, name: string): Promise<boolean> {
    if (!isFiveM) {
        const folder = devFolders.find(f => f.id === id);
        if (!folder) return false;
        folder.name = name.trim();
        return true;
    }
    return (await apiCall('sd-phone:documents:renameFolder', { id, name })).success;
}

export async function apiMoveDoc(id: string, folderId: string | null): Promise<boolean> {
    if (!isFiveM) {
        const doc = devDocs.find(d => d.id === id);
        if (!doc) return false;
        doc.folderId = folderId;
        return true;
    }
    return (await apiCall('sd-phone:documents:move', { id, folderId: folderId ?? undefined })).success;
}

export async function apiDuplicateDoc(id: string): Promise<DocFile | null> {
    if (!isFiveM) {
        const src = devDocs.find(d => d.id === id);
        if (!src) return null;
        const ts = nowSec();
        const copy: DocFile = { ...src, id: newId('d'), name: `${src.name} copy`, locked: false, source: null, createdAt: ts, updatedAt: ts };
        devDocs.push(copy);
        return { ...copy };
    }
    return (await apiData<{ doc: DocFile }>('sd-phone:documents:duplicate', { id }))?.doc ?? null;
}

export async function apiImportImage(name: string, url: string, folderId: string | null): Promise<DocFile | null> {
    if (!isFiveM) {
        const ts = nowSec();
        const doc: DocFile = { id: newId('d'), name: name.trim(), kind: 'image', folderId, size: 0, locked: false, url, createdAt: ts, updatedAt: ts };
        devDocs.push(doc);
        return { ...doc };
    }
    return (await apiData<{ doc: DocFile }>('sd-phone:documents:importImage', { name, url, folderId: folderId ?? undefined }))?.doc ?? null;
}

export async function apiDeleteDoc(id: string): Promise<boolean> {
    if (!isFiveM) {
        const i = devDocs.findIndex(d => d.id === id);
        if (i < 0) return false;
        devDocs.splice(i, 1);
        return true;
    }
    return (await apiCall('sd-phone:documents:delete', { id })).success;
}

export async function apiDeleteFolder(id: string): Promise<number | null> {
    if (!isFiveM) {
        const ids = new Set<string>([id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const f of devFolders) {
                if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
            }
        }
        let removed = 0;
        for (let i = devDocs.length - 1; i >= 0; i--) {
            if (devDocs[i].folderId && ids.has(devDocs[i].folderId as string)) { devDocs.splice(i, 1); removed++; }
        }
        for (let i = devFolders.length - 1; i >= 0; i--) {
            if (ids.has(devFolders[i].id)) devFolders.splice(i, 1);
        }
        return removed;
    }
    return (await apiData<{ removedDocs: number }>('sd-phone:documents:deleteFolder', { id }))?.removedDocs ?? null;
}

export async function shareDocumentApi(target: number, id: string): Promise<boolean> {
    if (!isFiveM) return true;
    return (await apiCall('sd-phone:documents:share', { target, id })).success;
}

export async function apiGetSignature(): Promise<string | null> {
    if (!isFiveM) return devSignature;
    return (await apiData<{ image?: string | null }>('sd-phone:documents:signature:get'))?.image ?? null;
}

export async function apiSetSignature(image: string): Promise<boolean> {
    if (!isFiveM) {
        devSignature = image;
        return true;
    }
    return (await apiCall('sd-phone:documents:signature:set', { image })).success;
}

export async function apiSignDoc(id: string): Promise<DocFile | null> {
    if (!isFiveM) {
        const doc = devDocs.find(d => d.id === id);
        if (!doc || doc.kind !== 'text' || doc.signed || doc.signable === false || !devSignature) return null;
        const sig: DocSignature = { id: newId('s'), signer: 'You', image: devSignature, signedAt: nowSec() };
        doc.signed = true;
        doc.signatures = [...(doc.signatures ?? []), sig];
        return { ...doc };
    }
    return (await apiData<{ doc: DocFile }>('sd-phone:documents:sign', { id }))?.doc ?? null;
}
