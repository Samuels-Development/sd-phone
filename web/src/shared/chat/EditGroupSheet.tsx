import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';

import { ContactAvatar, GroupAvatar } from '@/shared/ContactAvatar';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { ME, type Contact } from './data';
import { t } from '@/i18n';

interface EditGroupSheetProps {
    groupName:    string;
    groupAvatar?: string;
    participants: Contact[];
    onCancel:     () => void;
    onSave:       (name: string, avatar?: string) => void;
    onRemoveMember: (member: Contact) => void;
}

export function EditGroupSheet({ groupName, groupAvatar, participants, onCancel, onSave, onRemoveMember }: EditGroupSheetProps) {
    const [name,    setName]    = useState(groupName);
    const [avatar,  setAvatar]  = useState<string | undefined>(groupAvatar);
    const [picking, setPicking] = useState(false);
    const [pendingRemove, setPendingRemove] = useState<Contact | null>(null);
    const pendingSave = useRef(false);

    function handleClose() {
        if (pendingSave.current) { onSave(name.trim(), avatar); return; }
        onCancel();
    }

    return (
        <>
            <Sheet
                onClose={handleClose}
                fit="full"
                dim={false}
                grabber={false}
                className="font-sf bg-[#f2f2f2] text-black dark:bg-surface dark:text-white"
            >
                {({ close }) => {
                    function save() {
                        if (!name.trim()) return;
                        pendingSave.current = true;
                        close();
                    }
                    return (
                        <>
                            <div className="flex shrink-0 items-center px-4 pb-2 pt-3">
                                <div className="flex flex-1 justify-start">
                                    <button type="button" onClick={close} className="text-[17px] text-ios-blue active:opacity-60">{t('common.cancel', 'Cancel')}</button>
                                </div>
                                <span className="text-[17px] font-semibold">{t('messages.editGroupTitle', 'Edit Group')}</span>
                                <div className="flex flex-1 justify-end">
                                    <button
                                        type="button"
                                        onClick={save}
                                        disabled={!name.trim()}
                                        className="text-[17px] font-semibold text-ios-blue active:opacity-60 disabled:opacity-40"
                                    >
                                        {t('common.save', 'Save')}
                                    </button>
                                </div>
                            </div>
                            <div className="h-[0.5px] shrink-0 bg-black/10 dark:bg-white/10" />

                            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                                <div className="flex flex-col items-center gap-2.5 pt-6">
                                    <button
                                        type="button"
                                        onClick={() => setPicking(true)}
                                        aria-label={t('messages.changeGroupPhoto', 'Change group photo')}
                                        className="relative active:opacity-80"
                                    >
                                        <GroupAvatar contacts={participants} size={112} avatar={avatar} />
                                        <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#f2f2f2] bg-ios-blue dark:border-surface">
                                            <Camera className="h-[19px] w-[19px] text-white" strokeWidth={2} />
                                        </span>
                                    </button>
                                    <button type="button" onClick={() => setPicking(true)} className="text-[16px] text-ios-blue active:opacity-60">
                                        {t('messages.changePhoto', 'Change Photo')}
                                    </button>
                                </div>

                                <div className="px-4 pt-6">
                                    <div className="rounded-[14px] bg-white px-4 py-3 dark:bg-base/40">
                                        <input
                                            value={name}
                                            maxLength={40}
                                            onChange={e => setName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') save(); }}
                                            placeholder={t('messages.groupNamePlaceholder', 'Group Name')}
                                            className="w-full bg-transparent text-[20px] outline-none placeholder-black/35 dark:placeholder-white/35"
                                        />
                                    </div>
                                </div>

                                <div className="px-4 pb-9 pt-6">
                                    <div className="px-1 pb-2 text-[15px] font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
                                        {t('messages.membersCount', '{count} Members', { count: participants.length + 1 })}
                                    </div>
                                    <div className="overflow-hidden rounded-[12px] bg-white dark:bg-base/40">
                                        <MemberRow contact={ME} displayName={t('messages.you', 'You')} />
                                        {participants.map(c => (
                                            <div key={c.id}>
                                                <div className="ml-[68px] h-[0.5px] bg-black/10 dark:bg-white/10" />
                                                <MemberRow contact={c} displayName={c.name} onRemove={() => setPendingRemove(c)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    );
                }}
            </Sheet>

            {picking && (
                <MediaPickerSheet
                    onSelect={p => { setAvatar(p.url); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}

            {pendingRemove && (
                <AlertDialog
                    title={t('messages.removeMemberTitle', 'Remove Member')}
                    message={t('messages.removeMemberConfirm', 'Remove {name} from the group?', { name: pendingRemove.name })}
                    confirmLabel={t('messages.remove', 'Remove')}
                    destructive
                    onCancel={() => setPendingRemove(null)}
                    onConfirm={() => { onRemoveMember(pendingRemove); setPendingRemove(null); }}
                />
            )}
        </>
    );
}

function MemberRow({ contact, displayName, onRemove }: { contact: Contact; displayName: string; onRemove?: () => void }) {
    return (
        <div className="flex items-center gap-3 px-3 py-3">
            <ContactAvatar contact={contact} size={44} />
            <span className="min-w-0 flex-1 truncate text-[18px]">{displayName}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={t('messages.removeMemberAria', 'Remove {name}', { name: displayName })}
                    className="shrink-0 pl-2 active:opacity-60"
                >
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#ff3b30]">
                        <span className="h-[2.5px] w-[13px] rounded-full bg-white" />
                    </span>
                </button>
            )}
        </div>
    );
}
