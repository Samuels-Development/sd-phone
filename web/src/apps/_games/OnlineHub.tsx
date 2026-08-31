import { useState } from 'react';
import { RefreshCw, User } from 'lucide-react';

import { formatMoney } from '@/lib/money';
import { t } from '@/i18n';
import type { LobbyListItem, PendingInvite, Side } from './onlineApi';

interface OnlineHubProps {
    lobbies:     LobbyListItem[];
    incoming:    PendingInvite | null;
    error:       string | null;
    accent:      string;
    sideOptions: { id: Side; label: string }[];
    wagered?:    boolean;
    chooseSide?: boolean;
    currency?:   'bank' | 'chips';
    onCreate:  (isPublic: boolean, side: Side, wager: number) => void;
    onJoin:    (id: string) => void;
    onAccept:  () => void;
    onDecline: () => void;
    onRefresh: () => void;
}

const money = (n: number) => formatMoney(n, { whole: true });

export function OnlineHub({ lobbies, incoming, error, accent, sideOptions, wagered = true, chooseSide = true, currency = 'bank', onCreate, onJoin, onAccept, onDecline, onRefresh }: OnlineHubProps) {
    const [isPublic, setIsPublic] = useState(true);
    const [side,     setSide]     = useState<Side>(sideOptions[0].id);
    const [wager,    setWager]    = useState('');
    const bet = Math.max(0, Math.floor(Number(wager.replace(/\D/g, '')) || 0));
    const fmtAmt = (n: number) => (currency === 'chips' ? t('games.chipsAmount', '{n} chips', { n: n.toLocaleString('en-US') }) : money(n));

    return (
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}>
            {incoming && (
                <div className="rounded-[18px] p-4" style={{ background: `${accent}29`, boxShadow: `inset 0 0 0 1px ${accent}8c` }}>
                    <div className="text-[16px] font-bold text-white">{t('games.invitedYou', '{name} invited you', { name: incoming.fromName })}</div>
                    <p className="mb-3 mt-0.5 text-[13px] text-white/60">{t('games.joinTheirLobby', 'Join their lobby to play.')}</p>
                    <div className="flex gap-2.5">
                        <button type="button" onClick={onDecline} className="flex-1 rounded-[12px] py-2.5 text-[15px] font-bold text-white active:opacity-70" style={{ background: 'rgba(255,255,255,0.14)' }}>{t('games.decline', 'Decline')}</button>
                        <button type="button" onClick={onAccept} className="flex-1 rounded-[12px] py-2.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: accent }}>{t('games.join', 'Join')}</button>
                    </div>
                </div>
            )}

            <div className="rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="mb-2 text-[15px] font-bold text-white">{t('games.createALobby', 'Create a lobby')}</div>

                <Label>{t('games.visibility', 'Visibility')}</Label>
                <Segmented value={isPublic ? 'public' : 'private'} onChange={v => setIsPublic(v === 'public')} options={[{ id: 'public', label: t('games.public', 'Public') }, { id: 'private', label: t('games.private', 'Private') }]} />

                {chooseSide && (
                    <>
                        <div className="h-2.5" />
                        <Label>{t('games.youPlayAs', 'You play as')}</Label>
                        <Segmented value={side} onChange={setSide} options={sideOptions} />
                    </>
                )}

                {wagered && (
                    <>
                        <div className="h-2.5" />
                        <Label>{currency === 'chips' ? t('games.wagerChipsOptional', 'Wager (chips), optional') : t('games.wagerBankOptional', 'Wager (bank), optional')}</Label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-white/40">{currency === 'chips' ? '◆' : '$'}</span>
                            <input
                                value={wager}
                                onChange={e => setWager(e.target.value)}
                                inputMode="numeric"
                                placeholder={t('games.wagerPlaceholder', '0 for a friendly game')}
                                className="w-full rounded-[12px] bg-black/30 py-2.5 pl-8 pr-4 text-[17px] text-white outline-none placeholder-white/30"
                            />
                        </div>
                        <div className="mt-1.5 h-4 text-[12px] font-semibold text-[#9CCC65]">{bet > 0 ? t('games.winnerTakes', 'Winner takes {amount}', { amount: fmtAmt(bet * 2) }) : ''}</div>
                    </>
                )}

                <button type="button" onClick={() => onCreate(isPublic, side, wagered ? bet : 0)} className="mt-3.5 w-full rounded-[14px] py-3 text-center text-[16px] font-bold text-white active:opacity-80" style={{ background: accent }}>
                    {t('games.createLobby', 'Create Lobby')}
                </button>
                {error && <div className="mt-2 text-[13px] font-medium text-[#FF8A80]">{error}</div>}
            </div>

            <div className="rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[15px] font-bold text-white">{t('games.publicLobbies', 'Public lobbies')}</span>
                    <button type="button" onClick={onRefresh} aria-label={t('games.refresh', 'Refresh')} className="text-white/55 active:opacity-60">
                        <RefreshCw className="h-[16px] w-[16px]" strokeWidth={2.4} />
                    </button>
                </div>
                {lobbies.length === 0 ? (
                    <div className="px-1 py-2 text-[13px] text-white/35">{t('games.noPublicLobbies', 'No public lobbies right now. Create one above.')}</div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {lobbies.map(lb => (
                            <div key={lb.id} className="flex items-center justify-between rounded-[11px] px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.22)' }}>
                                <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-white">
                                    <User className="h-[16px] w-[16px] shrink-0 text-white/50" strokeWidth={2.2} />
                                    <span className="truncate">{t('games.hostsLobby', '{name}’s lobby', { name: lb.host })}</span>
                                    {lb.wager > 0 && <span className="shrink-0 rounded-full px-2 py-[2px] text-[11px] font-extrabold text-white" style={{ background: accent }}>{fmtAmt(lb.wager)}</span>}
                                </span>
                                <button type="button" onClick={() => onJoin(lb.id)} className="shrink-0 rounded-full px-4 py-1.5 text-[14px] font-bold text-white active:opacity-80" style={{ background: accent }}>{t('games.join', 'Join')}</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/45">{children}</div>;
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
    return (
        <div className="flex rounded-[11px] p-0.5" style={{ background: 'rgba(0,0,0,0.28)' }}>
            {options.map(o => {
                const active = value === o.id;
                return (
                    <button key={o.id} type="button" onClick={() => onChange(o.id)} className="flex-1 rounded-[9px] py-1.5 text-[14px] font-semibold transition" style={{ color: active ? '#211F1D' : 'rgba(255,255,255,0.7)', background: active ? '#fff' : 'transparent' }}>
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
