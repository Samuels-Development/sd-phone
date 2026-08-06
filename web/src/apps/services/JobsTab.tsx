import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Briefcase, BriefcaseBusiness, Check, Inbox as InboxIcon, Trash2 } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useReanimateOnChange } from '@/hooks/useReanimateOnChange';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { t } from '@/i18n';
import {
    acceptInvite, declineInvite, fetchJobs, removeJob, switchJob,
    type JobInvite, type JobsView, type SavedJob,
} from './servicesApi';

type Scope = 'mine' | 'offers';

let cachedJobs: JobsView | null = null;

export function JobsTab({ onJobChanged }: { onJobChanged?: () => void }) {
    const [view, setView]   = useState<JobsView | null>(cachedJobs);
    const [scope, setScope] = useSessionState<Scope>('services:jobsScope', 'mine');
    const [confirm, setConfirm]   = useState<SavedJob | null>(null);
    const [removing, setRemoving] = useState<SavedJob | null>(null);
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => { const v = await fetchJobs(); cachedJobs = v; setView(v); }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    useNuiEvent('sd-phone:services:jobsChanged', useCallback(() => { void refresh(); }, [refresh]));

    const run = useCallback(async (p: Promise<{ success: boolean; data?: JobsView; message?: string }>) => {
        if (busy) return;
        setBusy(true);
        const res = await p;
        setBusy(false);
        if (res.success) { if (res.data) { cachedJobs = res.data; setView(res.data); } onJobChanged?.(); }
        else setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong'));
    }, [busy, onJobChanged]);

    const jobs    = view?.jobs ?? [];
    const invites = view?.invites ?? [];
    const max     = view?.max ?? 0;

    const scopeRef = useReanimateOnChange<HTMLDivElement>('animate-swipe-in-left', scope);

    const rowEls   = useRef(new Map<string, HTMLDivElement>());
    const prevTops = useRef(new Map<string, number>());
    useLayoutEffect(() => {
        const els = rowEls.current;
        const next = new Map<string, number>();
        els.forEach((el, key) => next.set(key, el.offsetTop));
        els.forEach((el, key) => {
            const from = prevTops.current.get(key);
            const to   = next.get(key);
            if (from == null || to == null || from === to) return;
            const dy = from - to;
            el.style.transition = 'none';
            el.style.transform  = `translateY(${dy}px)`;
            el.style.zIndex     = String(20 + Math.round(Math.abs(dy)));
            void el.offsetHeight;
            el.style.transition = 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.transform  = '';
            const cleanup = () => {
                el.style.transition = '';
                el.style.zIndex = '';
                el.removeEventListener('transitionend', cleanup);
            };
            el.addEventListener('transitionend', cleanup);
        });
        prevTops.current = next;
    }, [jobs]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <h1 className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('services.jobs', 'Jobs')}</h1>

            <div className="px-4 pb-3">
                <SegmentedControl
                    value={scope}
                    onChange={setScope}
                    options={[
                        { value: 'mine',   label: t('services.myJobs', 'My Jobs') },
                        { value: 'offers', label: t('services.offers', 'Offers'), dot: invites.length > 0 },
                    ]}
                    className="mx-auto w-[232px]"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div ref={scopeRef}>
                    {view === null ? null : scope === 'mine' ? (
                        jobs.length === 0 ? (
                            <EmptyState icon={Briefcase} title={t('services.noJobs', 'No Jobs')} subtitle={t('services.noJobsSubtitle', 'Jobs you take on will show up here.')} />
                        ) : (
                            <>
                                {max > 0 && <Capacity count={jobs.length} max={max} />}
                                <div className="relative overflow-hidden rounded-[12px] bg-surface">
                                    {jobs.map(j => (
                                        <div
                                            key={j.job}
                                            ref={el => { if (el) rowEls.current.set(j.job, el); else rowEls.current.delete(j.job); }}
                                            className="relative border-t border-black/10 bg-surface first:border-t-0 dark:border-white/10"
                                        >
                                            <JobRow
                                                job={j}
                                                disabled={busy}
                                                onSwitch={() => setConfirm(j)}
                                                onRemove={() => setRemoving(j)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )
                    ) : (
                        invites.length === 0 ? (
                            <EmptyState icon={InboxIcon} title={t('services.noOffers', 'No Offers')} subtitle={t('services.noOffersSubtitle', 'Job offers you receive will appear here.')} />
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                {invites.map(inv => (
                                    <InviteCard
                                        key={inv.id}
                                        invite={inv}
                                        disabled={busy}
                                        onAccept={() => void run(acceptInvite(inv.id))}
                                        onDecline={() => void run(declineInvite(inv.id))}
                                    />
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>

            {confirm && (
                <AlertDialog
                    title={t('services.switchToLabel', 'Switch to {label}?', { label: confirm.label })}
                    message={t('services.switchMsg', "You'll clock off your current job and go off duty.")}
                    confirmLabel={t('services.switch', 'Switch')}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => { const t = confirm; setConfirm(null); void run(switchJob(t.job)); }}
                />
            )}

            {removing && (
                <AlertDialog
                    title={t('services.removeLabel', 'Remove {label}?', { label: removing.label })}
                    message={removing.active
                        ? t('services.removeMsgActive', "This is your active job — removing it will set you to unemployed. You'd need to be re-hired to get it back.")
                        : t('services.removeMsg', "This drops the job from your saved jobs. You'd need to be re-hired to get it back.")}
                    confirmLabel={t('services.remove', 'Remove')}
                    destructive
                    onCancel={() => setRemoving(null)}
                    onConfirm={() => { const t = removing; setRemoving(null); void run(removeJob(t.job)); }}
                />
            )}

            {error && (
                <AlertDialog
                    title={t('services.couldntComplete', "Couldn't complete that")}
                    message={error}
                    confirmLabel={t('services.ok', 'OK')}
                    hideCancel
                    onCancel={() => setError(null)}
                    onConfirm={() => setError(null)}
                />
            )}
        </div>
    );
}

function JobRow({ job, disabled, onSwitch, onRemove }: {
    job: SavedJob;
    disabled: boolean;
    onSwitch: () => void;
    onRemove: () => void;
}) {
    return (
        <div className="flex items-stretch">
            <button
                type="button"
                disabled={disabled || job.active}
                onClick={onSwitch}
                className="flex min-w-0 flex-1 items-center gap-3.5 py-4 pl-4 pr-2 text-left transition-colors hover:bg-black/[0.06] active:bg-black/10 disabled:hover:bg-transparent disabled:active:bg-transparent dark:hover:bg-white/[0.07] dark:active:bg-white/10"
            >
                <Tile active={job.active}>
                    <BriefcaseBusiness className="h-[20px] w-[20px] text-white" strokeWidth={2.1} />
                </Tile>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[18px] font-medium text-black dark:text-white">{job.label}</div>
                    <div className="truncate text-[16px] font-medium text-ios-gray">{job.gradeLabel}</div>
                </div>
                {job.active ? (
                    <span className="flex shrink-0 items-center gap-1 text-[16px] font-semibold text-ios-green">
                        <Check className="h-[18px] w-[18px]" strokeWidth={2.6} />
                        {t('services.active', 'Active')}
                    </span>
                ) : (
                    <span className="shrink-0 text-[17px] font-medium text-ios-blue">{t('services.switch', 'Switch')}</span>
                )}
            </button>
            <button
                type="button"
                disabled={disabled}
                onClick={onRemove}
                aria-label={t('services.removeName', 'Remove {name}', { name: job.label })}
                className="flex w-[46px] shrink-0 items-center justify-center text-ios-red transition-colors hover:bg-black/[0.06] active:bg-black/[0.12] disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-white/[0.06] dark:active:bg-white/[0.12]"
            >
                <Trash2 className="h-[19px] w-[19px]" strokeWidth={2.1} />
            </button>
        </div>
    );
}

function InviteCard({ invite, disabled, onAccept, onDecline }: {
    invite: JobInvite;
    disabled: boolean;
    onAccept: () => void;
    onDecline: () => void;
}) {
    return (
        <div className="rounded-[16px] bg-surface px-4 py-4">
            <div className="flex items-center gap-3.5">
                <Tile>
                    <Briefcase className="h-[20px] w-[20px] text-white" strokeWidth={2.1} />
                </Tile>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[18px] font-semibold text-black dark:text-white">{invite.label}</div>
                    <div className="truncate text-[16px] font-medium text-ios-gray">
                        {t('services.gradeFrom', '{gradeLabel} · from {from}', { gradeLabel: invite.gradeLabel, from: invite.from })}
                    </div>
                </div>
            </div>
            <div className="mt-3.5 flex gap-2.5">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onAccept}
                    className="flex-1 rounded-[11px] bg-ios-blue py-3 text-center text-[17px] font-semibold text-white active:opacity-75 disabled:opacity-50"
                >
                    {t('services.accept', 'Accept')}
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onDecline}
                    className="flex-1 rounded-[11px] bg-black/[0.06] py-3 text-center text-[17px] font-semibold text-ios-red active:opacity-75 disabled:opacity-50 dark:bg-white/10"
                >
                    {t('services.decline', 'Decline')}
                </button>
            </div>
        </div>
    );
}

function Capacity({ count, max }: { count: number; max: number }) {
    const full = count >= max;
    const pct  = Math.max(0, Math.min(100, Math.round((count / max) * 100)));
    return (
        <div className="mb-2.5 px-1">
            <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold uppercase tracking-wider text-ios-gray">{t('services.myJobs', 'My Jobs')}</span>
                <span className={`text-[15px] font-semibold ${full ? 'text-ios-red' : 'text-ios-gray'}`}>{count} / {max}</span>
            </div>
            <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ${full ? 'bg-ios-red' : 'bg-ios-blue'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function Tile({ active, children }: { active?: boolean; children: ReactNode }) {
    return (
        <div
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] shadow-sm transition-colors duration-300"
            style={{ background: active ? '#34C759' : '#0A84FF' }}
        >
            {children}
        </div>
    );
}
