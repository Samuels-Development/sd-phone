import { MessageCircle, Reply } from 'lucide-react';

import { t } from '@/i18n';
import { CHERRY, msgPreview, type Match } from './data';

function Avatar({ match, size, dot }: { match: Match; size: number; dot?: boolean }) {
    return (
        <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
            {match.partner.photo ? (
                <img src={match.partner.photo} alt={match.partner.name} draggable={false} className="h-full w-full rounded-full object-cover" />
            ) : (
                <span
                    className="flex h-full w-full items-center justify-center rounded-full font-bold text-white"
                    style={{ background: CHERRY.pink, fontSize: size * 0.36 }}
                >
                    {match.partner.name.slice(0, 1).toUpperCase()}
                </span>
            )}
            {dot && (
                <span
                    className="absolute rounded-full"
                    style={{ width: 18, height: 18, right: -7, top: '50%', transform: 'translateY(-50%)', background: CHERRY.pink, border: '3px solid #fff', boxSizing: 'content-box' }}
                />
            )}
        </span>
    );
}

export function Matches({ matches, seen, onOpen, onDiscover }: {
    matches:    Match[];
    seen:       Record<string, number>;
    onOpen:     (id: string) => void;
    onDiscover: () => void;
}) {
    const fresh    = matches.filter(m => m.messages.length === 0);
    const threads  = matches.filter(m => m.messages.length > 0);

    if (matches.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center">
                <MessageCircle className="h-[72px] w-[72px] text-black/30" strokeWidth={1.5} />
                <p className="mt-4 text-[21px] font-semibold text-black/85">{t('cherry.noMatchesYet', 'No matches yet')}</p>
                <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/65">{t('cherry.noMatchesBody', 'People you match with show up here. Keep swiping to find someone.')}</p>
                <button type="button" onClick={onDiscover} className="mt-6 rounded-full px-10 py-3.5 text-[19px] font-semibold text-white active:opacity-80" style={{ background: CHERRY.pink }}>
                    {t('cherry.discover', 'Discover')}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-6">
            {fresh.length > 0 && (
                <>
                    <p className="px-5 pb-3.5 pt-4 text-[19px] font-bold uppercase tracking-wide" style={{ color: CHERRY.pink }}>
                        {t('cherry.newMatches', 'New Matches')}
                    </p>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar px-5">
                        {fresh.map(m => (
                            <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 active:opacity-70">
                                <Avatar match={m} size={76} />
                                <span className="max-w-full truncate text-[20px] font-semibold leading-snug text-black">{m.partner.name}</span>
                            </button>
                        ))}
                    </div>
                    <div className="mx-5 mt-4 h-px bg-black/[0.08]" />
                </>
            )}

            {threads.length > 0 && (
                <>
                    <p className={`px-5 pb-3.5 text-[19px] font-bold uppercase tracking-wide ${fresh.length > 0 ? 'pt-5' : 'pt-4'}`} style={{ color: CHERRY.pink }}>
                        {t('cherry.messages', 'Messages')}
                    </p>
                    <div className="flex flex-col gap-1.5 px-3">
                        {threads.map(m => {
                            const last   = m.messages[m.messages.length - 1];
                            const mine   = last.from === 'me';
                            const unread = !mine && last.ts > (seen[m.id] ?? 0);
                            return (
                                <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="flex items-center gap-4 rounded-[16px] px-2.5 py-2 text-left active:bg-black/5">
                                    <Avatar match={m} size={76} dot={unread} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[20px] font-semibold leading-snug text-black">{m.partner.name}</p>
                                        <p className={`mt-0.5 flex items-center gap-1.5 truncate text-[17px] leading-snug ${unread ? 'font-semibold text-black/90' : 'text-black/70'}`}>
                                            {mine && <Reply className="h-[18px] w-[18px] shrink-0 text-black/55" strokeWidth={2.2} />}
                                            <span className="truncate">{msgPreview(last)}</span>
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
