import { useState, type ReactNode } from 'react';

import { t } from '@/i18n';
import { BusinessLogo } from './BusinessCard';
import type { Business, BusinessEdit } from './data';

const SWATCHES = [
    '#E03131', '#F08C00', '#F59F00', '#2F9E44', '#0CA678', '#1C7ED6',
    '#364FC7', '#7048E8', '#9C36B5', '#C2255C', '#495057', '#212529',
];

export function ManageBusiness({ business, onCancel, onSave }: {
    business: Business;
    onCancel: () => void;
    onSave:   (edit: BusinessEdit) => void;
}) {
    const [hours, setHours] = useState(business.hours);
    const [blurb, setBlurb] = useState(business.blurb);
    const [logo,  setLogo]  = useState(business.logo);

    const preview: Business = { ...business, logo };

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-elevated font-sf dark:bg-surface animate-sheet-up">
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex h-11 shrink-0 items-center justify-between px-4">
                <button type="button" onClick={onCancel} className="text-[16px] text-ios-blue">{t('review.cancel', 'Cancel')}</button>
                <span className="text-[15px] font-semibold text-black dark:text-white">{t('review.editBusiness', 'Edit Business')}</span>
                <button type="button" onClick={() => onSave({ id: business.id, hours: hours.trim(), blurb: blurb.trim(), logo })} className="text-[16px] font-semibold text-ios-blue">{t('review.save', 'Save')}</button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div className="flex flex-col items-center py-4">
                    <BusinessLogo b={preview} size={72} radius={18} font={32} />
                    <p className="mt-2 text-[15px] font-semibold text-black dark:text-white">{business.name}</p>
                    <p className="text-[12px] text-black/45 dark:text-white/45">{business.category} · {business.address}</p>
                </div>

                <Label>{t('review.hours', 'Hours')}</Label>
                <input
                    value={hours}
                    onChange={e => setHours(e.target.value)}
                    maxLength={40}
                    placeholder={t('review.hoursPlaceholder', 'e.g. 9am – 6pm')}
                    className="w-full rounded-xl bg-elevated px-3 py-2.5 text-[15px] text-black outline-none placeholder:text-black/35 dark:bg-elevated dark:text-white dark:placeholder:text-white/35"
                />

                <Label>{t('review.description', 'Description')}</Label>
                <textarea
                    value={blurb}
                    onChange={e => setBlurb(e.target.value)}
                    rows={3}
                    maxLength={140}
                    placeholder={t('review.descriptionPlaceholder', 'One-line description')}
                    className="w-full resize-none rounded-xl bg-elevated px-3 py-2.5 text-[15px] text-black outline-none placeholder:text-black/35 dark:bg-elevated dark:text-white dark:placeholder:text-white/35"
                />

                <Label>{t('review.logoColour', 'Logo Colour')}</Label>
                <div className="grid grid-cols-6 gap-3 rounded-xl bg-elevated p-3 dark:bg-elevated">
                    {SWATCHES.map(c => (
                        <button key={c} type="button" onClick={() => setLogo(c)} className="flex items-center justify-center" aria-label={t('review.colourLabel', 'Colour {c}', { c })}>
                            <span
                                className="h-9 w-9 rounded-full"
                                style={{ background: c, outline: logo.toUpperCase() === c ? '2px solid #0a84ff' : 'none', outlineOffset: 2 }}
                            />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Label({ children }: { children: ReactNode }) {
    return <p className="px-1 pb-1.5 pt-4 text-[12px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">{children}</p>;
}
