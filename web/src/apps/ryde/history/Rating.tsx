import { useState } from 'react';
import { CheckCircle2, DollarSign } from 'lucide-react';

import { t } from '@/i18n';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { Sheet } from '@/ui/Sheet';
import { Stars } from '@/ui/Stars';
import { useRyde } from '../store';
import { money } from '../data';
import { BigButton } from '../ui';

const TIPS = [0, 2, 5, 10];

export function Rating() {
    const g = useRyde();
    const r = g.pendingRating;
    const [stars, setStars] = useState(5);
    const [tip, setTip] = useState(0);
    const [custom, setCustom] = useState('');
    if (!r) return null;

    const customActive = custom !== '';
    function pickPreset(t: number) { setTip(t); setCustom(''); }
    function onCustom(v: string) {
        const n = v.replace(/[^0-9]/g, '');
        setCustom(n);
        setTip(Number(n) || 0);
    }

    return (
        <Sheet onClose={g.skipRating} fit="content" className="bg-surface px-5 pt-3">
            {() => (
                <div className="pb-1 text-center">
                    <div className="mb-3 flex items-center justify-center gap-2 text-[20px] font-extrabold tracking-tight text-[#22c55e]">
                        <CheckCircle2 className="h-[25px] w-[25px]" strokeWidth={2.4} /> {t('ryde.rideCompleted', 'Ride completed')}
                    </div>
                    {r.driver && <div className="mb-2.5 flex justify-center"><InitialsAvatar name={r.driver.name} color={r.driver.color} size={64} /></div>}
                    <p className="text-[19px] font-extrabold tracking-tight text-black dark:text-white">{t('ryde.rateYourDriver', 'Rate your driver')}</p>
                    <p className="mb-4 text-[14px] text-ios-gray">{r.driver?.name} · {r.dropoff.name}</p>

                    <div className="mb-5 rounded-2xl bg-black/[0.05] p-4 dark:bg-white/[0.07]">
                        <div className="flex justify-center">
                            <Stars value={stars} onChange={setStars} color="#FF9600" />
                        </div>

                        <p className="mb-2 mt-4 text-left text-[13px] font-semibold uppercase tracking-wide text-ios-gray">{t('ryde.addATip', 'Add a tip')}</p>
                        <div className="mb-2.5 flex gap-2">
                            {TIPS.map(amt => (
                                <button key={amt} onClick={() => pickPreset(amt)}
                                    className={'flex-1 rounded-[12px] py-2.5 text-[15px] font-bold ring-2 ' + (!customActive && tip === amt ? 'ring-black text-black dark:ring-white dark:text-white' : 'ring-transparent text-ios-gray')}
                                    style={{ background: 'rgba(127,127,127,0.14)' }}>
                                    {amt === 0 ? t('ryde.none', 'None') : money(amt)}
                                </button>
                            ))}
                        </div>

                        <div className={'flex items-center gap-2 rounded-[12px] px-3.5 ring-2 ' + (customActive ? 'ring-black dark:ring-white' : 'ring-transparent')} style={{ background: 'rgba(127,127,127,0.14)' }}>
                            <DollarSign className="h-[18px] w-[18px] shrink-0 text-ios-gray" strokeWidth={2.4} />
                            <input
                                inputMode="numeric"
                                value={custom}
                                onChange={e => onCustom(e.target.value)}
                                placeholder={t('ryde.customAmount', 'Custom amount')}
                                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-bold text-black outline-none placeholder:font-semibold placeholder:text-ios-gray dark:text-white"
                            />
                        </div>
                    </div>

                    <BigButton onClick={() => g.submitRating(stars, tip)}>
                        {tip > 0 ? t('ryde.submitTip', 'Submit & tip {amount}', { amount: money(tip) }) : t('ryde.submit', 'Submit')}
                    </BigButton>
                </div>
            )}
        </Sheet>
    );
}
