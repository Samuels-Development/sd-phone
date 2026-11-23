import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Store } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { frameHex } from '@/shell/frameColors';
import { Spinner } from '@/ui/Spinner';
import { fetchPhonePage, takeOffCase, type PhonePage } from '@/casestore/casesApi';
import { designChips, labelOf, partLabels } from '@/casestore/labels';
import { CaseThumb, ColourDot } from '@/casestore/ui';
import { SubPage } from '../SettingsSubPage';

function Section({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
    return (
        <section className="text-black dark:text-white">
            <div className="px-7 pb-1.5 pt-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">{title}</div>
            <div className="mx-4">{children}</div>
            {footer && <div className="px-7 pt-2 text-[14px] font-normal leading-snug text-ios-gray">{footer}</div>}
        </section>
    );
}

/** The case on the phone, in a picture and in words, and the button that takes it off. */
function CaseSection({ page, onTakenOff }: { page: PhonePage; onTakenOff: () => void }) {
    const labels = partLabels();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
    const worn = page.equipped || null;
    const palette = page.catalog.palette;

    async function takeOff() {
        if (busy) return;
        setBusy(true);
        setNote(null);
        const res = await takeOffCase();
        setBusy(false);
        if (!res.success) {
            setNote({ text: failText(res, t('cases.takeOffFailed', 'The case could not be taken off')), bad: true });
            return;
        }
        setNote({
            text: page.items ? t('cases.takenOffItem', 'Taken off and back in your pockets.') : t('cases.takenOffList', 'Taken off and kept in your cases.'),
            bad: false,
        });
        onTakenOff();
    }

    let footer: ReactNode = note
        ? <span className={note.bad ? 'font-medium text-ios-red' : 'flex items-center gap-1.5 font-medium text-ios-green'}>{!note.bad && <Check className="h-[15px] w-[15px]" strokeWidth={3} />}{note.text}</span>
        : undefined;
    if (!footer && worn) {
        footer = page.items
            ? t('cases.takeOffItemFooter', 'Taking it off puts it back in your pockets, to wear again, give away or sell.')
            : t('cases.takeOffListFooter', 'Taking it off keeps it in your cases. Swap cases at any phone case store.');
    }

    return (
        <Section title={t('cases.caseHeader', 'Case')} footer={footer}>
            <div className="overflow-hidden rounded-[10px] bg-surface">
                {worn ? (
                    <div className="flex gap-3.5 p-3">
                        <CaseThumb design={worn} frameHex={frameHex(page.frame)} palette={palette} body={page.body} look={page.look} w={86} h={120} />
                        <div className="flex min-w-0 flex-1 flex-col py-0.5">
                            <span className="truncate text-[18px] font-semibold leading-tight">
                                {t('cases.styleCase', '{style} case', { style: labelOf(labels.style, worn.style) })}
                            </span>
                            <div className="mt-2 flex flex-wrap gap-1">
                                <span className="flex h-[24px] items-center gap-1.5 rounded-full bg-black/[0.05] px-2 text-[12.5px] font-medium dark:bg-white/[0.08]">
                                    <ColourDot hex={palette[worn.color] ?? '#888888'} />
                                    {t('cases.shellChip', 'Shell')}
                                </span>
                                {designChips(labels, worn, palette).map(c => (
                                    <span key={c.kind} className="flex h-[24px] max-w-full items-center gap-1.5 rounded-full bg-black/[0.05] px-2 text-[12.5px] font-medium dark:bg-white/[0.08]">
                                        {c.hex && <ColourDot hex={c.hex} />}
                                        <span className="truncate">{c.name}</span>
                                    </span>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => void takeOff()}
                                disabled={busy}
                                className="mt-auto flex h-[36px] w-[124px] items-center justify-center rounded-full bg-black/[0.07] text-[15px] font-semibold text-ios-blue transition-[transform,opacity] duration-150 active:scale-95 disabled:opacity-50 dark:bg-white/[0.12]"
                            >
                                {busy ? <Spinner size={18} /> : t('cases.takeOff', 'Take Off')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 px-4 py-3.5">
                        <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] bg-[#F59E0B] text-white shadow-sm">
                            <Store className="h-[22px] w-[22px]" strokeWidth={2.1} />
                        </span>
                        <span className="min-w-0 flex-1 text-[15.5px] leading-snug">
                            {page.blocked
                                ? t('cases.noCaseBlocked', 'This phone comes in its own case, so it cannot wear another one.')
                                : t('cases.noCaseStores', 'No case on your phone. Cases are sold at phone case stores around the city.')}
                        </span>
                    </div>
                )}
            </div>
        </Section>
    );
}

/** Settings, Phone Case: the case being worn, and taking it off. Cases are designed and bought at a
 *  case store in the world, and so are the free choices about the phone itself. */
export function PhoneCasePage({ onBack }: { onBack: () => void }) {
    const [page, setPage] = useState<PhonePage | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        const res = await fetchPhonePage();
        if (!res.success || !res.data) {
            setError(failText(res, t('cases.phoneLoadFailed', 'Your phone settings could not be loaded')));
            return;
        }
        setPage(res.data);
    }, []);

    useEffect(() => { void load(); }, [load]);

    let body: ReactNode;
    if (page) {
        body = (
            <>
                <CaseSection page={page} onTakenOff={() => setPage(p => (p ? { ...p, equipped: false } : p))} />
                <p className="px-7 pt-5 text-[14px] leading-snug text-ios-gray">
                    {t('cases.phoneStyleAtStore', "Your phone's design, logo and trims are picked at a phone case store, free of charge.")}
                </p>
            </>
        );
    } else if (error) {
        body = (
            <div className="flex flex-col items-center px-8 pt-10 text-center">
                <p className="text-[15px] text-ios-gray">{error}</p>
                <button type="button" onClick={() => void load()} className="mt-3 text-[17px] font-semibold text-ios-blue active:opacity-60">
                    {t('cases.tryAgain', 'Try Again')}
                </button>
            </div>
        );
    } else {
        body = <div className="flex justify-center pt-16"><Spinner /></div>;
    }

    return (
        <SubPage title={t('settings.phoneCase', 'Phone Case')} backLabel={t('settings.settings', 'Settings')} onBack={onBack}>
            {body}
        </SubPage>
    );
}
