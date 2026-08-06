import { useState } from 'react';
import { Car, ChevronRight, Download, Inbox, Navigation, Power, Star, TrendingUp, Wallet } from 'lucide-react';

import { useSessionState } from '@/hooks/useSessionState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AlertDialog } from '@/ui/AlertDialog';
import { t } from '@/i18n';
import { driverStats, useRyde } from '../store';
import { CAR_COLORS, money } from '../data';
import { BigButton } from '../ui';
import { VehiclePicker } from './VehiclePicker';
import { RequestsPanel } from './RequestsPanel';

function when(ms: number): string {
    const d = new Date(ms);
    const day = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${time}`;
}

export function Driver() {
    const g = useRyde();
    if (!g.authChecked) return <div className="absolute inset-0 bg-base" />;
    if (!g.authed) return <SignedOut />;
    if (!g.driver.enabled) return <Signup />;
    return <Dashboard />;
}

function SignedOut() {
    const g = useRyde();
    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="shrink-0 px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('ryde.drive', 'Drive')}</h1>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center">
                <div className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-black text-white dark:bg-white dark:text-black">
                    <Car className="h-9 w-9" />
                </div>
                <p className="text-[23px] font-extrabold tracking-tight text-black dark:text-white">{t('ryde.signInToDrive', 'Sign in to drive')}</p>
                <p className="mt-2 text-[17px] font-medium leading-snug text-black/55 dark:text-white/55">
                    {t('ryde.signInToDriveBody', 'Create a Ryde account or log into an existing one to register as a driver and start earning.')}
                </p>
                <button
                    onClick={() => g.setAccountOpen(true)}
                    className="mt-6 rounded-full bg-black px-10 py-3.5 text-[18px] font-semibold text-white active:opacity-80 dark:bg-white dark:text-black"
                >
                    {t('ryde.createAccountOrLogIn', 'Create account or log in')}
                </button>
            </div>
        </div>
    );
}

function Signup() {
    const g = useRyde();
    const [car, setCar] = useState('');
    const [plate, setPlate] = useState('');
    const [color, setColor] = useState(CAR_COLORS[0]);
    const [picking, setPicking] = useState(false);
    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="shrink-0 px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('ryde.drive', 'Drive')}</h1>
            </div>
            <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
                <div className="mb-5 flex flex-col items-center text-center">
                    <div className="mb-3 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-black text-white dark:bg-white dark:text-black"><Car className="h-9 w-9" /></div>
                    <h2 className="text-[23px] font-extrabold tracking-tight text-black dark:text-white">{t('ryde.earnOnYourSchedule', 'Earn on your schedule')}</h2>
                    <p className="mt-1 text-[15px] text-ios-gray">{t('ryde.setUpVehicle', 'Set up your vehicle to start accepting rides.')}</p>
                </div>
                <div className="rounded-[12px] bg-surface p-4">
                    <button
                        onClick={() => setPicking(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-black/[0.06] py-3 text-[15px] font-semibold text-black active:opacity-70 dark:bg-white/10 dark:text-white"
                    >
                        <Download className="h-[18px] w-[18px]" strokeWidth={2.4} /> {t('ryde.importVehicleData', 'Import vehicle data')}
                    </button>
                    <p className="mb-3.5 mt-2 text-center text-[13px] text-ios-gray">{t('ryde.orEnterManually', 'or enter manually')}</p>
                    <Field label={t('ryde.vehicle', 'Vehicle')} value={car} onChange={setCar} placeholder={t('ryde.vehiclePlaceholder', 'e.g. Karin Sultan')} />
                    <Field label={t('ryde.plate', 'Plate')} value={plate} onChange={setPlate} placeholder={t('ryde.platePlaceholder', 'e.g. 12 ABC 34')} />
                    <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-gray">{t('ryde.colour', 'Colour')}</p>
                    <div className="mb-4 flex gap-2.5">
                        {CAR_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className="h-9 w-9 rounded-full"
                                style={{ background: c, boxShadow: color === c ? '0 0 0 2px #fff, 0 0 0 4px #FF9600' : '0 0 0 1px rgba(0,0,0,0.12)' }}
                            />
                        ))}
                    </div>
                    <BigButton disabled={!car.trim() || !plate.trim()} onClick={() => g.becomeDriver(car.trim(), plate.trim(), color)}>{t('ryde.startDriving', 'Start driving')}</BigButton>
                </div>
            </div>

            {picking && (
                <VehiclePicker
                    onClose={() => setPicking(false)}
                    onPick={v => { setCar(v.name); setPlate(v.plate); setPicking(false); }}
                />
            )}
        </div>
    );
}

function Dashboard() {
    const g = useRyde();
    const d = g.driver;
    const s = driverStats(g.rides);
    const waiting = g.waitingCount;
    const trips = g.rides
        .filter(r => r.role === 'driver' && r.status === 'completed')
        .sort((a, b) => b.placedAt - a.placedAt);
    const [view, setView] = useSessionState<'overview' | 'trips'>('ryde:driveView', 'overview');
    const [confirmUnregister, setConfirmUnregister] = useState(false);
    const [showRequests, setShowRequests] = useState(false);

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="shrink-0 px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('ryde.drive', 'Drive')}</h1>
            </div>

            <div className="shrink-0 px-4 pb-2 pt-1">
                <SegmentedControl
                    value={view}
                    onChange={setView}
                    options={[{ value: 'overview', label: t('ryde.overview', 'Overview') }, { value: 'trips', label: t('ryde.trips', 'Trips') }]}
                    className="mx-auto w-[232px]"
                />
            </div>

            <div key={view} className="no-scrollbar flex-1 animate-swipe-in-left overflow-y-auto px-4 pb-4 pt-1">
                {view === 'overview' ? (
                    <>
                        <div className="relative mb-3 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#2a2a2e] to-black p-4 text-white shadow-sm dark:from-white dark:to-[#e6e6e6] dark:text-black">
                            <TrendingUp className="pointer-events-none absolute -right-4 -top-4 h-[112px] w-[112px] opacity-[0.07]" strokeWidth={1.5} />
                            <div className="flex items-center gap-1.5 text-[14px] font-medium opacity-65">
                                <Wallet className="h-[16px] w-[16px]" strokeWidth={2.2} /> {t('ryde.todaysEarnings', 'Today’s earnings')}
                            </div>
                            <p className="mt-1.5 text-[42px] font-extrabold leading-none tracking-tight">{money(s.earnToday)}</p>
                            <p className="mt-2 text-[14px] opacity-65">{t('ryde.tripsTodayCount', '{n} trip{plural} today', { n: s.tripsToday, plural: s.tripsToday === 1 ? '' : 's' })}</p>
                        </div>

                        <button onClick={() => g.setOnline(!d.online)}
                            className={'mb-3 flex w-full items-center justify-center gap-2 rounded-[16px] py-3.5 text-[17px] font-bold text-white shadow-sm active:opacity-90 ' + (d.online ? 'bg-[#ff453a]' : 'bg-[#22c55e]')}>
                            <Power className="h-[22px] w-[22px]" strokeWidth={2.4} /> {d.online ? t('ryde.goOffline', 'Go offline') : t('ryde.goOnline', 'Go online')}
                        </button>

                        <button
                            onClick={() => { if (d.online) setShowRequests(true); }}
                            disabled={!d.online}
                            className={'mb-3.5 flex w-full items-center justify-between rounded-[16px] bg-surface px-4 py-3 shadow-sm ' + (d.online ? 'active:opacity-80' : 'opacity-50')}
                        >
                            <span className="flex items-center gap-2.5 text-[16px] font-semibold text-black dark:text-white">
                                <Inbox className="h-[20px] w-[20px]" strokeWidth={2.2} /> {t('ryde.rideRequests', 'Ride requests')}
                            </span>
                            <span className="flex items-center gap-2">
                                {waiting > 0 && (
                                    <span className={'flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[13px] font-bold leading-none tabular-nums text-white ' + (d.online ? 'bg-[#FF9600]' : 'bg-black/35 dark:bg-white/30')}>{waiting}</span>
                                )}
                                <ChevronRight className="h-[18px] w-[18px] text-ios-gray" strokeWidth={2.4} />
                            </span>
                        </button>

                        <div className="grid grid-cols-2 gap-3">
                            <Stat icon={<TrendingUp className="h-[19px] w-[19px] text-white" strokeWidth={2.2} />} iconBg="#34C759" label={t('ryde.lifetimeEarnings', 'Lifetime earnings')} value={money(s.earnTotal)} />
                            <Stat icon={<Navigation className="h-[19px] w-[19px] text-white" strokeWidth={2.2} />} iconBg="#0A84FF" label={t('ryde.totalTrips', 'Total trips')} value={String(s.tripsTotal)} />
                            <Stat icon={<Star className="h-[19px] w-[19px] text-white" strokeWidth={2.2} />} iconBg="#FF9600" label={t('ryde.rating', 'Rating')} value={s.avgRating != null ? s.avgRating.toFixed(2) : '5.00'} sub={s.ratedCount > 0 ? t('ryde.ratingsCount', '{n} rating{plural}', { n: s.ratedCount, plural: s.ratedCount === 1 ? '' : 's' }) : undefined} />
                            <Stat icon={<Car className="h-[19px] w-[19px] text-white" strokeWidth={2.2} />} iconBg="#5856D6" label={t('ryde.vehicle', 'Vehicle')} value={d.car || '—'} sub={d.plate || undefined} small />
                        </div>

                        <button
                            onClick={() => setConfirmUnregister(true)}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[16px] bg-surface py-3.5 text-[16px] font-semibold text-ios-red shadow-sm active:opacity-70"
                        >
                            <Car className="h-[18px] w-[18px]" strokeWidth={2.3} /> {t('ryde.unregisterVehicle', 'Unregister vehicle')}
                        </button>
                    </>
                ) : (
                    <>
                        {trips.length > 0 && (
                            <p className="mb-3 px-1 text-[15px] text-ios-gray">
                                {t('ryde.tripsEarned', '{n} trip{plural} · {amount} earned', { n: s.tripsTotal, plural: s.tripsTotal === 1 ? '' : 's', amount: money(s.earnTotal) })}
                            </p>
                        )}
                        {trips.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center px-10 pb-16 text-center">
                                <Car className="h-[72px] w-[72px] text-black/25 dark:text-white/25" strokeWidth={1.5} />
                                <p className="mt-4 text-[21px] font-semibold text-black/85 dark:text-white/90">{t('ryde.noTripsYet', 'No trips yet')}</p>
                                <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/55 dark:text-white/55">{t('ryde.goOnlineToAccept', 'Go online to accept rides — your completed trips and earnings show up here.')}</p>
                                {!d.online && (
                                    <button
                                        onClick={() => { g.setOnline(true); setView('overview'); }}
                                        className="mt-6 rounded-full bg-[#22c55e] px-10 py-3.5 text-[18px] font-semibold text-white active:opacity-80"
                                    >
                                        {t('ryde.goOnline', 'Go online')}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {trips.map(r => (
                                    <div key={r.id} className="rounded-[18px] bg-surface p-[18px]">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[22px] font-bold text-black dark:text-white">{r.riderName ?? t('ryde.rider', 'Rider')}</p>
                                                <p className="truncate text-[17px] text-ios-gray">{when(r.placedAt)}</p>
                                                <div className="mt-1.5">
                                                    {r.rated ? <TripStars value={r.rated} /> : <span className="text-[14px] text-ios-gray">{t('ryde.notRatedYet', 'Not rated yet')}</span>}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[22px] font-bold text-[#22c55e]">+{money((r.earn ?? 0) + (r.tip ?? 0))}</p>
                                                <p className="text-[14px] text-ios-gray">{t('ryde.fareAmount', 'fare {amount}', { amount: money(r.fare) })}</p>
                                                {(r.tip ?? 0) > 0 && <p className="text-[13px] font-semibold text-[#22c55e]">{t('ryde.inclTip', 'incl. {amount} tip', { amount: money(r.tip ?? 0) })}</p>}
                                            </div>
                                        </div>
                                        <div className="mt-3.5 flex items-center gap-2 border-t border-black/[0.07] pt-3.5 text-[17px] text-black/70 dark:border-white/10 dark:text-white/70">
                                            <span className="h-3 w-3 shrink-0 rounded-full bg-[#22c55e]" /><span className="truncate">{r.pickup.name}</span>
                                            <span className="opacity-50">→</span>
                                            <span className="h-3 w-3 shrink-0 rounded-full bg-black dark:bg-white" /><span className="truncate">{r.dropoff.name}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {showRequests && <RequestsPanel onClose={() => setShowRequests(false)} />}

            {confirmUnregister && (
                <AlertDialog
                    title={t('ryde.unregisterTitle', 'Unregister vehicle?')}
                    message={t('ryde.unregisterMessage', '{vehicle}{plate} will be removed. Your rating and trips stay, and you can register a new vehicle right after.', { vehicle: d.car || t('ryde.yourVehicle', 'Your vehicle'), plate: d.plate ? ` (${d.plate})` : '' })}
                    confirmLabel={t('ryde.unregister', 'Unregister')}
                    destructive
                    onCancel={() => setConfirmUnregister(false)}
                    onConfirm={() => { setConfirmUnregister(false); g.unregisterDriver(); }}
                />
            )}
        </div>
    );
}

function TripStars({ value }: { value: number }) {
    return (
        <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className="h-[15px] w-[15px]"
                    style={{ color: n <= value ? '#FF9600' : 'rgba(127,127,127,0.32)', fill: n <= value ? '#FF9600' : 'transparent' }} strokeWidth={2} />
            ))}
        </span>
    );
}

function Stat({ icon, iconBg, label, value, sub, small }: { icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string; small?: boolean }) {
    return (
        <div className="flex h-full flex-col rounded-[16px] bg-surface p-4">
            <div className="mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] shadow-sm" style={{ background: iconBg }}>
                {icon}
            </div>
            <p className={(small ? 'text-[18px] ' : 'text-[26px] ') + 'truncate font-extrabold tracking-tight text-black dark:text-white'}>{value}</p>
            {sub && <p className="mt-0.5 truncate text-[14px] font-semibold tabular-nums tracking-wide text-black/45 dark:text-white/45">{sub}</p>}
            <p className="mt-auto pt-2 text-[15.5px] font-medium leading-snug text-black/55 dark:text-white/55">{label}</p>
        </div>
    );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <label className="mb-3.5 block">
            <span className="mb-1.5 block text-[13px] font-semibold uppercase tracking-wide text-ios-gray">{label}</span>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full rounded-[10px] bg-black/[0.05] px-3.5 py-3 text-[17px] text-black outline-none placeholder:text-ios-gray dark:bg-white/10 dark:text-white" />
        </label>
    );
}
