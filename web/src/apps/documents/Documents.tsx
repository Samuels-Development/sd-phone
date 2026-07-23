import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Folder } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useDidEnter } from '@/hooks/useDidEnter';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { ActionSheet } from '@/ui/ActionSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { PromptDialog } from '@/ui/PromptDialog';
import { Sheet } from '@/ui/Sheet';
import { TabBar } from '@/ui/TabBar';
import { ShareSheet } from '@/shared/ShareSheet';
import {
    apiCreateDoc, apiCreateFolder, apiDeleteDoc, apiDeleteFolder, apiDuplicateDoc,
    apiGetDoc, apiImportImage, apiList, apiMoveDoc, apiRenameDoc, apiRenameFolder,
    apiSaveDoc, shareDocumentApi,
} from './documentsApi';
import { Browse } from './Browse';
import { Recents } from './Recents';
import { TextEditor } from './TextEditor';
import { MoveSheet } from './MoveSheet';
import {
    ALLOW_SHARE, MAX_NAME_LENGTH, formatDocDate, formatSize, nowSec,
    type DocFile, type DocFolder, type DocList,
} from './data';

type Tab = 'browse' | 'recents';
type Renaming = { kind: 'doc' | 'folder'; id: string; name: string };

const EMPTY: DocList = { folders: [], docs: [] };

export function Documents({ onClose: _onClose }: { onClose: () => void }) {
    const [tab, setTab]   = useSessionState<Tab>('documents:tab', 'browse');
    const [list, setList] = useState<DocList>(EMPTY);

    const { refetch } = useAsyncData(() => apiList(), [], { onData: setList });

    const deckActive = useDeckActive();
    const wasActive  = useRef(deckActive);
    useEffect(() => {
        if (deckActive && !wasActive.current) refetch();
        wasActive.current = deckActive;
    }, [deckActive, refetch]);

    const mergeDoc = useCallback((doc: DocFile) => {
        setList(prev => prev.docs.some(d => d.id === doc.id)
            ? { ...prev, docs: prev.docs.map(d => (d.id === doc.id ? { ...d, ...doc } : d)) }
            : { ...prev, docs: [doc, ...prev.docs] });
    }, []);

    useNuiEvent('sd-phone:documents:added', useCallback((data) => {
        if (data?.doc) mergeDoc(data.doc);
    }, [mergeDoc]));

    useNuiEvent('sd-phone:documents:receive', useCallback((data) => {
        if (data?.doc) mergeDoc(data.doc);
    }, [mergeDoc]));

    const [openText,   setOpenText]   = useState<DocFile | null>(null);
    const [lightbox,   setLightbox]   = useState<DocFile | null>(null);
    const [fileInfo,   setFileInfo]   = useState<DocFile | null>(null);
    const [moreDoc,    setMoreDoc]    = useState<DocFile | null>(null);
    const [moreFolder, setMoreFolder] = useState<DocFolder | null>(null);
    const [renaming,   setRenaming]   = useState<Renaming | null>(null);
    const [moving,     setMoving]     = useState<DocFile | null>(null);
    const [sharing,    setSharing]    = useState<DocFile | null>(null);
    const [delDoc,     setDelDoc]     = useState<DocFile | null>(null);
    const [delFolder,  setDelFolder]  = useState<DocFolder | null>(null);

    const animateNav = useDidEnter();

    const patchDoc = useCallback((id: string, fn: (d: DocFile) => DocFile) => {
        setList(prev => ({ ...prev, docs: prev.docs.map(d => (d.id === id ? fn(d) : d)) }));
    }, []);

    function removeFolderCascade(rootId: string) {
        setList(prev => {
            const ids = new Set<string>([rootId]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const f of prev.folders) {
                    if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
                }
            }
            return {
                folders: prev.folders.filter(f => !ids.has(f.id)),
                docs:    prev.docs.filter(d => !(d.folderId && ids.has(d.folderId))),
            };
        });
    }

    async function openDoc(doc: DocFile) {
        if (doc.kind === 'image') { setLightbox(doc); return; }
        if (doc.kind === 'file')  { setFileInfo(doc); return; }
        const full = await apiGetDoc(doc.id);
        setOpenText(full ?? { ...doc, content: doc.content ?? '' });
    }

    async function createFolder(name: string, parentId: string | null) {
        const folder = await apiCreateFolder(name, parentId);
        if (folder) setList(prev => ({ ...prev, folders: [...prev.folders, folder] }));
    }

    async function createDoc(name: string, folderId: string | null) {
        const doc = await apiCreateDoc(name, folderId);
        if (!doc) return;
        setList(prev => ({ ...prev, docs: [doc, ...prev.docs] }));
        setOpenText({ ...doc, content: doc.content ?? '' });
    }

    async function importImage(name: string, url: string, folderId: string | null) {
        const doc = await apiImportImage(name, url, folderId);
        if (doc) setList(prev => ({ ...prev, docs: [doc, ...prev.docs] }));
    }

    async function saveText(id: string, content: string) {
        const res = await apiSaveDoc(id, content);
        if (!res) return;
        const { size, updatedAt } = res;
        patchDoc(id, d => ({ ...d, content, size, updatedAt }));
        setOpenText(prev => (prev && prev.id === id ? { ...prev, content, size, updatedAt } : prev));
    }

    async function doRename(r: Renaming, name: string) {
        if (r.kind === 'doc') {
            const ok = await apiRenameDoc(r.id, name);
            if (ok) patchDoc(r.id, d => ({ ...d, name, updatedAt: nowSec() }));
        } else {
            const ok = await apiRenameFolder(r.id, name);
            if (ok) setList(prev => ({ ...prev, folders: prev.folders.map(f => (f.id === r.id ? { ...f, name } : f)) }));
        }
    }

    async function doMove(doc: DocFile, folderId: string | null) {
        const ok = await apiMoveDoc(doc.id, folderId);
        if (ok) patchDoc(doc.id, d => ({ ...d, folderId }));
    }

    async function doDuplicate(doc: DocFile) {
        const copy = await apiDuplicateDoc(doc.id);
        if (copy) setList(prev => ({ ...prev, docs: [copy, ...prev.docs] }));
    }

    async function doDeleteDoc(doc: DocFile) {
        const ok = await apiDeleteDoc(doc.id);
        if (ok) setList(prev => ({ ...prev, docs: prev.docs.filter(d => d.id !== doc.id) }));
    }

    async function doDeleteFolder(folder: DocFolder) {
        const res = await apiDeleteFolder(folder.id);
        if (res !== null) removeFolderCascade(folder.id);
    }

    const docActions = moreDoc ? [
        ...(moreDoc.locked || moreDoc.signed ? [] : [{
            label: t('documents.rename', 'Rename'),
            onClick: () => setRenaming({ kind: 'doc', id: moreDoc.id, name: moreDoc.name }),
        }]),
        ...(moreDoc.locked ? [] : [{ label: t('documents.move', 'Move'), onClick: () => setMoving(moreDoc) }]),
        { label: t('documents.duplicate', 'Duplicate'), onClick: () => void doDuplicate(moreDoc) },
        ...(ALLOW_SHARE && !moreDoc.locked ? [{ label: t('documents.share', 'Share'), onClick: () => setSharing(moreDoc) }] : []),
        ...(moreDoc.locked ? [] : [{
            label: t('documents.delete', 'Delete'),
            destructive: true,
            onClick: () => setDelDoc(moreDoc),
        }]),
    ] : [];

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white">
            <div className="relative flex-1 overflow-hidden">
                <div key={tab} className="absolute inset-0 animate-swipe-in-left">
                    {tab === 'browse' ? (
                        <Browse
                            list={list}
                            animateIn={animateNav}
                            onOpenDoc={doc => void openDoc(doc)}
                            onMoreDoc={setMoreDoc}
                            onMoreFolder={setMoreFolder}
                            onCreateFolder={(name, parentId) => void createFolder(name, parentId)}
                            onCreateDoc={(name, folderId) => void createDoc(name, folderId)}
                            onImportImage={(name, url, folderId) => void importImage(name, url, folderId)}
                        />
                    ) : (
                        <Recents
                            list={list}
                            onOpenDoc={doc => void openDoc(doc)}
                            onMoreDoc={setMoreDoc}
                        />
                    )}
                </div>
            </div>

            <TabBar<Tab>
                active={tab}
                onChange={setTab}
                tabs={[
                    { id: 'browse',  label: t('documents.browse', 'Browse'),   icon: a => <Folder className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
                    { id: 'recents', label: t('documents.recents', 'Recents'), icon: a => <Clock className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
                ]}
            />

            {openText && (
                <TextEditor
                    doc={openText}
                    backLabel={t('documents.filesRoot', 'Files')}
                    animateIn={animateNav}
                    onBack={() => setOpenText(null)}
                    onSave={content => void saveText(openText.id, content)}
                    onSigned={updated => {
                        patchDoc(updated.id, d => ({ ...d, signed: true }));
                        setOpenText(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
                    }}
                />
            )}

            {lightbox?.url && (
                <ImageLightbox src={lightbox.url} onClose={() => setLightbox(null)} />
            )}

            {fileInfo && (
                <Sheet onClose={() => setFileInfo(null)} fit="content" title={fileInfo.name} className="bg-[#ececec] dark:bg-surface">
                    {() => (
                        <div className="px-5 pb-6 pt-1 text-[15px]">
                            <InfoRow label={t('documents.kind', 'Kind')} value={t('documents.kindFile', 'File')} />
                            <InfoRow label={t('documents.size', 'Size')} value={formatSize(fileInfo.size)} />
                            {fileInfo.source && <InfoRow label={t('documents.source', 'Source')} value={fileInfo.source} />}
                            <InfoRow label={t('documents.created', 'Created')} value={formatDocDate(fileInfo.createdAt)} />
                            <InfoRow label={t('documents.modified', 'Modified')} value={formatDocDate(fileInfo.updatedAt)} />
                        </div>
                    )}
                </Sheet>
            )}

            {moreDoc && (
                <ActionSheet
                    onClose={() => setMoreDoc(null)}
                    actions={docActions}
                />
            )}

            {moreFolder && (
                <ActionSheet
                    onClose={() => setMoreFolder(null)}
                    actions={[
                        { label: t('documents.rename', 'Rename'), onClick: () => setRenaming({ kind: 'folder', id: moreFolder.id, name: moreFolder.name }) },
                        { label: t('documents.delete', 'Delete'), destructive: true, onClick: () => setDelFolder(moreFolder) },
                    ]}
                />
            )}

            {renaming && (
                <PromptDialog
                    title={renaming.kind === 'folder' ? t('documents.renameFolder', 'Rename Folder') : t('documents.renameDocument', 'Rename Document')}
                    label={t('documents.name', 'Name')}
                    initialValue={renaming.name}
                    maxLength={MAX_NAME_LENGTH}
                    confirmLabel={t('documents.save', 'Save')}
                    onCancel={() => setRenaming(null)}
                    onConfirm={value => {
                        const name = value.trim();
                        if (!name) return t('documents.nameRequired', 'Please enter a name.');
                        void doRename(renaming, name);
                        setRenaming(null);
                    }}
                />
            )}

            {moving && (
                <MoveSheet
                    folders={list.folders}
                    currentFolderId={moving.folderId}
                    onClose={() => setMoving(null)}
                    onSelect={folderId => void doMove(moving, folderId)}
                />
            )}

            {sharing && (
                <ShareSheet
                    onClose={() => setSharing(null)}
                    onShare={target => shareDocumentApi(target.id, sharing.id)}
                />
            )}

            {delDoc && (
                <AlertDialog
                    title={t('documents.deleteDocTitle', 'Delete Document?')}
                    message={t('documents.deleteDocBody', '"{name}" will be permanently deleted.', { name: delDoc.name })}
                    confirmLabel={t('documents.delete', 'Delete')}
                    destructive
                    onCancel={() => setDelDoc(null)}
                    onConfirm={() => { void doDeleteDoc(delDoc); setDelDoc(null); }}
                />
            )}

            {delFolder && (
                <AlertDialog
                    title={t('documents.deleteFolderTitle', 'Delete Folder?')}
                    message={t('documents.deleteFolderBody', '"{name}" and everything inside it will be permanently deleted.', { name: delFolder.name })}
                    confirmLabel={t('documents.delete', 'Delete')}
                    destructive
                    onCancel={() => setDelFolder(null)}
                    onConfirm={() => { void doDeleteFolder(delFolder); setDelFolder(null); }}
                />
            )}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between border-b border-black/[0.06] py-2.5 last:border-0 dark:border-white/[0.08]">
            <span className="text-ios-gray">{label}</span>
            <span className="max-w-[60%] truncate font-medium text-black dark:text-white">{value}</span>
        </div>
    );
}
