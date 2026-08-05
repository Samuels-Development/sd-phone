import { useState } from 'react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { Toggle } from '@/ui/Toggle';
import { IG, type ProfileData } from '../data';

export function EditProfile({ profile, onCancel, onSave, onSignOut, onSignOutAll, onSwitchAccount, onDelete, switchTo }: {
    onSwitchAccount: () => void;
    profile:      ProfileData;
    onCancel:     () => void;
    onSave:       (p: ProfileData) => void;
    onSignOut:    () => void;
    onSignOutAll: () => void;
    onDelete:     () => void;
    switchTo?:    string | null;
}) {
    const [name,   setName]   = useState(profile.name);
    const [bio,    setBio]    = useState(profile.bio);
    const [avatar, setAvatar] = useState(profile.avatar);
    const [priv,   setPriv]   = useState(profile.private);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [confirmOut, setConfirmOut] = useState(false);
    const [confirmAll, setConfirmAll] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false);
    const [closing,    setClosing]    = useState(false);
    const [pwOpen,     setPwOpen]     = useState(false);

    function dismiss(after: () => void) {
        if (closing) return;
        setClosing(true);
        window.setTimeout(after, 300);
    }
    function done() {
        dismiss(() => onSave({ name: name.trim() || profile.name, bio: bio.trim(), avatar, private: priv }));
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-[#f2f2f2] font-sf"
            style={{
                animation: closing
                    ? 'ios-sheet-down 0.3s cubic-bezier(0.4,0,1,1) forwards'
                    : 'ios-sheet-up 0.32s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />
            <header className="flex items-center justify-between px-4 pb-2">
                <button type="button" onClick={() => dismiss(onCancel)} className="text-[17px] text-black active:opacity-50">{t('photogram.cancel', 'Cancel')}</button>
                <span className="text-[18px] font-semibold text-black">{t('photogram.editProfile', 'Edit profile')}</span>
                <button type="button" onClick={done} className="text-[17px] font-semibold active:opacity-50" style={{ color: IG.blue }}>{t('photogram.done', 'Done')}</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-8">
                <div className="flex flex-col items-center gap-2.5 py-6">
                    <img src={avatar} alt="" draggable={false} className="h-[110px] w-[110px] rounded-full object-cover" />
                    <button type="button" onClick={() => setPickerOpen(true)} className="text-[17px] font-semibold active:opacity-50" style={{ color: IG.blue }}>
                        {t('photogram.changeProfilePhoto', 'Change profile photo')}
                    </button>
                </div>

                <div className="bg-white">
                    <div className="flex items-center gap-4 border-b border-black/[0.07] px-4 py-3.5">
                        <span className="w-[84px] shrink-0 text-[18px] font-semibold text-black">{t('photogram.name', 'Name')}</span>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('photogram.name', 'Name')}
                            className="min-w-0 flex-1 bg-transparent text-[18px] text-black outline-none placeholder:text-black/35"
                        />
                    </div>

                    <div className="border-b border-black/[0.07] px-4 py-3.5">
                        <div className="text-[18px] font-semibold text-black">{t('photogram.bio', 'Bio')}</div>
                        <textarea
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            rows={3}
                            placeholder={t('photogram.writeBio', 'Write a bio…')}
                            className="mt-2 w-full resize-none bg-transparent text-[18px] leading-snug text-black outline-none placeholder:text-black/35"
                        />
                    </div>

                    <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="pr-4">
                            <div className="text-[18px] font-semibold text-black">{t('photogram.privateAccount', 'Private account')}</div>
                            <div className="mt-0.5 text-[14px] leading-snug text-black/50">{t('photogram.privateAccountDesc', 'Only approved followers can see your posts.')}</div>
                        </div>
                        <Toggle on={priv} onChange={setPriv} activeColor={IG.blue} />
                    </div>
                </div>

                <div className="flex flex-col gap-3 px-4 py-8">
                    <button type="button" onClick={() => setPwOpen(true)} className="w-full rounded-[12px] bg-black/[0.06] py-3.5 text-[18px] font-semibold active:opacity-70" style={{ color: IG.blue }}>{t('photogram.changePassword', 'Change Password')}</button>
                    <button type="button" onClick={onSwitchAccount} className="w-full rounded-[12px] bg-black/[0.06] py-3.5 text-[18px] font-semibold active:opacity-70" style={{ color: IG.blue }}>{t('accounts.switchAccount', 'Switch account')}</button>
                    <button type="button" onClick={() => setConfirmOut(true)} className="w-full rounded-[12px] bg-black/[0.06] py-3.5 text-[18px] font-semibold text-black active:opacity-70">{t('photogram.signOut', 'Sign Out')}</button>
                    <button type="button" onClick={() => setConfirmAll(true)} className="w-full rounded-[12px] bg-black/[0.06] py-3.5 text-[18px] font-semibold text-black active:opacity-70">{t('accounts.signOutAll', 'Log Out of All Accounts')}</button>
                    <button type="button" onClick={() => setConfirmDel(true)} className="w-full rounded-[12px] py-3.5 text-[18px] font-semibold text-white active:opacity-80" style={{ background: IG.red }}>{t('photogram.deleteAccount', 'Delete Account')}</button>
                </div>
            </div>

            {pickerOpen && (
                <MediaPickerSheet
                    onSelect={p => { setAvatar(p.url); setPickerOpen(false); }}
                    onClose={() => setPickerOpen(false)}
                />
            )}

            {confirmOut && (
                <AlertDialog
                    title={t('photogram.signOutTitle', 'Sign out of Photogram?')}
                    message={switchTo
                        ? t('accounts.signOutSwitchMessage', "You'll be switched to {name}.", { name: switchTo })
                        : t('photogram.signOutMessage', 'You can sign back in anytime.')}
                    confirmLabel={t('photogram.signOut', 'Sign Out')}
                    onCancel={() => setConfirmOut(false)}
                    onConfirm={onSignOut}
                />
            )}
            {confirmAll && (
                <AlertDialog
                    title={t('accounts.signOutAllTitle', 'Log out of all accounts?')}
                    message={t('accounts.signOutAllMessage', 'Every account you have in this app will be signed out. Saved passwords are kept.')}
                    confirmLabel={t('accounts.signOutAllConfirm', 'Log Out')}
                    destructive
                    onCancel={() => setConfirmAll(false)}
                    onConfirm={onSignOutAll}
                />
            )}
            {confirmDel && (
                <AlertDialog
                    title={t('photogram.deleteAccountTitle', 'Delete account?')}
                    message={t('photogram.deleteAccountMessage', "This removes your profile and signs you out, and clears the saved login from the Passwords app. This can't be undone.")}
                    confirmLabel={t('photogram.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirmDel(false)}
                    onConfirm={onDelete}
                />
            )}

            {pwOpen && (
                <ChangePasswordPage
                    app="photogram"
                    appName="Photogram"
                    icon="photogram"
                    theme={{ accent: IG.blue, welcomeBg: '#f2f2f2', welcomeText: 'dark' }}
                    onClose={() => setPwOpen(false)}
                />
            )}
        </div>
    );
}
