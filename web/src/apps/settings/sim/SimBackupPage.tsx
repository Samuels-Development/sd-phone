import { useCallback, useEffect, useState } from 'react';

import { t } from '@/i18n';
import { fetchNui, isFiveM } from '@/core/nui';
import { formatPhone } from '@/lib/phone';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AlertDialog } from '@/ui/AlertDialog';
import { PromptDialog } from '@/ui/PromptDialog';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

interface SimListEntry {
    number: string;
    color: string;
    active: boolean;
}

interface BackupProfile {
    device: string;
    color?: string | null;
    number?: string | null;
    syncedAt?: number;
    thisPhone: boolean;
    restorable: boolean;
}

interface SimInfo {
    mode: 'container' | 'metadata';
    hasSim: boolean;
    number?: string;
    color?: string;
    sims: SimListEntry[];
    ejectable: boolean;
    backupOn: boolean;
    hasPassword: boolean;
    backupEnabled: boolean;
    autoSync: boolean;
    syncedAt?: number;
    profiles: BackupProfile[];
    maxProfiles: number;
    canRestore: boolean;
}

type Envelope<T> = { success: boolean; data?: T; message?: string };

const DEV_INFO: SimInfo = {
    mode: 'metadata', hasSim: true, number: '2075550149', color: 'yellow',
    sims: [
        { number: '2075550149', color: 'yellow', active: true },
        { number: '3125550188', color: 'black', active: false },
    ],
    ejectable: true, backupOn: true, hasPassword: true, backupEnabled: true, autoSync: true,
    syncedAt: Math.floor(Date.now() / 1000) - 4200,
    profiles: [
        { device: 'device:aaa', color: 'yellow', number: '2075550149', syncedAt: Math.floor(Date.now() / 1000) - 4200, thisPhone: true, restorable: true },
        { device: 'device:bbb', color: 'black', number: '3125550188', syncedAt: Math.floor(Date.now() / 1000) - 90000, thisPhone: false, restorable: true },
    ],
    maxProfiles: 3, canRestore: true,
};

function colorLabel(color: string): string {
    return color.charAt(0).toUpperCase() + color.slice(1);
}

function profileLabel(p: BackupProfile): string {
    const name = p.color
        ? t('settings.simColorPhone', '{color} Phone', { color: colorLabel(p.color) })
        : t('settings.simPhoneGeneric', 'Phone');
    return p.number ? `${name} · ${formatPhone(p.number)}` : name;
}

function timeAgo(epochSec: number | undefined): string {
    if (!epochSec) return t('settings.simBackupNever', 'Never');
    const s = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
    if (s < 60) return t('settings.simBackupJustNow', 'Just now');
    if (s < 3600) return t('settings.simBackupMinsAgo', '{n}m ago', { n: Math.floor(s / 60) });
    if (s < 86400) return t('settings.simBackupHoursAgo', '{n}h ago', { n: Math.floor(s / 3600) });
    return t('settings.simBackupDaysAgo', '{n}d ago', { n: Math.floor(s / 86400) });
}

/** Settings -> SIM & Backup (unique-phones mode): SIM status, eject, cloud backup + restore. */
export function SimBackupPage({ onBack }: { onBack: () => void }) {
    const [info,    setInfo]    = useState<SimInfo | null>(null);
    const [busy,    setBusy]    = useState(false);
    const [confirm, setConfirm] = useState<'eject' | null>(null);
    const [prompt,  setPrompt]  = useState<'enable' | 'restore' | null>(null);
    const [notice,  setNotice]  = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const [restoreDevice, setRestoreDevice] = useState<string | null>(null);
    const [deleteTarget,  setDeleteTarget]  = useState<BackupProfile | null>(null);

    const load = useCallback(async () => {
        if (!isFiveM) { setInfo(DEV_INFO); return; }
        const res = await fetchNui<Envelope<SimInfo>>('sd-phone:sim:get').catch(() => null);
        if (res?.success && res.data) setInfo(res.data);
    }, []);

    useEffect(() => { void load(); }, [load]);
    useNuiEvent('sd-phone:simState', useCallback(() => { void load(); }, [load]));

    async function disableBackup() {
        if (!info || busy) return;
        setBusy(true);
        const res = await fetchNui<Envelope<never>>('sd-phone:sim:backup:set', { on: false }).catch(() => null);
        setBusy(false);
        if (res?.success) setInfo({ ...info, backupEnabled: false });
        else if (res?.message) setNotice(res.message);
    }

    /** PromptDialog confirm: returns an error string to keep the dialog open, null to close. */
    async function enableBackup(password: string): Promise<string | null> {
        const res = await fetchNui<Envelope<never>>('sd-phone:sim:backup:set', { on: true, password }).catch(() => null);
        if (!res?.success) return res?.message ?? t('settings.simBackupFailed', 'Could not enable backup.');
        void load();
        setNotice(t('settings.simBackupSaved2', 'Cloud Backup is on and this phone was just backed up. Your password was saved to the Passwords app.'));
        return null;
    }

    async function restore(password: string): Promise<string | null> {
        const res = await fetchNui<Envelope<{ rows: number }>>('sd-phone:sim:backup:restore', { password, device: restoreDevice ?? undefined }).catch(() => null);
        if (!res?.success) return res?.message ?? t('settings.simRestoreFailed', 'Restore failed.');
        void load();
        setNotice(t('settings.simRestoreDone2', 'Backup restored onto this phone.'));
        return null;
    }

    /** Snapshot this phone into its own cloud profile. */
    async function syncNow() {
        if (!info || busy) return;
        setBusy(true);
        const res = await fetchNui<Envelope<{ syncedAt: number }>>('sd-phone:sim:backup:sync').catch(() => null);
        setBusy(false);
        if (res?.success) void load();
        else if (res?.message) setNotice(res.message);
    }

    /** Restore entry point: one restorable profile goes straight to the password prompt, more
     *  than one opens the picker list. */
    function startRestore() {
        const restorables = info?.profiles.filter(p => p.restorable) ?? [];
        if (restorables.length === 0) return;
        if (restorables.length === 1) {
            setRestoreDevice(restorables[0].device);
            setPrompt('restore');
        } else {
            setPicking(true);
        }
    }

    async function deleteProfile(p: BackupProfile) {
        if (busy) return;
        setBusy(true);
        const res = await fetchNui<Envelope<never>>('sd-phone:sim:backup:delete', { device: p.device }).catch(() => null);
        setBusy(false);
        if (!res?.success && res?.message) setNotice(res.message);
        void load();
    }

    async function setAutoSync(on: boolean) {
        if (!info || busy) return;
        setInfo({ ...info, autoSync: on });
        const res = await fetchNui<Envelope<never>>('sd-phone:sim:backup:setAuto', { on }).catch(() => null);
        if (!res?.success) {
            setInfo(prev => (prev ? { ...prev, autoSync: !on } : prev));
            if (res?.message) setNotice(res.message);
        }
    }

    async function eject() {
        setConfirm(null);
        if (busy) return;
        setBusy(true);
        const res = await fetchNui<Envelope<never>>('sd-phone:sim:eject').catch(() => null);
        setBusy(false);
        if (!res?.success && res?.message) setNotice(res.message);
        void load();
    }

    const number = info?.number ? formatPhone(info.number) : '—';
    const extraSims = info?.sims.filter(s => !s.active) ?? [];

    return (
        <>
            <SubPage title={t('settings.simBackup', 'SIM & Backup')} onBack={onBack}>
                <ListGroup footer={info?.mode === 'container'
                    ? t('settings.simFooterContainer', 'Your number lives on the SIM card in this phone. Open the phone in your inventory to swap the SIM.')
                    : t('settings.simFooterMetadata', 'Your number lives on the SIM card installed in this phone. Use a SIM card item to install it.')}>
                    <ListRow
                        label={t('settings.simStatus', 'SIM Status')}
                        value={info === null ? '…' : (info.hasSim ? t('settings.simInstalled', 'Installed') : t('settings.simNone', 'No SIM'))}
                        divider
                    />
                    <ListRow label={t('settings.myNumber', 'My Number')} value={info?.hasSim ? number : '—'} divider={!!info?.ejectable} />
                    {info?.ejectable && (
                        <ListRow
                            label={t('settings.simEject', 'Eject SIM Card')}
                            destructive
                            onPress={() => setConfirm('eject')}
                        />
                    )}
                </ListGroup>

                {extraSims.length > 0 && (
                    <ListGroup
                        header={t('settings.simOtherPhones', 'Other phones on you')}
                        footer={t('settings.simOtherPhonesFooter', 'These phones still receive their own calls and messages. Open one to act as its number.')}
                    >
                        {extraSims.map((s, i) => (
                            <ListRow
                                key={s.number}
                                label={colorLabel(s.color)}
                                value={formatPhone(s.number)}
                                chevron={false}
                                divider={i < extraSims.length - 1}
                            />
                        ))}
                    </ListGroup>
                )}

                {info?.backupOn && (
                    <ListGroup footer={t('settings.simBackupFooter3', 'Cloud Backup keeps a snapshot of this phone, protected by one password for all your backups (kept in your Passwords app). Auto Backup refreshes the snapshot when you put the phone away. Up to {max} phones can be backed up. Restoring brings back contacts, messages, photos and settings — never the phone number.', { max: info.maxProfiles })}>
                        <ToggleRow
                            label={t('settings.simBackupThisPhone', 'Back Up This Phone')}
                            on={info.backupEnabled}
                            onToggle={() => { if (info.backupEnabled) void disableBackup(); else setPrompt('enable'); }}
                            divider={info.backupEnabled || info.canRestore}
                        />
                        {info.backupEnabled && (
                            <ListRow
                                label={t('settings.simBackupNow', 'Back Up Now')}
                                value={busy ? '…' : timeAgo(info.syncedAt)}
                                onPress={() => { void syncNow(); }}
                                divider
                            />
                        )}
                        {info.backupEnabled && (
                            <ToggleRow
                                label={t('settings.simAutoBackup', 'Auto Backup')}
                                on={info.autoSync}
                                onToggle={() => { void setAutoSync(!info.autoSync); }}
                                divider={info.canRestore}
                            />
                        )}
                        {info.canRestore && (
                            <ListRow
                                label={t('settings.simRestore', 'Restore from Backup')}
                                onPress={startRestore}
                            />
                        )}
                    </ListGroup>
                )}

                {picking && (
                    <ListGroup header={t('settings.simRestorePick', 'Restore which backup?')}>
                        {(info?.profiles.filter(p => p.restorable) ?? []).map((p, i, arr) => (
                            <ListRow
                                key={p.device}
                                label={profileLabel(p)}
                                value={timeAgo(p.syncedAt)}
                                onPress={() => { setPicking(false); setRestoreDevice(p.device); setPrompt('restore'); }}
                                divider={i < arr.length}
                            />
                        ))}
                        <ListRow label={t('common.cancel', 'Cancel')} chevron={false} onPress={() => setPicking(false)} />
                    </ListGroup>
                )}

                {!picking && (info?.profiles.length ?? 0) > 0 && (
                    <ListGroup
                        header={t('settings.simBackedUpPhones', 'Backed-up phones')}
                        footer={t('settings.simBackedUpPhonesFooter', 'Tap a backup to delete it and free the slot. Deleting erases its cloud snapshot — the phone itself keeps its data.')}
                    >
                        {info!.profiles.map((p, i) => (
                            <ListRow
                                key={p.device}
                                label={p.thisPhone
                                    ? t('settings.simProfileThisPhone', '{label} (This Phone)', { label: profileLabel(p) })
                                    : profileLabel(p)}
                                value={timeAgo(p.syncedAt)}
                                onPress={() => setDeleteTarget(p)}
                                divider={i < info!.profiles.length - 1}
                            />
                        ))}
                    </ListGroup>
                )}
            </SubPage>

            {confirm === 'eject' && (
                <AlertDialog
                    title={t('settings.simEjectTitle', 'Eject SIM Card?')}
                    message={t('settings.simEjectMessage', 'The SIM card returns to your inventory and this phone loses service until a SIM is installed again.')}
                    confirmLabel={t('settings.simEjectConfirm', 'Eject')}
                    destructive
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => { void eject(); }}
                />
            )}

            {deleteTarget && (
                <AlertDialog
                    title={t('settings.simDeleteBackupTitle', 'Delete Backup?')}
                    message={t('settings.simDeleteBackupMessage', 'The cloud snapshot for {label} is erased and its slot freed. The phone itself keeps its data. This can\'t be undone.', { label: profileLabel(deleteTarget) })}
                    confirmLabel={t('settings.simDeleteBackupConfirm', 'Delete Backup')}
                    destructive
                    onCancel={() => setDeleteTarget(null)}
                    onConfirm={() => { const p = deleteTarget; setDeleteTarget(null); if (p) void deleteProfile(p); }}
                />
            )}

            {prompt === 'enable' && (
                <PromptDialog
                    title={t('settings.simCloudBackup', 'Cloud Backup')}
                    message={info?.hasPassword
                        ? t('settings.simBackupPasswordExisting', 'Enter your backup password — the one guarding your other backed-up phones. It\'s saved in their Passwords app.')
                        : t('settings.simBackupPasswordMsg', 'Set a backup password (4-32 characters). You will need it to restore on a new phone.')}
                    placeholder={t('settings.simBackupPassword', 'Backup password')}
                    maxLength={32}
                    confirmLabel={t('settings.simBackupEnable', 'Turn On')}
                    validate={v => v.trim().length < 4 ? t('settings.simBackupPasswordShort', 'At least 4 characters.') : null}
                    onCancel={() => setPrompt(null)}
                    onConfirm={async v => {
                        const err = await enableBackup(v.trim());
                        if (err) return err;
                        setPrompt(null);
                    }}
                />
            )}

            {prompt === 'restore' && (
                <PromptDialog
                    title={t('settings.simRestoreTitle', 'Restore from Backup?')}
                    message={t('settings.simRestorePasswordMsg', 'Your backed-up data will be copied onto this phone — the number stays the one on the current SIM. Enter your backup password.')}
                    placeholder={t('settings.simBackupPassword', 'Backup password')}
                    maxLength={32}
                    confirmLabel={t('settings.simRestoreConfirm', 'Restore')}
                    onCancel={() => setPrompt(null)}
                    onConfirm={async v => {
                        const err = await restore(v.trim());
                        if (err) return err;
                        setPrompt(null);
                    }}
                />
            )}

            {notice && (
                <AlertDialog
                    title={t('settings.simBackup', 'SIM & Backup')}
                    message={notice}
                    confirmLabel={t('common.ok', 'OK')}
                    hideCancel
                    onCancel={() => setNotice(null)}
                    onConfirm={() => setNotice(null)}
                />
            )}
        </>
    );
}
