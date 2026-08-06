import { useState } from 'react';

import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { t } from '@/i18n';

const QUICK = [5, 10, 25, 50, 100];

interface Props {
    isDark:    boolean;
    peerName:  string;
    onSend:    (amount: number) => void;
    onRequest: (amount: number) => void;
    onClose:   () => void;
}

export function MoneyPanel({ isDark, peerName, onSend, onRequest, onClose }: Props) {
    const [amount,  setAmount]  = useState(0);
    const [confirm, setConfirm] = useState<null | 'send' | 'request'>(null);
    const fg     = isDark ? 'text-white' : 'text-black';
    const pillBg = isDark ? 'rgb(var(--elevated))' : '#fff';

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            dim={false}
            durationMs={260}
            className={`px-4 border-t-[0.5px] ${isDark ? 'bg-surface border-white/10' : 'bg-base border-black/10'}`}
        >
            {({ close }) => (
                <>
                    <div className="flex items-center justify-center gap-10 py-3">
                        <button
                            type="button"
                            onClick={() => setAmount(a => Math.max(0, a - 1))}
                            className={`px-2 text-[34px] leading-none ${fg} active:opacity-50`}
                        >
                            −
                        </button>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={amount}
                            onFocus={e => e.target.select()}
                            onChange={e => {
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                                setAmount(digits ? parseInt(digits, 10) : 0);
                            }}
                            className={`w-[150px] bg-transparent text-center text-[46px] font-normal leading-none tabular-nums outline-none ${fg}`}
                        />
                        <button
                            type="button"
                            onClick={() => setAmount(a => a + 1)}
                            className={`px-2 text-[34px] leading-none ${fg} active:opacity-50`}
                        >
                            +
                        </button>
                    </div>

                    <div className="mt-5 flex gap-2 pb-3">
                        {QUICK.map(v => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setAmount(a => a + v)}
                                className={`flex-1 rounded-[10px] py-2 text-center text-[14px] font-medium ${fg} active:opacity-70`}
                                style={{ background: pillBg }}
                            >
                                ${v}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => { if (amount > 0) setConfirm('request'); }}
                            className={`flex-1 rounded-[12px] py-3.5 text-center text-[17px] ${fg} active:opacity-70`}
                            style={{ background: pillBg }}
                        >
                            {t('messages.request', 'Request')}
                        </button>
                        <button
                            type="button"
                            onClick={() => { if (amount > 0) setConfirm('send'); }}
                            className={`flex-1 rounded-[12px] py-3.5 text-center text-[17px] ${fg} active:opacity-70`}
                            style={{ background: pillBg }}
                        >
                            {t('messages.send', 'Send')}
                        </button>
                    </div>

                    {confirm && (
                        <AlertDialog
                            title={confirm === 'send'
                                ? t('messages.sendMoney', 'Send Money')
                                : t('messages.requestMoney', 'Request Money')}
                            message={confirm === 'send'
                                ? t('messages.sendMoneyConfirm', 'Send ${amount} to {peerName}?', { amount, peerName })
                                : t('messages.requestMoneyConfirm', 'Request ${amount} from {peerName}?', { amount, peerName })}
                            cancelLabel={t('common.cancel', 'Cancel')}
                            confirmLabel={confirm === 'send' ? t('messages.send', 'Send') : t('messages.request', 'Request')}
                            onCancel={() => setConfirm(null)}
                            onConfirm={() => {
                                if (confirm === 'send') onSend(amount); else onRequest(amount);
                                setConfirm(null);
                                close();
                            }}
                        />
                    )}
                </>
            )}
        </Sheet>
    );
}
