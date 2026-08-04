import { useEffect, useState } from 'react';
import { Check, Plus, UserRound } from 'lucide-react';

import { t } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import { accountsSwitch, accountsSwitchable, type SwitchableAccount } from '@/core/accountsApi';

interface Props {
    app:        string;
    forceDark?: boolean;
    onClose:    () => void;
    onSwitched: (username: string) => void;
    onAdd?:     () => void;
}

export function AccountSwitcher({ app, forceDark = false, onClose, onSwitched, onAdd }: Props) {
    const [accounts, setAccounts] = useState<SwitchableAccount[]>([]);
    const [active,   setActive]   = useState<string | null>(null);
    const [busy,     setBusy]     = useState<string | null>(null);
    const [error,    setError]    = useState<string | null>(null);

    useEffect(() => {
        void accountsSwitchable(app).then(d => { setAccounts(d.accounts); setActive(d.active); });
    }, [app]);

    async function pick(username: string) {
        if (busy || username === active) { onClose(); return; }
        setBusy(username);
        const res = await accountsSwitch(app, username);
        setBusy(null);
        if (!res.ok) { setError(res.message ?? t('accounts.switchFailed', 'Could not switch account')); return; }
        setActive(username);
        onSwitched(username);
        onClose();
    }

    const sub = forceDark ? 'text-white/50' : 'text-ios-gray';
    const label = forceDark ? 'text-white' : 'text-black dark:text-white';

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            title={t('accounts.switchAccount', 'Switch account')}
            forceDark={forceDark}
            className="bg-[#ececec] dark:bg-surface"
        >
            {() => (
            <div className="flex flex-col gap-1 px-2 pb-3">
                {accounts.length === 0 && (
                    <p className={`px-3 py-6 text-center text-[15px] ${sub}`}>
                        {t('accounts.noSavedAccounts', 'No other saved accounts. Sign in once and your login is saved here.')}
                    </p>
                )}

                {accounts.map(a => (
                    <button
                        key={a.username}
                        type="button"
                        onClick={() => void pick(a.username)}
                        disabled={!!busy}
                        className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-opacity active:opacity-60 disabled:opacity-50"
                    >
                        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full ${forceDark ? 'bg-white/10' : 'bg-black/[0.07] dark:bg-white/10'}`}>
                            <UserRound className={`h-[19px] w-[19px] ${sub}`} strokeWidth={2.2} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className={`truncate text-[16px] font-medium ${label}`}>{a.name || a.username}</span>
                            <span className={`truncate text-[13px] ${sub}`}>@{a.username}</span>
                        </span>
                        {a.username === active && (
                            <Check className="h-[18px] w-[18px] shrink-0 text-ios-blue" strokeWidth={2.6} />
                        )}
                    </button>
                ))}

                {onAdd && (
                    <button
                        type="button"
                        onClick={() => { onClose(); onAdd(); }}
                        className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-opacity active:opacity-60"
                    >
                        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full ${forceDark ? 'bg-white/10' : 'bg-black/[0.07] dark:bg-white/10'}`}>
                            <Plus className="h-[19px] w-[19px] text-ios-blue" strokeWidth={2.4} />
                        </span>
                        <span className="text-[16px] font-medium text-ios-blue">
                            {t('accounts.addAccount', 'Add account')}
                        </span>
                    </button>
                )}

                {error && <p className="px-3 pt-1 text-center text-[13px] text-ios-red">{error}</p>}
            </div>
            )}
        </Sheet>
    );
}
