import { useState } from 'react';
import type { ReactNode } from 'react';

import { device } from '@device';
import { AlertDialog } from '@/ui/AlertDialog';
import { requestOpenMail, requestOpenMessages } from '@/shell/deeplink';
import { fetchNui, isFiveM } from '@/core/nui';
import { formatPhone } from '@/apps/phone/data';
import { t } from '@/i18n';

export function useContactActions(): {
    message: (number: string, isSelf?: boolean) => void;
    call:    (number: string, isSelf?: boolean) => void;
    email:   (address: string, isSelf?: boolean) => void;
    dialog:  ReactNode;
} {
    const [dlg, setDlg] = useState<
        | { kind: 'confirm'; number: string }
        | { kind: 'notice'; title: string; message: string }
        | null
    >(null);

    function message(number: string, isSelf?: boolean) {
        if (isSelf) { setDlg({ kind: 'notice', title: t('classifieds.cantMessage', "Can't Message"), message: t('classifieds.cantMessageSelf', "You can't message yourself.") }); return; }
        const digits = (number ?? '').replace(/\D/g, '');
        if (digits) requestOpenMessages({ number: digits });
    }

    function call(number: string, isSelf?: boolean) {
        if (isSelf) { setDlg({ kind: 'notice', title: t('classifieds.cantCall', "Can't Call"), message: t('classifieds.cantCallSelf', "You can't call yourself.") }); return; }
        const digits = (number ?? '').replace(/\D/g, '');
        if (digits) setDlg({ kind: 'confirm', number: digits });
    }

    function email(address: string, isSelf?: boolean) {
        if (isSelf) { setDlg({ kind: 'notice', title: t('classifieds.cantEmail', "Can't Email"), message: t('classifieds.cantEmailSelf', "You can't email yourself.") }); return; }
        const to = (address ?? '').trim();
        if (to) requestOpenMail({ to });
    }

    let dialog: ReactNode = null;
    if (dlg?.kind === 'confirm') {
        dialog = (
            <AlertDialog
                title={t('classifieds.call', 'Call')}
                message={t('classifieds.callConfirm', 'Call {number}?', { number: formatPhone(dlg.number) })}
                cancelLabel={t('classifieds.cancel', 'Cancel')}
                confirmLabel={t('classifieds.call', 'Call')}
                onCancel={() => setDlg(null)}
                onConfirm={() => {
                    const num = dlg.number;
                    setDlg(null);
                    if (isFiveM && device.calls) void fetchNui('sd-phone:call:dial', { number: num });
                }}
            />
        );
    } else if (dlg?.kind === 'notice') {
        dialog = (
            <AlertDialog
                title={dlg.title}
                message={dlg.message}
                confirmLabel={t('classifieds.ok', 'OK')}
                hideCancel
                onCancel={() => setDlg(null)}
                onConfirm={() => setDlg(null)}
            />
        );
    }

    return { message, call, email, dialog };
}
