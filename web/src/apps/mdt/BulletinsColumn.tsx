import { useMemo, useState } from 'react';
import { Megaphone, MoreHorizontal, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { Scroller } from '@/ui/Scroller';
import { formatListDate } from '@/lib/time';
import { isFiveM } from '@/core/nui';
import { useTheme } from '@/stores/themeStore';
import type { Bulletin } from './data';
import { mdtColumnTitle, mdtRowBody, mdtRowHover, mdtRowMeta, mdtRowTitle } from './mdtTheme';
import { mdtDeleteBulletin, mdtSaveBulletin } from './mdtApi';
import { MdtButton } from './ui/MdtButton';
import { MdtField } from './ui/MdtField';
import { MdtPopover } from './ui/MdtPopover';
import { useMdtSession } from './useMdtSession';

interface Draft {
    id:    number | null;
    title: string;
    body:  string;
}

interface Menu {
    anchor:   HTMLElement;
    bulletin: Bulletin;
}

function draftOf(bulletin: Bulletin): Draft {
    return { id: bulletin.id, title: bulletin.title, body: bulletin.body };
}

export function BulletinsColumn({ bulletins, onChanged, className = '' }: {
    bulletins:  Bulletin[];
    onChanged:  (rows: Bulletin[]) => void;
    className?: string;
}) {
    const { can } = useMdtSession();
    const { theme } = useTheme('theme');
    const dark = theme === 'dark';

    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);

    const manage = can('bulletins.manage');

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return bulletins;
        return bulletins.filter(b =>
            b.title.toLowerCase().includes(q) || b.body.toLowerCase().includes(q));
    }, [bulletins, query]);

    async function save() {
        if (!draft || saving) return;
        const title = draft.title.trim();
        const body = draft.body.trim();
        if (!title || !body) return;
        setSaving(true);
        const saved = await mdtSaveBulletin({ id: draft.id, title, body });
        setSaving(false);
        if (!saved) return;
        onChanged(draft.id
            ? bulletins.map(b => (b.id === saved.id ? saved : b))
            : [saved, ...bulletins]);
        setDraft(null);
    }

    async function remove(id: number) {
        setPendingDelete(null);
        if (draft?.id === id) setDraft(null);
        const ok = await mdtDeleteBulletin(id);
        if (ok) onChanged(bulletins.filter(b => b.id !== id));
    }

    const confirm = pendingDelete !== null && (
        <AlertDialog
            title={t('mdt.deleteBulletinTitle', 'Delete Bulletin?')}
            message={t('mdt.deleteBulletinBody', 'It will be pulled from every terminal in the department.')}
            confirmLabel={t('common.delete', 'Delete')}
            destructive
            forceDark={dark}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => void remove(pendingDelete)}
        />
    );

    if (draft) {
        const valid = draft.title.trim().length > 0 && draft.body.trim().length > 0;
        return (
            <div className={`flex min-h-0 min-w-[268px] flex-1 flex-col ${className}`}>
                <div className="flex min-h-[26px] shrink-0 items-center gap-2 px-4 pt-4">
                    <h2 className={`min-w-0 truncate ${mdtColumnTitle}`}>
                        {draft.id
                            ? t('mdt.editBulletin', 'Edit Bulletin')
                            : t('mdt.newBulletin', 'New Bulletin')}
                    </h2>
                    <span className="flex-1" />
                    <MdtButton size="sm" variant="text" onClick={() => setDraft(null)}>
                        {t('common.cancel', 'Cancel')}
                    </MdtButton>
                    <MdtButton size="sm" disabled={!valid || saving} onClick={() => void save()}>
                        {t('mdt.post', 'Post')}
                    </MdtButton>
                </div>

                <Scroller className="min-h-0 flex-1 px-4 pb-4 pt-3">
                    <div className="flex flex-col gap-3">
                        <MdtField
                            autoFocus
                            label={t('mdt.bulletinTitle', 'Title')}
                            value={draft.title}
                            onChange={v => setDraft(d => (d ? { ...d, title: v } : d))}
                            placeholder={t('mdt.bulletinTitlePlaceholder', 'Shift briefing')}
                            maxLength={80}
                        />
                        <MdtField
                            multiline
                            rows={9}
                            label={t('mdt.bulletinBody', 'Message')}
                            value={draft.body}
                            onChange={v => setDraft(d => (d ? { ...d, body: v } : d))}
                            placeholder={t('mdt.bulletinBodyPlaceholder', 'What every unit needs to know before they roll out.')}
                            maxLength={1200}
                        />
                        {draft.id !== null && (
                            <MdtButton variant="destructive" onClick={() => setPendingDelete(draft.id)}>
                                {t('mdt.deleteBulletin', 'Delete bulletin')}
                            </MdtButton>
                        )}
                    </div>
                </Scroller>

                {confirm}
            </div>
        );
    }

    return (
        <div className={`relative flex min-h-0 min-w-[268px] flex-1 flex-col ${className}`}>
            <ListColumn
                title={t('mdt.bulletinBoard', 'Bulletin Board')}
                count={bulletins.length || undefined}
                search={{
                    value:       query,
                    onChange:    setQuery,
                    placeholder: t('mdt.searchBulletins', 'Search bulletins'),
                }}
                action={manage ? (
                    <MdtButton
                        size="sm"
                        icon={<Plus className="h-[13px] w-[13px]" strokeWidth={3} />}
                        onClick={() => setDraft({ id: null, title: '', body: '' })}
                    >
                        {t('mdt.add', 'Add')}
                    </MdtButton>
                ) : undefined}
                isEmpty={rows.length === 0}
                empty={(
                    <EmptyState
                        center
                        icon={Megaphone}
                        title={query.trim()
                            ? t('mdt.noBulletinMatches', 'No Matches')
                            : t('mdt.noBulletins', 'No Bulletins Posted')}
                        subtitle={query.trim()
                            ? t('mdt.noBulletinMatchesSub', 'Nothing on the board matches that search.')
                            : manage
                                ? t('mdt.noBulletinsManage', 'Post a briefing and every terminal in the department sees it.')
                                : t('mdt.noBulletinsSub', 'Command has not posted a briefing yet.')}
                    />
                )}
            >
                {rows.map((b, i) => (
                    <div
                        key={b.id}
                        role={manage ? 'button' : undefined}
                        tabIndex={manage ? 0 : undefined}
                        onClick={manage ? () => setDraft(draftOf(b)) : undefined}
                        onKeyDown={manage
                            ? e => {
                                if (e.key === 'Enter' || (e.key === ' ' && !isFiveM)) {
                                    e.preventDefault();
                                    setDraft(draftOf(b));
                                }
                            }
                            : undefined}
                        className={`relative px-4 py-3 ${manage ? `cursor-pointer ${mdtRowHover}` : ''}`}
                    >
                        <div className="flex items-start gap-2">
                            <div className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{b.title}</div>
                            {manage && (
                                <button
                                    type="button"
                                    aria-label={t('mdt.bulletinActions', 'Bulletin actions')}
                                    onClick={e => {
                                        e.stopPropagation();
                                        setMenu({ anchor: e.currentTarget, bulletin: b });
                                    }}
                                    className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors hover:bg-black/[0.06] active:bg-black/[0.1] dark:hover:bg-white/[0.08]"
                                >
                                    <MoreHorizontal className="h-[16px] w-[16px]" strokeWidth={2.4} />
                                </button>
                            )}
                        </div>
                        <p className={`mt-1 line-clamp-2 ${mdtRowBody}`}>{b.body}</p>
                        <div className={`mt-1.5 flex items-center gap-1.5 ${mdtRowMeta}`}>
                            <span className="min-w-0 truncate">{b.authorCallsign || b.author}</span>
                            <span className="shrink-0 opacity-40">&bull;</span>
                            <span className="shrink-0">{formatListDate(b.createdAt * 1000)}</span>
                        </div>
                        {i < rows.length - 1 && (
                            <span
                                className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control"
                                style={{ height: '0.5px' }}
                            />
                        )}
                    </div>
                ))}
            </ListColumn>

            {menu && (
                <MdtPopover
                    anchor={menu.anchor}
                    onClose={() => setMenu(null)}
                    actions={[
                        {
                            label:   t('common.edit', 'Edit'),
                            onClick: () => setDraft(draftOf(menu.bulletin)),
                        },
                        {
                            label:       t('common.delete', 'Delete'),
                            destructive: true,
                            onClick:     () => setPendingDelete(menu.bulletin.id),
                        },
                    ]}
                />
            )}

            {confirm}
        </div>
    );
}
