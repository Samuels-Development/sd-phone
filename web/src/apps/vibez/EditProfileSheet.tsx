import { useState } from 'react';
import { Camera } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { GRAD_FROM, GRAD_TO, type VProfile } from './data';
import { apiUpdateProfile } from './vibezApi';

export function EditProfileSheet({ profile, onClose, onSaved }: {
    profile: VProfile;
    onClose: () => void;
    onSaved: (profile: VProfile) => void;
}) {
    const [name,   setName]   = useState(profile.name);
    const [bio,    setBio]    = useState(profile.bio);
    const [avatar, setAvatar] = useState(profile.avatar);
    const [picker, setPicker] = useState(false);
    const [busy,   setBusy]   = useState(false);

    async function save(close: () => void) {
        if (busy) return;
        setBusy(true);
        const updated = await apiUpdateProfile({ name: name.trim(), bio: bio.trim(), avatar });
        setBusy(false);
        if (updated) { onSaved(updated); close(); }
    }

    return (
        <Sheet onClose={onClose} forceDark top="18%" className="font-sf bg-[#161022]">
            {({ close }) => (
                <>
                    <div className="flex h-12 shrink-0 items-center justify-between px-4 pt-1">
                        <button type="button" onClick={close} className="text-[16px] text-white/70 active:opacity-60">
                            {t('vibez.cancel', 'Cancel')}
                        </button>
                        <span className="text-[15px] font-semibold text-white">{t('vibez.editProfile', 'Edit profile')}</span>
                        <button
                            type="button"
                            onClick={() => void save(close)}
                            disabled={busy}
                            className="text-[16px] font-semibold disabled:opacity-40"
                            style={{ color: GRAD_TO }}
                        >
                            {t('vibez.save', 'Save')}
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8 pt-3">
                        <button type="button" onClick={() => setPicker(true)} className="mx-auto block active:opacity-80">
                            <div className="relative mx-auto w-fit rounded-full p-[3px]" style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}>
                                <img src={avatar} alt="" draggable={false} className="h-24 w-24 rounded-full border-[3px] border-[#161022] object-cover" />
                                <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                                    <Camera className="h-4 w-4 text-white" strokeWidth={2.2} />
                                </span>
                            </div>
                            <span className="mt-2 block text-center text-[13px] text-white/60">{t('vibez.changePhoto', 'Change photo')}</span>
                        </button>

                        <label className="mt-5 block text-[12px] font-semibold uppercase tracking-wide text-white/45">
                            {t('vibez.name', 'Name')}
                        </label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={64}
                            spellCheck={false}
                            className="mt-1.5 w-full rounded-lg bg-white/10 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
                        />

                        <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wide text-white/45">
                            {t('vibez.bio', 'Bio')}
                        </label>
                        <textarea
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            maxLength={160}
                            rows={3}
                            spellCheck={false}
                            placeholder={t('vibez.bioPlaceholder', 'Tell people what you vibe to…')}
                            className="mt-1.5 w-full resize-none rounded-lg bg-white/10 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
                        />
                    </div>

                    {picker && (
                        <MediaPickerSheet
                            forceDark
                            filter={p => !p.video}
                            onSelect={p => { setAvatar(p.url); setPicker(false); }}
                            onClose={() => setPicker(false)}
                        />
                    )}
                </>
            )}
        </Sheet>
    );
}
