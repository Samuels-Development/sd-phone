import { isFiveM } from '@/core/nui';
import { ContactActions } from './ContactActions';
import { fmtPrice, type ClassifiedItem } from './types';

export function ListingCard({ item, subject, onOpen, onMessage, onCall, onEmail, onDelete }: {
    item:       ClassifiedItem;
    subject:    string;
    onOpen?:    () => void;
    onMessage?: () => void;
    onCall?:    () => void;
    onEmail?:   () => void;
    onDelete?:  () => void;
}) {
    const canMessage = !!item.number && !!onMessage;
    const canCall    = !!item.number && !!onCall;
    const canEmail   = !!item.email  && !!onEmail;
    const showActions = canMessage || canCall || canEmail || !!onDelete;
    return (
        <div
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen}
            // Space is the jump key in game, and this card activates itself rather than relying on
            // the native button behaviour App.tsx cancels, so it has to ignore Space for itself.
            onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || (e.key === ' ' && !isFiveM)) { e.preventDefault(); onOpen(); } } : undefined}
            className={`rounded-[16px] bg-[#e5e5e5] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:bg-surface dark:shadow-none dark:ring-white/[0.06] ${onOpen ? 'cursor-pointer transition-colors duration-150 hover:bg-[#dadada] active:bg-[#d2d2d2] dark:hover:bg-[#262628] dark:active:bg-[#2e2e30]' : ''}`}
        >
            <div className="block w-full text-left">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 truncate text-[21px] font-semibold text-black dark:text-white">{item.title}</h3>
                    {item.date && <span className="shrink-0 pt-[4px] text-[15px] font-medium text-ios-gray">{item.date}</span>}
                </div>

                <div className="mt-1.5 flex gap-3.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                        <p className="line-clamp-3 text-[18px] leading-snug text-black dark:text-white">{item.body}</p>
                        {item.price !== undefined && (
                            <div className="mt-2 text-[21px] font-bold text-black dark:text-white">{fmtPrice(item.price)}</div>
                        )}
                    </div>
                    {(() => {
                        const photos = item.images && item.images.length ? item.images : item.image ? [item.image] : [];
                        if (!photos.length) return null;
                        return (
                            <div className="relative h-[112px] w-[112px] shrink-0">
                                <img
                                    src={photos[0]}
                                    alt={item.title}
                                    className="h-full w-full rounded-[12px] object-cover"
                                    draggable={false}
                                />
                                {photos.length > 1 && (
                                    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[12px] font-semibold text-white">
                                        +{photos.length - 1}
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {showActions && (
                <ContactActions
                    subject={subject}
                    onMessage={canMessage ? onMessage : undefined}
                    onCall={canCall ? onCall : undefined}
                    onEmail={canEmail ? onEmail : undefined}
                    onDelete={onDelete}
                    className="mt-3.5"
                />
            )}
        </div>
    );
}
