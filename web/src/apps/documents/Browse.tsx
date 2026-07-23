import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, FolderPlus, FolderSearch, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { ActionSheet } from '@/ui/ActionSheet';
import { EmptyState } from '@/ui/EmptyState';
import { GroupCard } from '@/ui/ListGroup';
import { PromptDialog } from '@/ui/PromptDialog';
import { portalToPhoneScreen } from '@/ui/portal';
import { SearchBar } from '@/ui/SearchBar';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { FileRow, FolderRow } from './DocRow';
import { childDocs, childFolders, countChildren, MAX_NAME_LENGTH, type DocFile, type DocFolder, type DocList } from './data';

interface Props {
    list:           DocList;
    onOpenDoc:      (doc: DocFile) => void;
    onMoreDoc:      (doc: DocFile) => void;
    onMoreFolder:   (folder: DocFolder) => void;
    onCreateFolder: (name: string, parentId: string | null) => void;
    onCreateDoc:    (name: string, folderId: string | null) => void;
    onImportImage:  (name: string, url: string, folderId: string | null) => void;
    animateIn:      boolean;
}

const noop = () => {};

function FolderView({ folderId, title, backLabel, list, onBack, onOpenFolder, onOpenDoc, onMoreDoc, onMoreFolder, onAdd, animateIn }: {
    folderId:     string | null;
    title:        string;
    backLabel?:   string;
    list:         DocList;
    onBack?:      () => void;
    onOpenFolder: (folder: DocFolder) => void;
    onOpenDoc:    (doc: DocFile) => void;
    onMoreDoc:    (doc: DocFile) => void;
    onMoreFolder: (folder: DocFolder) => void;
    onAdd:        (folderId: string | null) => void;
    animateIn:    boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack ?? noop, !!onBack && animateIn);
    const [query, setQuery] = useState('');

    const folders = childFolders(list, folderId);
    const docs    = childDocs(list, folderId);

    const q = query.trim().toLowerCase();
    const fShown = q ? folders.filter(f => f.name.toLowerCase().includes(q)) : folders;
    const dShown = q ? docs.filter(d => d.name.toLowerCase().includes(q)) : docs;
    const total  = fShown.length + dShown.length;

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            {onBack && (
                <div className="flex items-center justify-between px-2 pt-1">
                    <button type="button" onClick={goBack} className="flex items-center gap-0.5 text-ios-blue active:opacity-60">
                        <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.5} />
                        <span className="text-[17px]">{backLabel}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onAdd(folderId)}
                        aria-label={t('documents.create', 'Create')}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-ios-blue active:bg-black/5 dark:active:bg-white/10"
                    >
                        <Plus className="h-[24px] w-[24px]" strokeWidth={2.5} />
                    </button>
                </div>
            )}

            <div className={`flex items-center justify-between pl-4 pr-2.5 ${onBack ? 'pt-0.5' : 'pt-1'}`}>
                <h1 className="min-w-0 truncate text-[34px] font-bold tracking-tight">{title}</h1>
                {!onBack && (
                    <button
                        type="button"
                        onClick={() => onAdd(folderId)}
                        aria-label={t('documents.create', 'Create')}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ios-blue active:bg-black/5 dark:active:bg-white/10"
                    >
                        <Plus className="h-[27px] w-[27px]" strokeWidth={2.4} />
                    </button>
                )}
            </div>
            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-3 mt-2" />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                {total === 0 ? (
                    q ? (
                        <EmptyState
                            icon={FolderSearch}
                            title={t('documents.noResults', 'No Results')}
                            subtitle={t('documents.noResultsSub', 'No documents match "{q}".', { q: query.trim() })}
                        />
                    ) : folderId === null ? (
                        <EmptyState
                            icon={FolderPlus}
                            title={t('documents.noDocuments', 'No Documents')}
                            subtitle={t('documents.noDocumentsSub', 'Tap + to create a folder or document.')}
                        />
                    ) : (
                        <EmptyState
                            icon={FolderPlus}
                            title={t('documents.emptyFolder', 'Empty Folder')}
                            subtitle={t('documents.emptyFolderSub', 'Tap + to add a document here.')}
                        />
                    )
                ) : (
                    <GroupCard>
                        {fShown.map((folder, i) => (
                            <FolderRow
                                key={folder.id}
                                folder={folder}
                                count={countChildren(list, folder.id)}
                                onOpen={() => onOpenFolder(folder)}
                                onMore={() => onMoreFolder(folder)}
                                divider={i < fShown.length - 1 || dShown.length > 0}
                            />
                        ))}
                        {dShown.map((doc, i) => (
                            <FileRow
                                key={doc.id}
                                doc={doc}
                                onOpen={() => onOpenDoc(doc)}
                                onMore={() => onMoreDoc(doc)}
                                divider={i < dShown.length - 1}
                            />
                        ))}
                    </GroupCard>
                )}
            </div>
        </div>
    );
}

type PromptKind = 'folder' | 'doc';

export function Browse({ list, onOpenDoc, onMoreDoc, onMoreFolder, onCreateFolder, onCreateDoc, onImportImage, animateIn }: Props) {
    const [path, setPath] = useSessionState<string[]>('documents:path', []);
    const [addFor,  setAddFor]  = useState<{ folderId: string | null } | null>(null);
    // Depth restored from session state on mount (tab switches remount Browse). Folders at
    // or below this depth were already open, so they render at rest instead of replaying
    // the drill-in push; the ref shrinks with the path so re-entering a folder animates.
    const restoredDepth = useRef(path.length);
    useEffect(() => {
        if (path.length < restoredDepth.current) restoredDepth.current = path.length;
    }, [path]);
    const [prompt,  setPrompt]  = useState<{ kind: PromptKind; folderId: string | null } | null>(null);
    const [picking, setPicking] = useState<{ folderId: string | null } | null>(null);

    // Rebuild the visible chain from live folders so a deleted/moved folder truncates it.
    const chain = useMemo(() => {
        const out: DocFolder[] = [];
        let parent: string | null = null;
        for (const id of path) {
            const folder = list.folders.find(f => f.id === id && (f.parentId ?? null) === parent);
            if (!folder) break;
            out.push(folder);
            parent = id;
        }
        return out;
    }, [path, list.folders]);

    const openFolder = (folder: DocFolder) => setPath(p => [...p, folder.id]);

    return (
        <>
            <FolderView
                folderId={null}
                title={t('documents.browse', 'Browse')}
                list={list}
                onOpenFolder={openFolder}
                onOpenDoc={onOpenDoc}
                onMoreDoc={onMoreDoc}
                onMoreFolder={onMoreFolder}
                onAdd={folderId => setAddFor({ folderId })}
                animateIn={false}
            />

            {chain.map((folder, i) => (
                <FolderView
                    key={folder.id}
                    folderId={folder.id}
                    title={folder.name}
                    backLabel={i === 0 ? t('documents.browse', 'Browse') : chain[i - 1].name}
                    list={list}
                    onBack={() => setPath(p => p.slice(0, i))}
                    onOpenFolder={openFolder}
                    onOpenDoc={onOpenDoc}
                    onMoreDoc={onMoreDoc}
                    onMoreFolder={onMoreFolder}
                    onAdd={folderId => setAddFor({ folderId })}
                    animateIn={animateIn && i >= restoredDepth.current}
                />
            ))}

            {addFor && (
                <ActionSheet
                    onClose={() => setAddFor(null)}
                    actions={[
                        {
                            label: t('documents.newFolder', 'New Folder'),
                            onClick: () => setPrompt({ kind: 'folder', folderId: addFor.folderId }),
                        },
                        {
                            label: t('documents.newDocument', 'New Document'),
                            onClick: () => setPrompt({ kind: 'doc', folderId: addFor.folderId }),
                        },
                        {
                            label: t('documents.importPhoto', 'Import Photo'),
                            onClick: () => setPicking({ folderId: addFor.folderId }),
                        },
                    ]}
                />
            )}

            {/* Portaled like Sheet/ActionSheet: Browse lives above the tab bar, so an in-place
                dialog would dim and blur only the content area and leave the tab bar sharp. */}
            {prompt && portalToPhoneScreen(
                <PromptDialog
                    title={prompt.kind === 'folder' ? t('documents.newFolder', 'New Folder') : t('documents.newDocument', 'New Document')}
                    label={t('documents.name', 'Name')}
                    placeholder={prompt.kind === 'folder' ? t('documents.folderNamePlaceholder', 'Folder name') : t('documents.documentNamePlaceholder', 'Document name')}
                    maxLength={MAX_NAME_LENGTH}
                    confirmLabel={t('documents.create', 'Create')}
                    onCancel={() => setPrompt(null)}
                    onConfirm={value => {
                        const name = value.trim();
                        if (!name) return t('documents.nameRequired', 'Please enter a name.');
                        if (prompt.kind === 'folder') onCreateFolder(name, prompt.folderId);
                        else onCreateDoc(name, prompt.folderId);
                        setPrompt(null);
                    }}
                />
            )}

            {picking && (
                <MediaPickerSheet
                    onSelect={photo => {
                        const name = t('documents.importedPhotoName', 'Photo {n}', { n: new Date().toLocaleDateString() });
                        onImportImage(name, photo.url, picking.folderId);
                        setPicking(null);
                    }}
                    onClose={() => setPicking(null)}
                />
            )}
        </>
    );
}
