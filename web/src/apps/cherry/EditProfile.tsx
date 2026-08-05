import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Ban, ChevronRight, Plus, X } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { Toggle } from '@/ui/Toggle';
import { portalToPhoneScreen } from '@/ui/portal';
import { cherryBlockedList, cherryUnblock, type BlockedEntry } from './cherryApi';
import { CHERRY, type Gender, type InterestedIn, type MyProfile } from './data';

const MAX_PHOTOS = 6;

export function EditProfile({ profile, onChange, onSignOut, onSignOutAll, onSwitchAccount, onDeleteAccount }: {
    onSwitchAccount?: () => void;
    profile:         MyProfile;
    onChange:        (p: MyProfile) => void;
    onSignOut:       () => void;
    onSignOutAll:    () => void;
    onDeleteAccount: () => void;
}) {
    const [confirming, setConfirming] = useState<null | 'logout' | 'logoutAll' | 'delete'>(null);
    const [picking,    setPicking]    = useState(false);
    const [viewBlocked, setViewBlocked] = useState(false);
    const [pwOpen,      setPwOpen]      = useState(false);

    function removePhoto(i: number) {
        onChange({ ...profile, photos: profile.photos.filter((_, idx) => idx !== i) });
    }

    const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => profile.photos[i] ?? null);
    const firstEmpty = profile.photos.length;
    const avatar = profile.photos[0] ?? null;

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8">
                <div className="flex flex-col items-center pb-1 pt-1">
                    {avatar ? (
                        <img src={avatar} alt={profile.name} draggable={false} className="h-[136px] w-[136px] rounded-full object-cover ring-1 ring-black/10" />
                    ) : (
                        <span className="flex h-[136px] w-[136px] items-center justify-center rounded-full text-[50px] font-bold text-white ring-1 ring-black/10" style={{ background: CHERRY.pink }}>
                            {(profile.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                    )}
                    <p className="mt-3 text-[25px] font-bold text-black">{profile.name}, {profile.age}</p>
                    <p
                        className={`mt-1 h-[18px] text-[13px] font-medium leading-none transition-opacity ${profile.visible ? 'opacity-0' : 'opacity-100'}`}
                        style={{ color: CHERRY.pink }}
                        aria-hidden={profile.visible}
                    >
                        {t('cherry.hiddenFromDeck', 'Hidden from the deck')}
                    </p>
                </div>

                <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                        <Label>{t('cherry.name', 'Name')}</Label>
                        <input
                            value={profile.name}
                            maxLength={50}
                            onChange={e => onChange({ ...profile, name: e.target.value })}
                            className="w-full rounded-[10px] bg-white/55 px-4 py-3.5 text-[17px] text-black outline-none"
                        />
                    </div>
                    <div className="w-[88px] shrink-0">
                        <Label>{t('cherry.age', 'Age')}</Label>
                        <input
                            value={profile.age || ''}
                            inputMode="numeric"
                            maxLength={2}
                            onChange={e => {
                                const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                onChange({ ...profile, age: Number.isFinite(n) ? n : 0 });
                            }}
                            onBlur={() => onChange({ ...profile, age: Math.max(18, Math.min(99, profile.age || 18)) })}
                            className="w-full rounded-[10px] bg-white/55 px-4 py-3.5 text-center text-[17px] text-black outline-none"
                        />
                    </div>
                </div>

                <Label>{t('cherry.photos', 'Photos')}</Label>
                <div className="grid grid-cols-3 gap-2.5">
                    {slots.map((src, i) => (
                        <div key={i} className="relative aspect-[2/3] overflow-hidden rounded-[12px]">
                            {src ? (
                                <>
                                    <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
                                    <button
                                        type="button"
                                        aria-label={t('cherry.removePhoto', 'Remove photo')}
                                        onClick={() => removePhoto(i)}
                                        className="absolute bottom-1.5 right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white shadow-md"
                                        style={{ color: CHERRY.nope }}
                                    >
                                        <X className="h-[15px] w-[15px]" strokeWidth={3} />
                                    </button>
                                </>
                            ) : (
                                <div className="flex h-full w-full items-end justify-center border border-dashed border-black/20 bg-black/[0.03] pb-2">
                                    {i === firstEmpty && (
                                        <button
                                            type="button"
                                            aria-label={t('cherry.addPhoto', 'Add photo')}
                                            onClick={() => setPicking(true)}
                                            className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white shadow-md"
                                            style={{ color: CHERRY.pink }}
                                        >
                                            <Plus className="h-[16px] w-[16px]" strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <Label>{t('cherry.aboutMe', 'About Me')}</Label>
                <textarea
                    value={profile.about}
                    onChange={e => onChange({ ...profile, about: e.target.value })}
                    rows={2}
                    maxLength={300}
                    placeholder={t('cherry.aboutPlaceholder', 'Tell people about yourself…')}
                    className="w-full resize-none rounded-[10px] bg-white/55 px-4 py-3.5 text-[17px] leading-snug text-black placeholder-black/50 outline-none"
                />

                <Label>{t('cherry.interestedIn', 'Interested In')}</Label>
                <Segmented<InterestedIn>
                    options={['Women', 'Men', 'Everyone']}
                    value={profile.interestedIn}
                    onChange={v => onChange({ ...profile, interestedIn: v })}
                />

                <Label>{t('cherry.gender', 'Gender')}</Label>
                <Segmented<Gender>
                    options={['Man', 'Woman', 'Nonbinary']}
                    value={profile.gender}
                    onChange={v => onChange({ ...profile, gender: v })}
                />

                <Label>{t('cherry.whoCanSeeYou', 'Who Can See You')}</Label>
                <div className="flex items-center justify-between rounded-[10px] bg-black/[0.05] px-4 py-3.5">
                    <div className="min-w-0">
                        <p className="text-[17px] font-medium text-black">{t('cherry.showMeOnCherry', 'Show me on Cherry')}</p>
                        <p className="mt-0.5 text-[14px] text-black/45">{t('cherry.offHidesYou', 'Off hides you from the deck.')}</p>
                    </div>
                    <Toggle on={profile.visible} onChange={v => onChange({ ...profile, visible: v })} />
                </div>

                <Label>{t('cherry.blocked', 'Blocked')}</Label>
                <button
                    type="button"
                    onClick={() => setViewBlocked(true)}
                    className="flex w-full items-center justify-between rounded-[10px] bg-black/[0.05] px-4 py-3.5 active:opacity-80"
                >
                    <span className="flex items-center gap-2.5">
                        <Ban className="h-[20px] w-[20px] text-black/60" strokeWidth={2.2} />
                        <span className="text-[17px] font-medium text-black">{t('cherry.blockedMatches', 'Blocked Matches')}</span>
                    </span>
                    <ChevronRight className="h-[20px] w-[20px] text-black/30" strokeWidth={2.2} />
                </button>

                <button
                    type="button"
                    onClick={() => setPwOpen(true)}
                    className="mt-7 w-full rounded-[12px] bg-black/[0.05] py-4 text-[17px] font-semibold active:opacity-80"
                    style={{ color: CHERRY.pink }}
                >
                    {t('cherry.changePassword', 'Change Password')}
                </button>

                {onSwitchAccount && (
                    <button
                        type="button"
                        onClick={onSwitchAccount}
                        className="mt-3 w-full rounded-[12px] bg-black/[0.05] py-4 text-[17px] font-semibold text-ios-blue active:opacity-80"
                    >
                        {t('accounts.switchAccount', 'Switch account')}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setConfirming('logout')}
                    className="mt-3 w-full rounded-[12px] bg-black/[0.05] py-4 text-[17px] font-semibold text-black active:opacity-80"
                >
                    {t('cherry.logOut', 'Log out')}
                </button>

                <button
                    type="button"
                    onClick={() => setConfirming('logoutAll')}
                    className="mt-3 w-full rounded-[12px] bg-black/[0.05] py-4 text-[17px] font-semibold text-black active:opacity-80"
                >
                    {t('accounts.signOutAll', 'Log Out of All Accounts')}
                </button>

                <button
                    type="button"
                    onClick={() => setConfirming('delete')}
                    className="mt-3 w-full rounded-[12px] py-4 text-[17px] font-semibold text-white active:opacity-80"
                    style={{ background: '#FF3B30' }}
                >
                    {t('cherry.deleteAccount', 'Delete Account')}
                </button>
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    onSelectMany={ps => {
                        const urls = ps.map(p => p.url);
                        onChange({ ...profile, photos: [...profile.photos, ...urls].slice(0, MAX_PHOTOS) });
                        setPicking(false);
                    }}
                    onClose={() => setPicking(false)}
                />
            )}

            {viewBlocked && <BlockedSheet onClose={() => setViewBlocked(false)} />}

            {confirming === 'logout' && (
                <AlertDialog
                    title={t('cherry.logOutTitle', 'Log Out?')}
                    message={t('cherry.logOutMessage', "You'll need to sign in again to use Cherry.")}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.logOutConfirm', 'Log Out')}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => { setConfirming(null); onSignOut(); }}
                />
            )}
            {confirming === 'logoutAll' && (
                <AlertDialog
                    title={t('accounts.signOutAllTitle', 'Log out of all accounts?')}
                    message={t('accounts.signOutAllMessage', 'Every account you have in this app will be signed out. Saved passwords are kept.')}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('accounts.signOutAllConfirm', 'Log Out')}
                    destructive
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => { setConfirming(null); onSignOutAll(); }}
                />
            )}
            {confirming === 'delete' && (
                <AlertDialog
                    title={t('cherry.deleteAccountTitle', 'Delete Account?')}
                    message={t('cherry.deleteAccountMessage', "This permanently removes your Cherry profile, photos and matches, and its saved login from the Passwords app. This can't be undone.")}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => { setConfirming(null); onDeleteAccount(); }}
                />
            )}

            {pwOpen && (
                <ChangePasswordPage
                    app="cherry"
                    appName="Cherry"
                    icon="cherry"
                    theme={{ accent: CHERRY.pink, welcomeBg: '#e5e5e5', welcomeText: 'dark' }}
                    onClose={() => setPwOpen(false)}
                />
            )}
        </div>
    );
}

function BlockedSheet({ onClose }: { onClose: () => void }) {
    const [exiting, setExiting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState<BlockedEntry[]>([]);
    const [confirm, setConfirm] = useState<BlockedEntry | null>(null);

    useEffect(() => {
        let alive = true;
        void cherryBlockedList().then(list => { if (alive) { setEntries(list); setLoading(false); } });
        return () => { alive = false; };
    }, []);

    function close() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onClose, 280);
    }

    function unblock(e: BlockedEntry) {
        void cherryUnblock(e.username);
        setEntries(prev => prev.filter(x => x.username !== e.username));
    }

    const sheet = (
        <div
            className="absolute inset-0 z-[65] flex flex-col bg-[#e5e5e5]"
            style={{
                animation: exiting
                    ? 'ios-sheet-down 0.28s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.32s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
                <h2 className="text-[26px] font-bold tracking-tight text-black">{t('cherry.blocked', 'Blocked')}</h2>
                <button
                    type="button"
                    onClick={close}
                    aria-label={t('cherry.closeBlockedList', 'Close blocked list')}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/10 text-black/70 active:opacity-70"
                >
                    <X className="h-[19px] w-[19px]" strokeWidth={2.6} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-8">
                {loading ? (
                    <p className="py-10 text-center text-[16px] font-medium text-black/55">{t('cherry.loading', 'Loading…')}</p>
                ) : entries.length === 0 ? (
                    <div className="flex flex-col items-center px-8 pt-20 text-center">
                        <Ban className="h-[64px] w-[64px] text-black/30" strokeWidth={1.5} />
                        <p className="mt-4 text-[20px] font-semibold text-black/85">{t('cherry.nobodyBlocked', 'Nobody blocked')}</p>
                        <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/65">{t('cherry.blockShowHere', 'People you block show up here.')}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {entries.map(e => (
                            <div key={e.username} className="flex items-center gap-3.5 rounded-[14px] px-2 py-2">
                                {e.photo ? (
                                    <img src={e.photo} alt={e.name} draggable={false} className="h-[60px] w-[60px] rounded-full object-cover" />
                                ) : (
                                    <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full text-[22px] font-bold text-white" style={{ background: CHERRY.pink }}>
                                        {e.name.slice(0, 1).toUpperCase()}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-[19px] font-semibold text-black">
                                    {e.name}{e.age ? `, ${e.age}` : ''}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setConfirm(e)}
                                    className="shrink-0 rounded-full px-5 py-2 text-[15px] font-semibold text-white active:opacity-80"
                                    style={{ background: CHERRY.pink }}
                                >
                                    {t('cherry.unblock', 'Unblock')}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {confirm && (
                <AlertDialog
                    title={t('cherry.unblockName', 'Unblock {name}?', { name: confirm.name })}
                    message={t('cherry.unblockMessage', "You may appear in each other's decks again.")}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.unblock', 'Unblock')}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => { unblock(confirm); setConfirm(null); }}
                />
            )}
        </div>
    );

    return portalToPhoneScreen(sheet);
}

function Label({ children }: { children: ReactNode }) {
    return <p className="px-1 pb-2 pt-5 text-[16px] font-semibold text-black/80">{children}</p>;
}

function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="flex gap-1 rounded-[10px] bg-black/[0.05] p-1">
            {options.map(o => (
                <button
                    key={o}
                    type="button"
                    onClick={() => onChange(o)}
                    className={`flex-1 rounded-[8px] py-2.5 text-[16px] font-semibold transition ${value === o ? 'bg-white text-black shadow-sm' : 'text-black/50 active:text-black/70'}`}
                >
                    {o}
                </button>
            ))}
        </div>
    );
}
