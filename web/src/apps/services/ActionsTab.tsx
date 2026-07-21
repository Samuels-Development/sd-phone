import { useState } from 'react';
import type { ReactNode } from 'react';
import { Briefcase, ChevronDown, ChevronUp, DoorOpen, Hourglass, MessageSquare, Phone, Plus, User, UserMinus, UserPlus } from 'lucide-react';

import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { PromptDialog } from '@/ui/PromptDialog';
import { Toggle } from '@/ui/Toggle';
import { t } from '@/i18n';
import { fmtMoney, type Employee } from './data';
import { InvoicesSection } from './InvoicesSection';
import {
    demote, deposit, fire, hire, promote, quitCompany, setDuty, setJobCalls, setJobMessages, withdraw,
    type Grade, type MyCompany, type ServiceResult,
} from './servicesApi';

function nextGrade(grades: Grade[], current: number): Grade | null {
    return grades.filter(g => g.level > current).sort((a, b) => a.level - b.level)[0] ?? null;
}

function prevGrade(grades: Grade[], current: number): Grade | null {
    return grades.filter(g => g.level < current).sort((a, b) => b.level - a.level)[0] ?? null;
}

export function ActionsTab({ myCompany, multijob = false, onChanged }: {
    myCompany: MyCompany | null;
    multijob?: boolean;
    onChanged: (mc: MyCompany | null | undefined) => void;
}) {
    const [amountFor, setAmountFor] = useState<null | 'deposit' | 'withdraw'>(null);
    const [hiring, setHiring]       = useState(false);
    const [firing, setFiring]       = useState<Employee | null>(null);
    const [promoting, setPromoting] = useState<Employee | null>(null);
    const [demoting, setDemoting]   = useState<Employee | null>(null);
    const [quitting, setQuitting]   = useState(false);
    const [error,  setError]        = useState<string | null>(null);
    const [notice, setNotice]       = useState<string | null>(null);
    const [busy,   setBusy]         = useState(false);

    async function run(p: Promise<ServiceResult>) {
        if (busy) return;
        setBusy(true);
        const res = await p;
        setBusy(false);
        if (res.success) onChanged(res.data?.myCompany);
        else setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong'));
    }

    async function sendOffer(input: string) {
        const serverId = parseInt(input.replace(/[^0-9]/g, ''), 10);
        if (!serverId) { setError(t('services.enterValidServerId', 'Enter a valid server ID')); return; }
        if (busy) return;
        setBusy(true);
        const res = await hire(serverId, 0);
        setBusy(false);
        if (res.success) { onChanged(res.data?.myCompany); setNotice(t('services.jobOfferSent', 'Job offer sent. They can accept it in Services → Jobs.')); }
        else setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong'));
    }

    async function toggle(field: 'duty' | 'jobCalls' | 'jobMessages', value: boolean) {
        if (!myCompany) return;
        onChanged({ ...myCompany, [field]: value });
        const setter = field === 'duty' ? setDuty : field === 'jobCalls' ? setJobCalls : setJobMessages;
        const res = await setter(value);
        if (res.success) onChanged(res.data?.myCompany);
        else { onChanged({ ...myCompany, [field]: !value }); setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong')); }
    }

    if (!myCompany) {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                <h1 className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('services.actions', 'Actions')}</h1>
                <EmptyState icon={Briefcase} title={t('services.noCompany', 'No Company')} subtitle={t('services.notPartOfCompany', "You're not part of a company.")} />
            </div>
        );
    }

    const showMoney     = myCompany.isBoss && myCompany.available;
    const showEmployees = myCompany.isBoss;
    const showInvoices  = multijob && myCompany.duty;
    const dutyOff       = !myCompany.duty;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <h1 className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('services.actions', 'Actions')}</h1>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <SectionHeader>{t('services.settings', 'Settings')}</SectionHeader>
                <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                    <Row
                        icon={<Tile color="#FF9F0A"><Hourglass className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>}
                        title={t('services.duty', 'Duty')}
                        subtitle={t('services.toggleDutyStatus', 'Toggle your duty status')}
                        right={<Toggle on={myCompany.duty} onChange={v => void toggle('duty', v)} />}
                    />
                    {myCompany.isCompany && (
                        <>
                            <Divider />
                            <Row
                                dimmed={dutyOff}
                                icon={<Tile color="#34C759"><Phone className="h-[18px] w-[18px] text-white" strokeWidth={2.25} fill="currentColor" /></Tile>}
                                title={t('services.jobCalls', 'Job Calls')}
                                subtitle={t('services.receiveCalls', 'Receive calls to your job.')}
                                right={<Toggle disabled={dutyOff} on={!dutyOff && myCompany.jobCalls} onChange={v => void toggle('jobCalls', v)} />}
                            />
                            <Divider />
                            <Row
                                dimmed={dutyOff}
                                icon={<Tile color="#0A84FF"><MessageSquare className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>}
                                title={t('services.jobMessages', 'Job Messages')}
                                subtitle={t('services.getNotified', 'Get notified of new messages.')}
                                right={<Toggle disabled={dutyOff} on={!dutyOff && myCompany.jobMessages} onChange={v => void toggle('jobMessages', v)} />}
                            />
                        </>
                    )}
                </div>

                {showMoney && (
                    <>
                        <SectionHeader>{t('services.actions', 'Actions')}</SectionHeader>
                        <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                            <Row
                                icon={<Tile color="#34C759"><Briefcase className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>}
                                title={t('services.balance', 'Balance')}
                                subtitle={t('services.currentBalance', 'Current balance of the company')}
                                right={<span className="text-[17px] font-semibold text-black dark:text-white">{fmtMoney(myCompany.balance ?? 0)}</span>}
                            />
                            <Divider />
                            <div className="flex">
                                <SplitButton label={t('services.deposit', 'Deposit')}  onClick={() => setAmountFor('deposit')} />
                                <div className="my-2 w-px bg-black/10 dark:bg-white/10" />
                                <SplitButton label={t('services.withdraw', 'Withdraw')} onClick={() => setAmountFor('withdraw')} />
                            </div>
                        </div>
                    </>
                )}

                {showEmployees && (
                    <>
                        <SectionHeader>{t('services.manageEmployees', 'Manage Employees')}</SectionHeader>
                        <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                            <Row
                                icon={<Tile color="#0A84FF"><UserPlus className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>}
                                title={t('services.hire', 'Hire')}
                                subtitle={t('services.hireNewEmployee', 'Hire a new employee')}
                                onClick={() => setHiring(true)}
                                right={<Plus className="h-[22px] w-[22px] text-black/35 dark:text-white/35" strokeWidth={2.25} />}
                            />
                            {(myCompany.employees ?? []).map(e => (
                                <div key={e.id}>
                                    <Divider />
                                    <EmployeeRow
                                        employee={e}
                                        grades={myCompany.grades ?? []}
                                        myGrade={myCompany.myGrade ?? 0}
                                        onFire={() => setFiring(e)}
                                        onPromote={() => setPromoting(e)}
                                        onDemote={() => setDemoting(e)}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {showInvoices && <InvoicesSection />}

                <SectionHeader>{t('services.employment', 'Employment')}</SectionHeader>
                <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                    <button
                        type="button"
                        onClick={() => setQuitting(true)}
                        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                    >
                        <Tile color="#FF3B30"><DoorOpen className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[18px] font-medium text-ios-red">{t('services.quitJob', 'Quit Job')}</div>
                            <div className="truncate text-[16px] font-medium text-ios-gray">{t('services.resignFrom', 'Resign from {label}', { label: myCompany.label })}</div>
                        </div>
                    </button>
                </div>
            </div>

            {amountFor && (
                <PromptDialog
                    title={amountFor === 'deposit' ? t('services.deposit', 'Deposit') : t('services.withdraw', 'Withdraw')}
                    message={amountFor === 'deposit' ? t('services.depositMsg', 'Move money from your bank into the company.') : t('services.withdrawMsg', 'Move money from the company into your bank.')}
                    placeholder={t('services.amount', 'Amount')}
                    confirmLabel={amountFor === 'deposit' ? t('services.deposit', 'Deposit') : t('services.withdraw', 'Withdraw')}
                    onCancel={() => setAmountFor(null)}
                    onConfirm={v => {
                        const amount = Math.floor(Number(v.replace(/[^0-9]/g, '')));
                        const action = amountFor;
                        setAmountFor(null);
                        if (amount > 0) void run(action === 'deposit' ? deposit(amount) : withdraw(amount));
                    }}
                />
            )}

            {hiring && (
                <PromptDialog
                    title={t('services.hireEmployee', 'Hire Employee')}
                    message={t('services.hireEmployeeMsg', 'Enter the server ID of the player to send a job offer to. They must be online.')}
                    placeholder={t('services.serverId', 'Server ID')}
                    confirmLabel={t('services.sendOffer', 'Send Offer')}
                    onCancel={() => setHiring(false)}
                    onConfirm={v => { setHiring(false); void sendOffer(v); }}
                />
            )}

            {firing && (
                <AlertDialog
                    title={t('services.fireName', 'Fire {name}?', { name: firing.name })}
                    message={t('services.fireMsg', "They'll be removed from the company.")}
                    confirmLabel={t('services.fire', 'Fire')}
                    destructive
                    onCancel={() => setFiring(null)}
                    onConfirm={() => { const t = firing; setFiring(null); void run(fire(t.id)); }}
                />
            )}

            {promoting && (
                <AlertDialog
                    title={t('services.promoteName', 'Promote {name}?', { name: promoting.name })}
                    message={(() => {
                        const next = nextGrade(myCompany.grades ?? [], promoting.grade ?? 0);
                        return next ? t('services.promotedTo', "They'll be promoted to {label}.", { label: next.label }) : t('services.alreadyHighest', 'They are already at the highest rank.');
                    })()}
                    confirmLabel={t('services.promote', 'Promote')}
                    onCancel={() => setPromoting(null)}
                    onConfirm={() => { const t = promoting; setPromoting(null); void run(promote(t.id)); }}
                />
            )}

            {demoting && (
                <AlertDialog
                    title={t('services.demoteName', 'Demote {name}?', { name: demoting.name })}
                    message={(() => {
                        const prev = prevGrade(myCompany.grades ?? [], demoting.grade ?? 0);
                        return prev ? t('services.demotedTo', "They'll be demoted to {label}.", { label: prev.label }) : t('services.alreadyLowest', 'They are already at the lowest rank.');
                    })()}
                    confirmLabel={t('services.demote', 'Demote')}
                    onCancel={() => setDemoting(null)}
                    onConfirm={() => { const t = demoting; setDemoting(null); void run(demote(t.id)); }}
                />
            )}

            {quitting && (
                <AlertDialog
                    title={t('services.quitLabel', 'Quit {label}?', { label: myCompany.label })}
                    message={multijob
                        ? t('services.quitMsgMulti', "You'll be set to unemployed and this job will be removed from your saved jobs. You can be re-hired later.")
                        : t('services.quitMsg', "You'll be set to unemployed. You can be re-hired later.")}
                    confirmLabel={t('services.quit', 'Quit')}
                    destructive
                    onCancel={() => setQuitting(false)}
                    onConfirm={() => { setQuitting(false); void run(quitCompany()); }}
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

            {notice && (
                <AlertDialog
                    title={t('services.done', 'Done')}
                    message={notice}
                    confirmLabel={t('services.ok', 'OK')}
                    hideCancel
                    onCancel={() => setNotice(null)}
                    onConfirm={() => setNotice(null)}
                />
            )}
        </div>
    );
}

function EmployeeRow({ employee, grades, myGrade, onFire, onPromote, onDemote }: { employee: Employee; grades: Grade[]; myGrade: number; onFire: () => void; onPromote: () => void; onDemote: () => void }) {
    const eGrade     = employee.grade ?? 0;
    const manage     = eGrade < myGrade;
    const up         = nextGrade(grades, eGrade);
    const down       = prevGrade(grades, eGrade);
    const canPromote = manage && up != null && up.level < myGrade;
    const canDemote  = manage && down != null;
    return (
        <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#c2c2c7] dark:bg-control">
                <User className="h-[23px] w-[23px] text-white" strokeWidth={2} fill="currentColor" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[18px] font-medium text-black dark:text-white">{employee.name}</div>
                <div className="text-[16px] font-medium text-ios-gray">{employee.rank}</div>
            </div>
            <span
                className="h-[11px] w-[11px] shrink-0 rounded-full"
                title={employee.status === 'duty' ? t('services.onDuty', 'On duty') : employee.status === 'offduty' ? t('services.offDuty', 'Off duty') : t('services.away', 'Away')}
                style={{
                    background: employee.status === 'duty'    ? '#34C759'
                              : employee.status === 'offduty' ? '#FF9F0A'
                              : '#FF3B30',
                }}
            />
            {employee.self ? (
                <span className="shrink-0 pr-1 text-[14px] font-medium text-ios-gray">{t('services.you', 'You')}</span>
            ) : manage ? (
                <div className="flex shrink-0 items-center gap-0.5">
                    {canDemote && (
                        <button
                            type="button"
                            aria-label={t('services.demoteAria', 'Demote {name}', { name: employee.name })}
                            onClick={onDemote}
                            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-ios-gray transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                        >
                            <ChevronDown className="h-[21px] w-[21px]" strokeWidth={2.4} />
                        </button>
                    )}
                    {canPromote && (
                        <button
                            type="button"
                            aria-label={t('services.promoteAria', 'Promote {name}', { name: employee.name })}
                            onClick={onPromote}
                            className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-ios-blue transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                        >
                            <ChevronUp className="h-[21px] w-[21px]" strokeWidth={2.4} />
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label={t('services.fireAria', 'Fire {name}', { name: employee.name })}
                        onClick={onFire}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-ios-red transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                    >
                        <UserMinus className="h-[19px] w-[19px]" strokeWidth={2.1} />
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function SectionHeader({ children }: { children: ReactNode }) {
    return (
        <div className="px-1 pb-2 pt-7 text-[19px] font-bold tracking-tight text-black dark:text-white">{children}</div>
    );
}

function Tile({ color, children }: { color: string; children: ReactNode }) {
    return (
        <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] shadow-sm" style={{ background: color }}>
            {children}
        </div>
    );
}

function Row({ icon, title, subtitle, right, onClick, dimmed = false }: { icon: ReactNode; title: string; subtitle: string; right: ReactNode; onClick?: () => void; dimmed?: boolean }) {
    const dim = dimmed ? 'opacity-40' : '';
    const content = (
        <>
            <div className={`shrink-0 ${dim}`}>{icon}</div>
            <div className={`min-w-0 flex-1 ${dim}`}>
                <div className="truncate text-[18px] font-medium text-black dark:text-white">{title}</div>
                <div className="truncate text-[16px] font-medium text-ios-gray">{subtitle}</div>
            </div>
            <div className="shrink-0">{right}</div>
        </>
    );
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10">
                {content}
            </button>
        );
    }
    return <div className="flex items-center gap-3.5 px-4 py-3.5">{content}</div>;
}

function SplitButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="flex-1 py-3 text-center text-[16px] font-medium text-ios-blue active:bg-black/5 dark:active:bg-white/5">
            {label}
        </button>
    );
}

function Divider() {
    return <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />;
}
