import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { MailGlyph, MessageGlyph, PhoneGlyph } from '@/shell/AppGlyphs';

function Tile({ color, label, onClick, children }: { color: string; label: string; onClick?: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-[13px] text-white shadow-sm active:opacity-75"
            style={{ background: color }}
        >
            {children}
        </button>
    );
}

export function ContactActions({ onMessage, onCall, onEmail, onDelete, subject = t('common.poster', 'poster'), className }: {
    onMessage?: () => void;
    onCall?:    () => void;
    onEmail?:   () => void;
    onDelete?:  () => void;
    subject?:   string;
    className?: string;
}) {
    return (
        <div className={`flex items-center justify-end gap-2.5 ${className ?? ''}`}>
            {onMessage && (
                <Tile color="#34C759" label={t('common.messageSubject', 'Message {subject}', { subject })} onClick={onMessage}>
                    <MessageGlyph className="h-[25px] w-[25px]" />
                </Tile>
            )}
            {onCall && device.calls && (
                <Tile color="#0A84FF" label={t('common.callSubject', 'Call {subject}', { subject })} onClick={onCall}>
                    <PhoneGlyph className="h-[21px] w-[21px]" />
                </Tile>
            )}
            {onEmail && (
                <Tile color="#5E5CE6" label={t('common.emailSubject', 'Email {subject}', { subject })} onClick={onEmail}>
                    <MailGlyph className="h-[23px] w-[23px]" />
                </Tile>
            )}
            {onDelete && (
                <Tile color="#FF3B30" label={t('common.delete', 'Delete')} onClick={onDelete}>
                    <Trash2 className="h-[22px] w-[22px]" strokeWidth={2.2} />
                </Tile>
            )}
        </div>
    );
}
