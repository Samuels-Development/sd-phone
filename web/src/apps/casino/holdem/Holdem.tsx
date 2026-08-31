import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, Coins, LogOut, Plus, Users } from 'lucide-react';

import { t } from '@/i18n';
import { GameHeader } from '@/apps/_games/GameHeader';
import { AlertDialog } from '@/ui/AlertDialog';
import { Scroller } from '@/ui/Scroller';
import { Sheet } from '@/ui/Sheet';
import { SlideOver } from '@/ui/SlideOver';
import { Slider } from '@/ui/Slider';
import { useDidEnter } from '@/hooks/useDidEnter';
import { useSessionState } from '@/hooks/useSessionState';

import type { CasinoGameProps } from '../casinoApi';
import { APP_BG, CARD_SHADOW, FELT, GOLD, GOLD_FRAME, PAD_B, SEAT, SURFACE, TABLE, fmtChips } from '../theme';
import { MuteButton } from '../MuteButton';

import { ActionBar } from './ActionBar';
import { HeroPanel } from './Seat';
import { TableFelt, blindMarks } from './TableFelt';
import { NO_CREATE, handCatLabel, mySeat, potTotal, seatOf } from './data';
import type { HoldemCreateLimits, HoldemCreateOpts, HoldemLobby, HoldemTableInfo } from './data';
import { createApi, tablesApi } from './holdemApi';
import { useHoldemTable } from './useHoldemTable';
import { failText } from '@/core/api';

const ACCENT = TABLE.chip;

const KEYFRAMES = `
@keyframes hd-deal { from { transform: translate(64px, -104px) scale(0.92); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes hd-clock { from { transform: scaleX(1) } to { transform: scaleX(0) } }
@keyframes hd-tray { from { transform: translateY(14px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes hd-badge-in { 0% { transform: translateY(8px) scale(0.94); opacity: 0 } 60% { transform: translateY(0) scale(1.03) } 100% { transform: none; opacity: 1 } }
@keyframes hd-turn { 0%, 100% { box-shadow: inset 0 1px 0 ${SEAT.podHi}, 0 0 0 1.5px ${SEAT.live} } 50% { box-shadow: inset 0 1px 0 ${SEAT.podHi}, 0 0 0 1.5px ${SEAT.live}, 0 0 10px rgba(240,212,138,0.55) } }
`;

export function Holdem({ chips, onChips, onBack, onCashier }: CasinoGameProps) {
    const [tableId, setTableId] = useSessionState<string | null>('casino:holdemTable', null);
    const [lobby, setLobby] = useState<HoldemLobby>({ tables: [], create: NO_CREATE });
    const [sitSeat, setSitSeat] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const animateNav = useDidEnter();

    const ctl = useHoldemTable(tableId);
    const { state, handEnd, error, clearError, fail, sit, leave, act } = ctl;

    const refreshTables = useCallback(() => {
        void tablesApi().then(setLobby);
    }, []);

    useEffect(() => { refreshTables(); }, [refreshTables]);

    const tables = lobby.tables;
    const info = useMemo(() => tables.find(x => x.id === tableId) ?? null, [tables, tableId]);

    const onCreate = useCallback(async (opts: HoldemCreateOpts) => {
        const res = await createApi(opts);
        if (!res.ok || !res.data) {
            fail(failText(res, t('holdem.createFailed', 'That table could not be opened.')));
            return;
        }
        setLobby(await tablesApi());
        setTableId(res.data.tableId);
    }, [fail, setTableId]);

    const hero = state ? mySeat(state.seats) : null;
    const seated = hero !== null && hero.name !== null;
    const inHand = hero !== null && (hero.state === 'in' || hero.state === 'allin');

    const goList = useCallback(async () => {
        if (seated) {
            const back = await leave();
            if (back !== null) onChips(back);
        }
        setTableId(null);
        refreshTables();
    }, [seated, leave, onChips, setTableId, refreshTables]);

    const actorSeat = state ? seatOf(state.seats, state.actor) : null;
    const waitingFor = actorSeat && actorSeat.name && !actorSeat.me ? actorSeat.name : null;
    const marks = state ? blindMarks(state) : {};
    const msLeft = state ? Math.max(0, state.deadline - state.now) : 0;
    const pot = state ? potTotal(state.pots) : 0;

    const tableTitle = info
        ? state ? `${info.name}  ${fmtChips(state.sb)}/${fmtChips(state.bb)}` : info.name
        : t('holdem.title', "Texas Hold'em");

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <style>{KEYFRAMES}</style>

            <GameHeader title={t('holdem.title', "Texas Hold'em")} accent={ACCENT} onBack={onBack} right={<MuteButton accent={ACCENT} />} />
            <ChipsRow chips={chips} onCashier={onCashier} />
            <TableList
                tables={tables}
                canCreate={lobby.create.enabled}
                onCreate={() => setCreating(true)}
                onPick={id => { setTableId(id); }}
            />

            {creating && (
                <CreateSheet
                    limits={lobby.create}
                    onClose={() => setCreating(false)}
                    onCreate={opts => { void onCreate(opts); }}
                />
            )}

            {tableId !== null && (
                <SlideOver onClose={() => { void goList(); }} animateIn={animateNav}>
                    {close => (
                        <div className="flex h-full min-h-0 flex-col" style={{ background: APP_BG }}>
                            <GameHeader
                                title={tableTitle}
                                accent={ACCENT}
                                onBack={() => { if (inHand) { setConfirmLeave(true); return; } close(); }}
                                right={<MuteButton accent={ACCENT} />}
                            />

                            {state ? (
                                <div className="relative flex min-h-0 flex-1 flex-col">
                                    <TableFelt
                                        state={state}
                                        heroSeat={hero ? hero.i : null}
                                        handEnd={handEnd}
                                        onSit={seated ? null : seat => setSitSeat(seat)}
                                    />

                                    {handEnd && (
                                        <div
                                            className="pointer-events-none absolute bottom-[46%] left-1/2 z-20 -translate-x-1/2 rounded-2xl px-4 py-2 text-center"
                                            style={{ background: 'rgba(0,0,0,0.62)', boxShadow: `inset 0 0 0 1.5px ${GOLD.mid}`, animation: 'hd-badge-in 0.34s ease-out' }}
                                        >
                                            {handEnd.awards.map(award => {
                                                const seat = seatOf(state.seats, award.seat);
                                                const shown = handEnd.shown.find(s => s.seat === award.seat);
                                                const name = seat?.name ?? t('holdem.emptySeat', 'Open seat');
                                                return (
                                                    <div key={award.seat} className="whitespace-nowrap text-[17px] font-extrabold" style={{ color: TABLE.win }}>
                                                        {shown
                                                            ? t('holdem.winsWith', '{name} wins with {hand}', { name, hand: handCatLabel(shown.cat) })
                                                            : t('holdem.winsPot', '{name} wins {n}', { name, n: fmtChips(award.amount) })}
                                                    </div>
                                                );
                                            })}
                                            {handEnd.awards.length > 1 && (
                                                <div className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                    {t('holdem.splitPot', 'Split pot')}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {seated && hero ? (
                                        <HeroPanel
                                            seat={hero}
                                            isActor={state.actor === hero.i}
                                            best={handEnd ? (handEnd.shown.find(s => s.seat === hero.i)?.best ?? null) : null}
                                            msLeft={msLeft}
                                            clockKey={`${state.handId}-${state.street}-${state.actor ?? 0}`}
                                            sb={state.sb}
                                            bb={state.bb}
                                            blind={marks[hero.i] ?? null}
                                            isButton={state.button === hero.i}
                                            handRank={state.handRank}
                                        />
                                    ) : (
                                        <div className="flex shrink-0 items-center justify-center px-4 pt-3" style={{ height: 96 }}>
                                            <span className="text-center text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                {t('holdem.tapSeat', 'Tap an open seat to buy in')}
                                            </span>
                                        </div>
                                    )}

                                    {seated ? (
                                        <ActionBar
                                            legal={state.legal}
                                            pot={pot}
                                            heroCommitted={hero ? hero.committed : 0}
                                            bb={state.bb}
                                            waitingFor={waitingFor}
                                            onAct={act}
                                        />
                                    ) : (
                                        <div className="flex shrink-0 items-center gap-2 px-3 pt-2" style={{ paddingBottom: PAD_B }}>
                                            <button
                                                type="button"
                                                onClick={() => close()}
                                                className="flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[16px] text-[16px] font-bold text-white active:opacity-70"
                                                style={{ background: 'rgba(0,0,0,0.32)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
                                            >
                                                <LogOut className="h-[17px] w-[17px]" strokeWidth={2.4} />
                                                {t('holdem.tables', 'Tables')}
                                            </button>
                                        </div>
                                    )}

                                    {sitSeat !== null && (
                                        <BuyInSheet
                                            seat={sitSeat}
                                            chips={chips}
                                            min={info ? info.minBuyIn : state.bb * 40}
                                            max={info ? info.maxBuyIn : state.bb * 200}
                                            onCashier={() => { setSitSeat(null); onCashier(); }}
                                            onClose={() => setSitSeat(null)}
                                            onConfirm={async amount => {
                                                const ok = await sit(sitSeat, amount);
                                                setSitSeat(null);
                                                if (ok) { onChips(Math.max(0, chips - amount)); refreshTables(); }
                                            }}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="flex min-h-0 flex-1 items-center justify-center">
                                    <span className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                        {t('holdem.joining', 'Joining the table')}
                                    </span>
                                </div>
                            )}

                            {confirmLeave && (
                                <AlertDialog
                                    forceDark
                                    title={t('holdem.leaveTitle', 'Leave the table?')}
                                    message={t('holdem.leaveMessage', 'Your hand is folded and the chips already in the pot stay there.')}
                                    confirmLabel={t('holdem.leave', 'Leave table')}
                                    cancelLabel={t('holdem.stay', 'Stay')}
                                    destructive
                                    onCancel={() => setConfirmLeave(false)}
                                    onConfirm={() => { setConfirmLeave(false); close(); }}
                                />
                            )}
                        </div>
                    )}
                </SlideOver>
            )}

            {error && (
                <AlertDialog
                    forceDark
                    hideCancel
                    title={t('holdem.title', "Texas Hold'em")}
                    message={error}
                    confirmLabel={t('casino.done', 'Done')}
                    onCancel={clearError}
                    onConfirm={clearError}
                />
            )}
        </div>
    );
}

function ChipsRow({ chips, onCashier }: { chips: number; onCashier: () => void }) {
    return (
        <button type="button" onClick={onCashier} className="flex shrink-0 items-center justify-center gap-1.5 pb-0.5 active:opacity-70">
            <Coins className="h-[17px] w-[17px]" strokeWidth={2.5} style={{ color: TABLE.chip }} />
            <span className="text-[18px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(chips)}</span>
            <span className="ml-0.5 text-[12px] font-semibold text-white/55">{t('casino.chips', 'chips')}</span>
        </button>
    );
}

function TableList({ tables, canCreate, onCreate, onPick }: {
    tables:    HoldemTableInfo[];
    canCreate: boolean;
    onCreate:  () => void;
    onPick:    (id: string) => void;
}) {
    return (
        <Scroller className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 px-5 pt-3" style={{ paddingBottom: PAD_B }}>
                <p className="text-[13px] font-semibold text-white/55">
                    {t('holdem.tablesIntro', 'No limit hold em, up to six players. Buy in and your chips wait at the table until you stand up.')}
                </p>

                {canCreate && (
                    <button
                        type="button"
                        onClick={onCreate}
                        className="flex items-center gap-3 rounded-[20px] px-4 py-3 text-left active:opacity-80"
                        style={{ background: SURFACE.soft, boxShadow: `inset 0 0 0 1px rgba(240,212,138,0.32)` }}
                    >
                        <div
                            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
                            style={{ background: GOLD_FRAME, boxShadow: `inset 0 1px 0 ${GOLD.hi}` }}
                        >
                            <Plus className="h-[19px] w-[19px]" strokeWidth={3} style={{ color: FELT.bot }} />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[16px] font-bold" style={{ color: GOLD.top }}>
                                {t('holdem.createTable', 'Create table')}
                            </span>
                            <span className="truncate text-[12px] font-semibold text-white/45">
                                {t('holdem.createTableSub', 'Pick the blinds and the buy in')}
                            </span>
                        </div>
                        <ChevronRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} style={{ color: 'rgba(240,212,138,0.55)' }} />
                    </button>
                )}

                {tables.map(table => (
                    <button
                        key={table.id}
                        type="button"
                        onClick={() => onPick(table.id)}
                        className="flex items-center gap-3 rounded-[20px] px-4 py-3.5 text-left active:opacity-80"
                        style={{
                            background: SURFACE.panel,
                            boxShadow: table.custom
                                ? `${CARD_SHADOW}, inset 0 0 0 1px rgba(240,212,138,0.30)`
                                : `${CARD_SHADOW}, inset 0 2px 0 rgba(255,255,255,0.05)`,
                        }}
                    >
                        <div
                            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px]"
                            style={{
                                background: SURFACE.sunken,
                                boxShadow: `inset 0 0 0 1px ${table.custom ? 'rgba(240,212,138,0.35)' : SURFACE.hair}`,
                            }}
                        >
                            <Users className="h-[20px] w-[20px]" strokeWidth={2.2} style={{ color: table.custom ? GOLD.mid : GOLD.top }} />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[17px] font-bold text-white">{table.name}</span>
                                {table.custom && (
                                    <span
                                        className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-extrabold uppercase tracking-wider"
                                        style={{ background: 'rgba(240,212,138,0.16)', color: GOLD.top, boxShadow: 'inset 0 0 0 1px rgba(240,212,138,0.35)' }}
                                    >
                                        {t('holdem.playerTable', 'Player')}
                                    </span>
                                )}
                            </div>
                            <span className="truncate text-[13px] font-semibold text-white/55">
                                {t('holdem.blindsLine', '{sb} / {bb} blinds', { sb: fmtChips(table.sb), bb: fmtChips(table.bb) })}
                            </span>
                            <span className="truncate text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                {t('holdem.buyInRange', 'Buy in {min} to {max}', { min: fmtChips(table.minBuyIn), max: fmtChips(table.maxBuyIn) })}
                            </span>
                            {table.custom && table.ownerName !== null && (
                                <span className="truncate text-[12px] font-semibold" style={{ color: 'rgba(240,212,138,0.72)' }}>
                                    {t('holdem.openedBy', 'Opened by {name}', { name: table.ownerName })}
                                </span>
                            )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                            <span className="text-[14px] font-extrabold tabular-nums" style={{ color: table.seated > 0 ? GOLD.top : SEAT.dim }}>
                                {table.seated}/6
                            </span>
                            <span className="text-[11px] font-semibold" style={{ color: table.playing ? TABLE.win : 'rgba(255,255,255,0.4)' }}>
                                {table.playing ? t('holdem.live', 'Live') : t('holdem.open', 'Open')}
                            </span>
                        </div>
                        <ChevronRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} style={{ color: 'rgba(255,255,255,0.35)' }} />
                    </button>
                ))}
            </div>
        </Scroller>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="mt-4">
            <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-bold uppercase tracking-wider text-white/45">{label}</span>
                {hint !== undefined && (
                    <span className="text-[13px] font-extrabold tabular-nums" style={{ color: GOLD.top }}>{hint}</span>
                )}
            </div>
            {children}
        </div>
    );
}

function Pills({ options, value, onPick }: { options: { key: number; label: string }[]; value: number; onPick: (v: number) => void }) {
    return (
        <div className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto">
            {options.map(opt => {
                const on = opt.key === value;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => onPick(opt.key)}
                        className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold tabular-nums active:opacity-70"
                        style={on
                            ? { background: GOLD_FRAME, color: FELT.bot, boxShadow: `inset 0 1px 0 ${GOLD.hi}` }
                            : { background: SURFACE.soft, color: 'rgba(255,255,255,0.75)', boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

function CreateSheet({ limits, onClose, onCreate }: {
    limits:   HoldemCreateLimits;
    onClose:  () => void;
    onCreate: (opts: HoldemCreateOpts) => void;
}) {
    const blinds = limits.blinds.length > 0 ? limits.blinds : [25];
    const [name, setName] = useSessionState<string>('casino:holdemNewName', '');
    const [sbPick, setSb] = useSessionState<number>('casino:holdemNewSb', blinds[Math.min(1, blinds.length - 1)]);
    const [ratioPick, setRatio] = useSessionState<number>('casino:holdemNewRatio', 2);
    const [minPick, setMinBB] = useSessionState<number>('casino:holdemNewMinBB', limits.minBuyInBB * 2);
    const [maxPick, setMaxBB] = useSessionState<number>('casino:holdemNewMaxBB', limits.minBuyInBB * 6);

    const ratios: number[] = [];
    for (let r = 2; r <= Math.max(2, limits.bbRatioMax); r++) ratios.push(r);

    const sb = blinds.includes(sbPick) ? sbPick : blinds[0];
    const ratio = ratios.includes(ratioPick) ? ratioPick : 2;
    const bb = sb * ratio;

    const minBB = Math.max(limits.minBuyInBB, Math.min(limits.maxBuyInBB, minPick));
    const maxBB = Math.max(minBB, Math.min(limits.maxBuyInBB, maxPick));
    const step = Math.max(1, Math.round(limits.minBuyInBB / 4));

    return (
        <Sheet onClose={onClose} fit="content" forceDark className="bg-[#0A472C] text-white">
            {api => (
                <div className="flex flex-col px-5 pb-2 pt-1">
                    <h2 className="text-center text-[20px] font-extrabold tracking-tight text-white">{t('holdem.newTable', 'New table')}</h2>
                    <div className="mt-1 text-center text-[13px] font-semibold text-white/55">
                        {t('holdem.newTableSub', 'It closes on its own once everyone has stood up.')}
                    </div>

                    <Field label={t('holdem.tableName', 'Name')}>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={limits.nameMax}
                            spellCheck={false}
                            placeholder={t('holdem.tableNamePlaceholder', 'Back room')}
                            className="mt-1.5 w-full rounded-[14px] px-3.5 py-3 text-[16px] font-semibold text-white outline-none placeholder:text-white/30"
                            style={{ background: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                        />
                    </Field>

                    <Field
                        label={t('holdem.smallBlind', 'Small blind')}
                        hint={t('holdem.blindsLine', '{sb} / {bb} blinds', { sb: fmtChips(sb), bb: fmtChips(bb) })}
                    >
                        <Pills options={blinds.map(v => ({ key: v, label: fmtChips(v) }))} value={sb} onPick={setSb} />
                    </Field>

                    <Field label={t('holdem.bigBlind', 'Big blind')} hint={fmtChips(bb)}>
                        <Pills options={ratios.map(r => ({ key: r, label: `${r}x` }))} value={ratio} onPick={setRatio} />
                    </Field>

                    <Field label={t('holdem.minBuyIn', 'Min buy in')} hint={t('holdem.bbCount', '{n} chips ({bb} BB)', { n: fmtChips(minBB * bb), bb: minBB })}>
                        <Slider
                            value={minBB}
                            min={limits.minBuyInBB}
                            max={limits.maxBuyInBB}
                            step={step}
                            onChange={setMinBB}
                            ariaLabel={t('holdem.minBuyIn', 'Min buy in')}
                            className="mt-2"
                        />
                    </Field>

                    <Field label={t('holdem.maxBuyIn', 'Max buy in')} hint={t('holdem.bbCount', '{n} chips ({bb} BB)', { n: fmtChips(maxBB * bb), bb: maxBB })}>
                        <Slider
                            value={maxBB}
                            min={minBB}
                            max={limits.maxBuyInBB}
                            step={step}
                            onChange={setMaxBB}
                            ariaLabel={t('holdem.maxBuyIn', 'Max buy in')}
                            className="mt-2"
                        />
                    </Field>

                    <button
                        type="button"
                        onClick={() => {
                            onCreate({ name: name.trim(), sb, bb, minBuyIn: minBB * bb, maxBuyIn: maxBB * bb });
                            api.close();
                        }}
                        className="mt-5 w-full rounded-[16px] py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                        style={{ background: GOLD_FRAME, color: FELT.bot, boxShadow: `inset 0 1px 0 ${GOLD.hi}`, transition: 'transform 0.08s' }}
                    >
                        {t('holdem.openTable', 'Open table')}
                    </button>
                </div>
            )}
        </Sheet>
    );
}

function BuyInSheet({ seat, chips, min, max, onCashier, onClose, onConfirm }: {
    seat:      number;
    chips:     number;
    min:       number;
    max:       number;
    onCashier: () => void;
    onClose:   () => void;
    onConfirm: (amount: number) => void;
}) {
    const ceiling = Math.min(max, chips);
    const [amount, setAmount] = useSessionState<number>('casino:holdemBuyIn', Math.min(ceiling, Math.max(min, min * 2)));
    const short = chips < min;
    const value = Math.max(min, Math.min(ceiling, amount));

    return (
        <Sheet onClose={onClose} fit="content" forceDark className="bg-[#0A472C] text-white">
            {api => (
                <div className="flex flex-col px-5 pb-2 pt-1">
                    <h2 className="text-center text-[20px] font-extrabold tracking-tight text-white">{t('holdem.buyIn', 'Buy in')}</h2>
                    <div className="mt-1 text-center text-[13px] font-semibold text-white/55">
                        {t('holdem.seatNumber', 'Seat {n}', { n: seat })}
                    </div>

                    {short ? (
                        <>
                            <div className="mt-5 text-center text-[15px] font-semibold text-white/80">
                                {t('holdem.shortBuyIn', 'The minimum buy in here is {n} chips.', { n: fmtChips(min) })}
                            </div>
                            <button
                                type="button"
                                onClick={onCashier}
                                className="mt-4 w-full rounded-[16px] py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                                style={{ background: GOLD_FRAME, color: FELT.bot, boxShadow: `inset 0 1px 0 ${GOLD.hi}`, transition: 'transform 0.08s' }}
                            >
                                {t('holdem.buyChips', 'Buy chips')}
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="mt-4 text-center text-[30px] font-black tabular-nums" style={{ color: GOLD.top }}>{fmtChips(value)}</div>
                            <Slider
                                value={value}
                                min={min}
                                max={ceiling}
                                step={Math.max(1, Math.round(min / 10))}
                                onChange={setAmount}
                                ariaLabel={t('holdem.buyIn', 'Buy in')}
                                className="mt-2"
                            />
                            <div className="mt-1 flex gap-2">
                                {[min, Math.round((min + ceiling) / 2), ceiling].map((step, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setAmount(step)}
                                        className="flex-1 rounded-full py-2 text-[13px] font-bold text-white/80 active:opacity-70"
                                        style={{ background: SURFACE.soft, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                                    >
                                        {fmtChips(step)}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => { onConfirm(value); api.close(); }}
                                className="mt-4 w-full rounded-[16px] py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                                style={{ background: GOLD_FRAME, color: FELT.bot, boxShadow: `inset 0 1px 0 ${GOLD.hi}`, transition: 'transform 0.08s' }}
                            >
                                {t('holdem.sit', 'Sit')}
                            </button>
                        </>
                    )}
                </div>
            )}
        </Sheet>
    );
}
