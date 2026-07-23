import { BadgeCheck, ChevronRight, File as FileIcon, FileText, Folder, Image as ImageIcon, Lock, MoreHorizontal } from 'lucide-react';

import { t } from '@/i18n';
import { ListRow } from '@/ui/ListGroup';
import { formatDocDate, formatSize, type DocFile, type DocFolder } from './data';

/** Trailing ellipsis affordance for the row action sheet. A span, not a button - the whole
 *  ListRow already is one, and nesting native buttons is invalid. */
function MoreGlyph({ onMore }: { onMore: () => void }) {
    return (
        <span
            onClick={e => { e.stopPropagation(); onMore(); }}
            aria-label={t('documents.moreActions', 'More actions')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ios-gray active:bg-black/10 dark:active:bg-white/10"
        >
            <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={2.2} />
        </span>
    );
}

/** Full-bleed hairline between rows (edge to edge, per the Files list style). */
function RowDivider() {
    return <div aria-hidden className="h-[0.5px] w-full bg-ios-gray4 dark:bg-control" />;
}

export function FolderRow({ folder, count, onOpen, onMore, divider }: {
    folder:  DocFolder;
    count:   number;
    onOpen:  () => void;
    onMore:  () => void;
    divider?: boolean;
}) {
    return (
        <>
            <ListRow
                large
                label={folder.name}
                sub={count === 1
                    ? t('documents.oneItem', '1 item')
                    : t('documents.nItems', '{n} items', { n: count })}
                left={
                    <span className="flex h-12 w-12 items-center justify-center">
                        <Folder className="h-[34px] w-[34px] text-ios-blue" strokeWidth={2} fill="currentColor" />
                    </span>
                }
                right={
                    <span className="flex items-center gap-0.5">
                        <MoreGlyph onMore={onMore} />
                        <ChevronRight className="h-[16px] w-[16px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                    </span>
                }
                chevron={false}
                onPress={onOpen}
            />
            {divider && <RowDivider />}
        </>
    );
}

function KindIcon({ doc }: { doc: DocFile }) {
    if (doc.kind === 'image' && doc.url) {
        return (
            <img
                src={doc.url}
                alt=""
                className="h-12 w-12 rounded-[8px] object-cover"
                draggable={false}
                style={{ border: '0.5px solid rgba(0,0,0,0.12)' }}
            />
        );
    }
    const Icon = doc.kind === 'image' ? ImageIcon : doc.kind === 'file' ? FileIcon : FileText;
    return <Icon className="h-[32px] w-[32px] text-ios-gray" strokeWidth={1.8} />;
}

export function FileRow({ doc, onOpen, onMore, divider }: {
    doc:     DocFile;
    onOpen:  () => void;
    onMore:  () => void;
    divider?: boolean;
}) {
    const parts = [formatDocDate(doc.updatedAt)];
    if (doc.size > 0) parts.push(formatSize(doc.size));
    return (
        <>
            <ListRow
                large
                label={doc.name}
                sub={parts.join('  ·  ')}
                left={
                    <span className="flex h-12 w-12 items-center justify-center">
                        <KindIcon doc={doc} />
                    </span>
                }
                right={
                    <span className="flex items-center gap-1">
                        {doc.signed && <BadgeCheck className="h-[15px] w-[15px] shrink-0 text-ios-blue" strokeWidth={2.2} />}
                        {doc.locked && <Lock className="h-[14px] w-[14px] shrink-0 text-ios-gray" strokeWidth={2.4} />}
                        <MoreGlyph onMore={onMore} />
                    </span>
                }
                chevron={false}
                onPress={onOpen}
            />
            {divider && <RowDivider />}
        </>
    );
}
