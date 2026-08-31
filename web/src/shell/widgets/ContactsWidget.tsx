import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import type { WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import { dialCall } from '@/apps/phone/callsApi';
import { formatPhone, type Contact } from '@/apps/phone/data';
import { t } from '@/i18n';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { useContactsStore } from '@/stores/contactsStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { WidgetTile, palette } from './WidgetTile';
import { failText } from '@/core/api';

const GRID: Record<WidgetSize, { cols: number; rows: number; name: number }> = {
    sm: { cols: 2, rows: 2, name: 11 },
    md: { cols: 4, rows: 2, name: 12 },
    lg: { cols: 4, rows: 4, name: 12 },
};

const PAD = 14;
const ROW_GAP = 10;
const COL_GAP = 4;
const NAME_GAP = 4;
const AVATAR_MIN = 38;
const AVATAR_MAX = 72;
const NAME_CAP = 12;

function shorten(name: string): string {
    const clean = name.trim();
    if (clean.length <= NAME_CAP) return clean;
    return `${clean.slice(0, NAME_CAP - 1).trimEnd()}…`;
}

function avatarPx(size: WidgetSize, width: number, height: number): number {
    const { cols, rows, name } = GRID[size];
    const nameLine = Math.round(name * 1.2);
    const perRow = (height - PAD * 2 - ROW_GAP * (rows - 1)) / rows;
    const perCol = (width - PAD * 2 - COL_GAP * (cols - 1)) / cols;
    const byHeight = perRow - NAME_GAP - nameLine;
    return Math.max(AVATAR_MIN, Math.min(AVATAR_MAX, Math.floor(Math.min(byHeight, perCol - 6))));
}

function Avatar({ c, px }: { c: Contact; px: number }) {
    return (
        <div
            className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white"
            style={{ width: px, height: px, background: c.color || '#8e8e93', fontSize: Math.round(px * 0.36) }}
        >
            {c.avatar
                ? <img src={c.avatar} alt="" draggable={false} className="h-full w-full object-cover" />
                : c.initials}
        </div>
    );
}

function Tile({ c, px, name, fg, onCall, onRemove }: {
    c: Contact; px: number; name: number; fg: string; onCall: () => void; onRemove: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={t('phone.callName', 'Call {name}', { name: c.name })}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onCall(); }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            className="flex min-w-0 flex-col items-center active:opacity-60"
            style={{ gap: NAME_GAP }}
        >
            <Avatar c={c} px={px} />
            <span className="w-full truncate text-center leading-tight" style={{ color: fg, fontSize: name }}>
                {shorten(c.name)}
            </span>
        </button>
    );
}

function AddSlot({ px, name, p, onAdd }: {
    px: number; name: number; p: ReturnType<typeof palette>; onAdd: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={t('widgets.addContact', 'Add contact')}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onAdd(); }}
            className="flex min-w-0 flex-col items-center active:opacity-60"
            style={{ gap: NAME_GAP }}
        >
            <span
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{ width: px, height: px, border: `1.5px dashed ${p.rule}`, color: p.faint }}
            >
                <Plus className="h-1/2 w-1/2" strokeWidth={2.2} />
            </span>
            <span className="w-full truncate text-center leading-tight" style={{ color: p.faint, fontSize: name }}>
                {t('widgets.add', 'Add')}
            </span>
        </button>
    );
}

export function ContactsWidget({ size, width, height, theme = 'dark', picks, onPicks }: {
    size: WidgetSize; width: number; height: number; theme?: WidgetTheme;
    picks?: string[];
    onPicks?: (ids: string[]) => void;
}) {
    const contacts = useContactsStore(s => s.contacts);
    useEffect(() => { void useContactsStore.getState().load(); }, []);
    const p = palette(theme);
    const [picking, setPicking] = useState(false);
    const [callTarget, setCallTarget] = useState<Contact | null>(null);
    const [dialError, setDialError] = useState<string | null>(null);

    const chosen = (picks ?? [])
        .map(id => contacts.find(c => c.id === id))
        .filter((c): c is Contact => !!c);

    const { cols, rows, name } = GRID[size];
    const px = avatarPx(size, width, height);
    const capacity = cols * rows;
    const shown = chosen.slice(0, capacity);
    const canAdd = !!onPicks && shown.length < capacity;

    const add = (c: Contact) => {
        setPicking(false);
        if (!picks?.includes(c.id)) onPicks?.([...(picks ?? []), c.id]);
    };
    const remove = (id: string) => onPicks?.((picks ?? []).filter(x => x !== id));

    async function placeCall(c: Contact) {
        if (!c.phone) return;
        const res = await dialCall(c.phone, c.name);
        if (!res.success) setDialError(failText(res, t('phone.unableToPlaceCall', 'Unable to place call')));
    }

    return (
        <>
            <WidgetTile
                width={width}
                height={height}
                radius={size === 'sm' ? 22 : 26}
                hairline={false}
                tint={p.bg}
                glass={theme === 'glass'}
            >
                <div
                    className="grid h-full w-full justify-items-center"
                    style={{
                        padding: PAD,
                        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                        columnGap: COL_GAP,
                        rowGap: ROW_GAP,
                        alignContent: 'start',
                    }}
                >
                    {shown.map(c => (
                        <Tile
                            key={c.id} c={c} px={px} name={name} fg={p.fg}
                            onCall={() => setCallTarget(c)}
                            onRemove={() => remove(c.id)}
                        />
                    ))}
                    {canAdd && <AddSlot px={px} name={name} p={p} onAdd={() => setPicking(true)} />}
                </div>
            </WidgetTile>

            <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                {picking && (
                    <ContactPickerSheet onPick={add} onClose={() => setPicking(false)} />
                )}

                {callTarget !== null && (
                    <AlertDialog
                        title={t('phone.callName', 'Call {name}', { name: callTarget.name || formatPhone(callTarget.phone) })}
                        message={t('phone.callConfirm', 'Call {name}?', { name: callTarget.name || formatPhone(callTarget.phone) })}
                        cancelLabel={t('phone.cancel', 'Cancel')}
                        confirmLabel={t('phone.call', 'Call')}
                        onCancel={() => setCallTarget(null)}
                        onConfirm={() => { void placeCall(callTarget); setCallTarget(null); }}
                    />
                )}

                {dialError !== null && (
                    <AlertDialog
                        title={t('phone.callFailed', 'Call Failed')}
                        message={dialError}
                        confirmLabel={t('phone.ok', 'OK')}
                        hideCancel
                        onCancel={() => setDialError(null)}
                        onConfirm={() => setDialError(null)}
                    />
                )}
            </div>
        </>
    );
}
