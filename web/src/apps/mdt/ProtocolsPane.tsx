import { useMemo, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pill, type PillTone } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';

import { mdtDeleteProtocol, mdtProtocols, mdtSaveProtocol } from './mdtApi';
import { useMdtSession, useViewEnter } from './useMdtSession';
import { MdtButton } from './ui/MdtButton';
import { MdtField } from './ui/MdtField';
import {
    mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, mdtSegmentedDense,
} from './mdtTheme';
import { MdtCard } from './ui/MdtCard';
import type { Protocol, ProtocolCategory, ProtocolPriority } from './data';

const PRIORITY_TONE: Record<ProtocolPriority, PillTone> = {
    immediate: 'red',
    urgent:    'orange',
    routine:   'blue',
};

type CategoryFilter = 'all' | ProtocolCategory;

function categoryLabel(category: ProtocolCategory): string {
    switch (category) {
        case 'assessment': return t('mdt.protoAssessment', 'Assessment');
        case 'airway':     return t('mdt.protoAirway', 'Airway');
        case 'cardiac':    return t('mdt.protoCardiac', 'Cardiac');
        case 'trauma':     return t('mdt.protoTrauma', 'Trauma');
        case 'medical':    return t('mdt.protoMedical', 'Medical');
        default:           return t('mdt.protoAdmin', 'Admin');
    }
}

function priorityLabel(priority: ProtocolPriority): string {
    switch (priority) {
        case 'immediate': return t('mdt.protoImmediate', 'Immediate');
        case 'urgent':    return t('mdt.protoUrgent', 'Urgent');
        default:          return t('mdt.protoRoutine', 'Routine');
    }
}

const BLANK: Protocol = {
    code: '', label: '', category: 'medical', priority: 'routine', description: '', body: '',
};

function ProtocolEditor({ protocol, enter, onCancel, onSaved }: {
    protocol: Protocol | null;
    enter:    string;
    onCancel: () => void;
    onSaved:  () => void;
}) {
    const [draft, setDraft] = useState<Protocol>(protocol ?? BLANK);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = <K extends keyof Protocol>(key: K, value: Protocol[K]) =>
        setDraft(d => ({ ...d, [key]: value }));

    async function save() {
        if (!draft.code.trim() || !draft.label.trim()) {
            setError(t('mdt.protocolNeedsCode', 'A code and a title are both required.'));
            return;
        }
        setSaving(true);
        const saved = await mdtSaveProtocol({ ...draft, code: draft.code.trim(), label: draft.label.trim() });
        setSaving(false);
        if (!saved) { setError(t('mdt.protocolSaveFailed', 'That could not be saved.')); return; }
        onSaved();
    }

    async function remove() {
        if (!protocol) return;
        setSaving(true);
        const ok = await mdtDeleteProtocol(protocol.code);
        setSaving(false);
        if (!ok) { setError(t('mdt.deleteFailed', 'That could not be deleted.')); return; }
        onSaved();
    }

    return (
        <Scroller key="edit" className={`h-full ${mdtPanePad} ${enter}`}>
            <h1 className="text-[26px] font-bold tracking-ios-display text-black dark:text-white">
                {protocol ? t('mdt.editProtocol', 'Edit protocol') : t('mdt.newProtocol', 'New protocol')}
            </h1>

            <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <MdtField
                    label={t('mdt.code', 'Code')}
                    value={draft.code}
                    onChange={v => set('code', v)}
                    placeholder="TP 101"
                    maxLength={16}
                    disabled={protocol !== null}
                />
                <MdtField
                    label={t('mdt.category', 'Category')}
                    value={draft.category}
                    onChange={v => set('category', v as ProtocolCategory)}
                    options={(['assessment', 'airway', 'cardiac', 'trauma', 'medical', 'admin'] as ProtocolCategory[])
                        .map(c => ({ value: c, label: categoryLabel(c) }))}
                />
                <MdtField
                    label={t('mdt.urgency', 'Urgency')}
                    value={draft.priority}
                    onChange={v => set('priority', v as ProtocolPriority)}
                    options={(['immediate', 'urgent', 'routine'] as ProtocolPriority[])
                        .map(p => ({ value: p, label: priorityLabel(p) }))}
                />
            </div>

            <div className="mt-4">
                <MdtField
                    label={t('mdt.title', 'Title')}
                    value={draft.label}
                    onChange={v => set('label', v)}
                    maxLength={120}
                />
            </div>

            <div className="mt-4">
                <MdtField
                    label={t('mdt.summary', 'Summary')}
                    value={draft.description}
                    onChange={v => set('description', v)}
                    maxLength={255}
                    hint={t('mdt.protocolSummaryHint', 'One line, shown in the list.')}
                />
            </div>

            <div className="mt-4">
                <MdtField
                    label={t('mdt.standingOrder', 'Standing order')}
                    value={draft.body}
                    onChange={v => set('body', v)}
                    multiline
                    rows={10}
                    maxLength={4000}
                />
            </div>

            {error && <div className="mt-4 text-[14px] text-ios-red">{error}</div>}

            <div className="mt-5 flex items-center gap-3 pb-6">
                <MdtButton variant="filled" disabled={saving} onClick={() => void save()}>
                    {saving ? t('mdt.saving', 'Saving') : t('common.save', 'Save')}
                </MdtButton>
                <MdtButton onClick={onCancel}>{t('common.cancel', 'Cancel')}</MdtButton>
                <span className="flex-1" />
                {protocol && (
                    <MdtButton variant="destructive" disabled={saving} onClick={() => void remove()}>
                        {t('common.delete', 'Delete')}
                    </MdtButton>
                )}
            </div>
        </Scroller>
    );
}

function ProtocolSheet({ protocol, canManage, enter, onEdit }: {
    protocol:  Protocol;
    canManage: boolean;
    enter:     string;
    onEdit:    () => void;
}) {
    return (
        <Scroller key="read" className={`h-full ${mdtPanePad} ${enter}`}>
            <div className="flex flex-wrap items-center gap-3">
                <span className={mdtRef}>{protocol.code}</span>
                <Pill tone={PRIORITY_TONE[protocol.priority]}>{priorityLabel(protocol.priority)}</Pill>
                <Pill tone="green">{categoryLabel(protocol.category)}</Pill>
            </div>
            <div className="flex flex-wrap items-start gap-3">
                <h1 className="mt-1 min-w-0 flex-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                    {protocol.label}
                </h1>
                {canManage && (
                    <MdtButton variant="filled" size="sm" className="mt-1.5" onClick={onEdit}>
                        {t('common.edit', 'Edit')}
                    </MdtButton>
                )}
            </div>
            <div className={`mt-1 ${mdtRowMeta}`}>{protocol.description}</div>

            <div className={`mt-6 ${mdtSectionHeader}`}>{t('mdt.standingOrder', 'Standing order')}</div>
            <MdtCard className="mt-2 p-5">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-black dark:text-white">
                    {protocol.body || t('mdt.noProtocolBody', 'No detail recorded for this protocol.')}
                </p>
            </MdtCard>
            <div className="h-6" />
        </Scroller>
    );
}

export function ProtocolsPane() {
    const { selected, select, can } = useMdtSession();
    const canManage = can('protocols.manage');

    const [query, setQuery] = useSessionState('mdt:protocols:query', '');
    const [filter, setFilter] = useSessionState<CategoryFilter>('mdt:protocols:filter', 'all');
    const [editing, setEditing] = useState<'new' | 'current' | null>(null);

    const { data, refetch } = useAsyncData(mdtProtocols, []);
    const rows = useMemo(() => data ?? [], [data]);
    const enter = useViewEnter(editing ? 'edit' : data ? 'read' : null);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(p => {
            if (filter !== 'all' && p.category !== filter) return false;
            if (!q) return true;
            return p.label.toLowerCase().includes(q)
                || p.code.toLowerCase().includes(q)
                || p.description.toLowerCase().includes(q);
        });
    }, [rows, query, filter]);

    const current = shown.find(p => p.code === selected) ?? rows.find(p => p.code === selected);

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.protocols', 'Protocols')}
            count={shown.length || undefined}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchProtocols', 'Title, code or summary')}
            action={canManage ? (
                <MdtButton
                    size="sm"
                    icon={<Plus className="h-[13px] w-[13px]" strokeWidth={3} />}
                    onClick={() => { select(null); setEditing('new'); }}
                >
                    {t('mdt.create', 'Create')}
                </MdtButton>
            ) : undefined}
            isEmpty={shown.length === 0}
            empty={(
                <EmptyState
                    center
                    icon={ClipboardList}
                    title={t('mdt.noProtocolMatches', 'No matches')}
                    subtitle={t('mdt.noProtocolMatchesSub', 'No standing order matches that search.')}
                />
            )}
        >
            <div className="px-1 pb-1">
                <SegmentedControl<CategoryFilter>
                    className={mdtSegmentedDense}
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: t('common.all', 'All') },
                        { value: 'assessment', label: categoryLabel('assessment') },
                        { value: 'airway', label: categoryLabel('airway') },
                        { value: 'cardiac', label: categoryLabel('cardiac') },
                        { value: 'trauma', label: categoryLabel('trauma') },
                        { value: 'medical', label: categoryLabel('medical') },
                        { value: 'admin', label: categoryLabel('admin') },
                    ]}
                />
            </div>
            <div className="mdt-stagger flex flex-col gap-0.5">
                {shown.map(p => (
                    <button
                        key={p.code}
                        type="button"
                        onClick={() => select(p.code)}
                        className={`w-full rounded-[10px] px-3 py-2.5 text-left ${
                            p.code === selected ? 'bg-ios-blue/10' : mdtRowHover
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <span className={mdtRef}>{p.code}</span>
                            <Pill tone={PRIORITY_TONE[p.priority]}>{priorityLabel(p.priority)}</Pill>
                        </div>
                        <div className={`mt-1 truncate ${mdtRowTitle}`}>{p.label}</div>
                        <div className={`mt-0.5 truncate ${mdtRowMeta}`}>{p.description}</div>
                    </button>
                ))}
            </div>
        </ListColumn>
    );

    const done = () => { setEditing(null); refetch(); };

    const detail = editing
        ? (
            <ProtocolEditor
                key={editing === 'new' ? 'new' : current?.code}
                protocol={editing === 'current' ? current ?? null : null}
                enter={enter}
                onCancel={() => setEditing(null)}
                onSaved={done}
            />
        )
        : current
            ? (
                <ProtocolSheet
                    key={current.code}
                    protocol={current}
                    canManage={canManage}
                    enter={enter}
                    onEdit={() => setEditing('current')}
                />
            )
            : undefined;

    return (
        <MasterDetail
            master={master}
            detail={detail}
            placeholder={
                <EmptyState
                    center
                    icon={ClipboardList}
                    title={t('mdt.pickProtocol', 'No protocol selected')}
                    subtitle={t('mdt.pickProtocolSub', 'Open a standing order to read it in full.')}
                />
            }
            onCloseDetail={() => select(null)}
        />
    );
}
