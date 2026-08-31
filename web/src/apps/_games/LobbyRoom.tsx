import { useState } from 'react';
import { Check, Coins, Crown, Loader2, Lock, TriangleAlert, X } from 'lucide-react';

import { formatMoney } from '@/lib/money';
import { t } from '@/i18n';
import type { LobbyMember, LobbyState, Side } from './onlineApi';

const money = (n: number) => formatMoney(n, { whole: true });

interface LobbyRoomProps {
    lobby:       LobbyState;
    inviteError: string | null;
    accent:      string;
    sideLabel:   (side: Side) => string;
    wagered?:    boolean;
    currency?:   'bank' | 'chips';
    onInvite:    (target: string) => void;
    onStart:     () => void;
    onLeave:     () => void;
    onKick:      () => void;
    onSetWager:  (wager: number) => void;
    onSetReady:  (ready: boolean) => void;
}

export function LobbyRoom({ lobby, inviteError, accent, sideLabel, wagered = true, currency = 'bank', onInvite, onStart, onLeave, onKick, onSetWager, onSetReady }: LobbyRoomProps) {
    const fmtAmt = (n: number) => (currency === 'chips' ? t('games.chipsAmount', '{n} chips', { n: n.toLocaleString('en-US') }) : money(n));
    const [target, setTarget] = useState('');
    const [wagerInput, setWagerInput] = useState(lobby.wager ? String(lobby.wager) : '');
    const id = target.replace(/\D/g, '');
    const seatOpen = lobby.members.length < 2;
    const parsedWager = Math.max(0, Math.floor(Number(wagerInput.replace(/\D/g, '')) || 0));

    const opponent = lobby.members.find(m => !m.host);
    const oppReady = opponent?.ready ?? false;
    const me = lobby.members.find(m => m.you);
    const youReady = me?.ready ?? false;
    const youCantAfford = lobby.wager > 0 && !!me && !me.canAfford;

    const broke = lobby.wager > 0 ? lobby.members.filter(m => !m.canAfford) : [];
    const brokeMsg =
        broke.length === 0   ? null
        : broke.length > 1   ? t('games.bothNeedMoney', 'Both players need enough money to cover the wager')
        : broke[0].you       ? t('games.youCannotAffordWager', 'You don’t have enough money to wager')
        :                      t('games.playerCannotAffordWager', '{name} doesn’t have enough money to wager', { name: broke[0].name });

    return (
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
            {lobby.wager > 0 && (
                <div className="mb-3 flex flex-col items-center gap-0.5 rounded-[14px] py-2.5 text-white" style={{ background: `${accent}38`, boxShadow: `inset 0 0 0 1px ${accent}8c` }}>
                    <span className="flex items-center gap-2 text-[15px] font-extrabold">
                        <Coins className="h-[17px] w-[17px] text-[#FFD54F]" strokeWidth={2.3} />
                        {t('games.winnerTakes', 'Winner takes {amount}', { amount: fmtAmt(lobby.wager * 2) })}
                    </span>
                    <span className="text-[12px] font-medium text-white/55">{currency === 'chips'
                        ? t('games.wagerTakenChips', '{amount} will be taken from your chip wallet when the game starts', { amount: fmtAmt(lobby.wager) })
                        : t('games.wagerTakenBank', '{amount} will be taken from your bank when the game starts', { amount: fmtAmt(lobby.wager) })}</span>
                </div>
            )}
            <div className="rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">{lobby.public ? t('games.publicLobby', 'Public lobby') : t('games.privateLobby', 'Private lobby')}</div>
                <div className="flex flex-col gap-2">
                    {lobby.members.map((m, i) => <MemberRow key={i} m={m} sideLabel={sideLabel} canKick={lobby.isHost && !m.host} onKick={onKick} />)}
                    {seatOpen && (
                        <div className="flex min-h-[54px] items-center gap-2 rounded-[11px] px-3 py-3 text-[15px] text-white/35" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <Loader2 className="h-[16px] w-[16px] animate-spin text-white/30" strokeWidth={2.2} />
                            {t('games.waitingForOpponent', 'Waiting for an opponent…')}
                        </div>
                    )}
                </div>
            </div>

            {wagered && lobby.isHost && (
                <div className="mt-3 rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                        {currency === 'chips' ? t('games.wagerChipsOptional', 'Wager (chips), optional') : t('games.wagerBankOptional', 'Wager (bank), optional')}
                        {oppReady && <span className="flex items-center gap-1 text-[#FFD54F]"><Lock className="h-[11px] w-[11px]" strokeWidth={2.6} />{t('games.locked', 'Locked')}</span>}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-white/40">$</span>
                            <input
                                value={wagerInput}
                                onChange={e => setWagerInput(e.target.value)}
                                disabled={oppReady}
                                inputMode="numeric"
                                placeholder={t('games.wagerPlaceholder', '0 for a friendly game')}
                                className="w-full rounded-[12px] bg-black/30 py-2.5 pl-8 pr-4 text-[17px] text-white outline-none placeholder-white/30 disabled:opacity-50"
                            />
                        </div>
                        <button type="button" disabled={oppReady || parsedWager === lobby.wager} onClick={() => onSetWager(parsedWager)} className="shrink-0 rounded-[12px] px-5 text-[15px] font-bold text-white active:opacity-80 disabled:opacity-40" style={{ background: accent }}>{t('games.update', 'Update')}</button>
                    </div>
                    {oppReady && <div className="mt-1.5 text-[12px] font-medium text-white/45">{t('games.wagerLockedNote', 'Your opponent is ready. The wager is locked in.')}</div>}
                </div>
            )}

            {lobby.isHost && seatOpen && (
                <div className="mt-3 rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/45">{t('games.inviteByServerId', 'Invite by server ID')}</div>
                    <div className="flex gap-2">
                        <input
                            value={target}
                            onChange={e => setTarget(e.target.value)}
                            inputMode="numeric"
                            placeholder={t('games.serverIdPlaceholder', 'e.g. 14')}
                            className="min-w-0 flex-1 rounded-[12px] bg-black/30 px-4 py-2.5 text-[17px] text-white outline-none placeholder-white/30"
                        />
                        <button type="button" disabled={id.length === 0} onClick={() => onInvite(id)} className="shrink-0 rounded-[12px] px-5 text-[15px] font-bold text-white active:opacity-80 disabled:opacity-40" style={{ background: accent }}>{t('games.invite', 'Invite')}</button>
                    </div>
                    {inviteError && <div className="mt-2 text-[13px] font-medium text-[#FF8A80]">{inviteError}</div>}
                </div>
            )}

            <div className="mt-auto flex flex-col gap-2.5">
                {brokeMsg && (
                    <div className="flex items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-center text-[13px] font-semibold text-[#FF8A80]" style={{ background: 'rgba(255,138,128,0.12)' }}>
                        <TriangleAlert className="h-[15px] w-[15px] shrink-0" strokeWidth={2.4} />
                        {brokeMsg}
                    </div>
                )}
                {lobby.isHost ? (
                    <>
                        {!seatOpen && !brokeMsg && !oppReady && (
                            <div className="flex items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-center text-[13px] font-semibold text-white/55" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <Loader2 className="h-[15px] w-[15px] animate-spin text-white/40" strokeWidth={2.2} />
                                {t('games.waitingForReady', 'Waiting for {name} to ready up', { name: opponent?.name ?? t('games.yourOpponent', 'your opponent') })}
                            </div>
                        )}
                        <button type="button" disabled={!lobby.canStart} onClick={onStart} className="w-full rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-80 disabled:opacity-40" style={{ background: accent }}>
                            {t('games.startGame', 'Start Game')}
                        </button>
                    </>
                ) : (
                    <>
                        {youReady && (
                            <div className="flex items-center justify-center gap-2 rounded-[12px] px-3 py-2.5 text-center text-[13px] font-semibold text-white/55" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <Loader2 className="h-[15px] w-[15px] animate-spin text-white/40" strokeWidth={2.2} />
                                {t('games.waitingForHostStart', 'Waiting for {name} to start…', { name: lobby.host })}
                            </div>
                        )}
                        <button type="button" disabled={youCantAfford} onClick={() => onSetReady(!youReady)} className="w-full rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-80 disabled:opacity-40" style={{ background: youReady ? 'rgba(255,255,255,0.16)' : accent }}>
                            {youReady ? t('games.readyTapToCancel', 'Ready, tap to cancel') : t('games.readyUp', 'Ready Up')}
                        </button>
                    </>
                )}
                <button type="button" onClick={onLeave} className="w-full rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-70" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    {lobby.isHost ? t('games.disbandLobby', 'Disband Lobby') : t('games.leaveLobby', 'Leave Lobby')}
                </button>
            </div>
        </div>
    );
}

function MemberRow({ m, sideLabel, canKick, onKick }: { m: LobbyMember; sideLabel: (side: Side) => string; canKick: boolean; onKick: () => void }) {
    if (!m.returned) {
        return (
            <div className="flex min-h-[54px] items-center gap-2 rounded-[11px] px-3 py-3 text-[15px] text-white/40" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <Loader2 className="h-[16px] w-[16px] animate-spin text-white/30" strokeWidth={2.2} />
                <span className="truncate">{t('games.waitingForRejoin', 'Waiting for {name} to rejoin…', { name: m.name })}</span>
            </div>
        );
    }
    return (
        <div className="flex min-h-[54px] items-center justify-between rounded-[11px] px-3 py-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <span className="flex min-w-0 items-center gap-2 text-[16px] font-semibold text-white">
                {m.host && <Crown className="h-[16px] w-[16px] shrink-0 text-[#FFD54F]" strokeWidth={2.2} />}
                <span className="truncate">{m.name}</span>
                {m.you && <span className="shrink-0 text-[13px] font-medium text-white/45">{t('games.youSuffix', '(you)')}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2.5">
                {!m.host && m.ready && <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: '#3BA55D' }} aria-label={t('games.ready', 'Ready')}><Check className="h-[13px] w-[13px]" strokeWidth={3} /></span>}
                {m.canAfford
                    ? <span className="text-[13px] font-semibold text-white/60">{sideLabel(m.color)}</span>
                    : <span className="flex items-center gap-1 text-[13px] font-bold text-[#FF8A80]"><TriangleAlert className="h-[14px] w-[14px]" strokeWidth={2.4} />{t('games.cannotCoverWager', 'Can’t cover wager')}</span>}
                {canKick && (
                    <button type="button" onClick={onKick} aria-label={t('games.removeMember', 'Remove {name}', { name: m.name })} className="flex h-7 w-7 items-center justify-center rounded-full text-white/65 active:opacity-60" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <X className="h-[15px] w-[15px]" strokeWidth={2.6} />
                    </button>
                )}
            </span>
        </div>
    );
}
