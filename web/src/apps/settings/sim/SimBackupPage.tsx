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

interface SimInfo {
    mode: 'container' | 'metadata';
    hasSim: boolean;
    number?: string;
    color?: string;
    sims: SimListEntry[];
    ejectable: boolean;
    backupOn: boolean;
    backupEnabled: boolean;
    canRestore: boolean;
}

type Envelope<T> = { success: boolean; data?: T; message?: string };

const DEV_INFO: SimInfo = {
    mode: 'metadata', hasSim: true, number: '2075550149', color: 'yellow',
    sims: [
        { number: '2075550149', color: 'yellow', active: true },
        { number: '3125550188', color: 'black', active: false },
    ],
    ejectable: true, backupOn: true, backupEnabled: false, canRestore: true,
};

function colorLabel(color: string): string {
    return color.charAt(0).toUpperCase() + color.slice(1);
}

/** Settings -> SIM & Backup (unique-phones mode): SIM status, eject, cloud backup + restore. */
export function SimBackupPage({ onBack }: { onBack: () => void }) {
    const [info,    setInfo]    = useState<SimInfo | null>(null);
    const [busy,    setBusy]    = useState(false);
    const [confirm, setConfirm] = useState<'eject' | null>(null);
    const [prompt,  setPrompt]  = useState<'enable' | 'restore' | null>(null);
    const [notice,  setNotice]  = useState<string | null>(null);

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
        setNotice(t('settings.simBackupSaved', 'Cloud Backup is on. Your password was saved to the Passwords app.'));
        return null;
    }

    async function restore(password: string): Promise<string | null> {
        const res = await fetchNui<Envelope<{ rows: number }>>('sd-phone:sim:backup:restore', { password }).catch(() => null);
        if (!res?.success) return res?.message ?? t('settings.simRestoreFailed', 'Restore failed.');
        void load();
        setNotice(t('settings.simRestoreDone', 'Backup restored. Reopen your apps to see the data.'));
        return null;
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
                    <ListGroup footer={t('settings.simBackupFooter', 'Cloud Backup belongs to your character, protected by a password kept in your Passwords app. Restoring on a new phone brings back your contacts, messages, photos and settings — never the phone number. A lost number is lost.')}>
                        <ToggleRow
                            label={t('settings.simCloudBackup', 'Cloud Backup')}
                            on={info.backupEnabled}
                            onToggle={() => { if (info.backupEnabled) void disableBackup(); else setPrompt('enable'); }}
                            divider={info.canRestore}
                        />
                        {info.canRestore && (
                            <ListRow
                                label={t('settings.simRestore', 'Restore from Backup')}
                                onPress={() => setPrompt('restore')}
                            />
                        )}
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

            {prompt === 'enable' && (
                <PromptDialog
                    title={t('settings.simCloudBackup', 'Cloud Backup')}
                    message={t('settings.simBackupPasswordMsg', 'Set a backup password (4-32 characters). You will need it to restore on a new phone.')}
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
