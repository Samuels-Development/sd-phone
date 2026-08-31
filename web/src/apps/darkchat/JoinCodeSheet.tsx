import { useState } from 'react';

import { t } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import { SheetAction, SheetField, SheetHeader } from './SheetForm';

export function JoinCodeSheet({ onClose, onJoin, error }: {
    onClose: () => void;
    onJoin:  (code: string) => void;
    error?:  string;
}) {
    const [code, setCode] = useState('');
    const canGo = code.trim().length >= 4;
    function go() { if (canGo) onJoin(code.trim().toUpperCase()); }

    return (
        <Sheet onClose={onClose} fit="content" forceDark durationMs={240} className="bg-[#1c1c1e] text-white">
            {({ close }) => (
                <>
                    <SheetHeader
                        title={t('darkchat.joinARoom', 'Join a room')}
                        onCancel={close}
                        right={<SheetAction label={t('darkchat.join', 'Join')} onClick={go} disabled={!canGo} />}
                    />
                    <SheetField
                        label={t('darkchat.roomCodeField', 'Room code')}
                        hint={t('darkchat.askForCode', "Ask the room's creator for the 6-character code.")}
                        error={error}
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                        onKeyDown={e => { if (e.key === 'Enter') go(); }}
                        placeholder={t('darkchat.enterCode', 'ENTER CODE')}
                        inputClassName="w-full bg-transparent px-4 py-3 text-[19px] font-semibold tracking-[0.3em] text-white placeholder-white/25 outline-none"
                    />
                </>
            )}
        </Sheet>
    );
}
