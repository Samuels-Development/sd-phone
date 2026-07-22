import { useState } from 'react';
import { Delete } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useKeypadInput } from '@/hooks/useKeypadInput';
import { useTheme } from '@/stores/themeStore';
import { ListGroup } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { NavBar } from '@/ui/NavBar';


type Flow = { mode: 'set' | 'change' | 'off'; enableFaceAfter?: boolean };

export function FaceUnlockPage({ onBack }: { onBack: () => void }) {
    const { passcode, faceId, setPasscode, setFaceId } = useTheme('passcode', 'faceId', 'setPasscode', 'setFaceId');
    const passcodeEnabled = passcode !== null;
    const [flow, setFlow] = useState<Flow | null>(null);

    const subNode = flow ? (
        <PinFlow
            mode={flow.mode}
            current={passcode ?? ''}
            onComplete={(newPin) => {
                if (flow.mode === 'off') {
                    setPasscode(null);
                } else {
                    setPasscode(newPin);
                    if (flow.enableFaceAfter) setFaceId(true);
                }
                setFlow(null);
            }}
            onCancel={() => setFlow(null)}
        />
    ) : null;

    function toggleFace() {
        if (faceId)               setFaceId(false);
        else if (passcodeEnabled) setFaceId(true);
        else                      setFlow({ mode: 'set', enableFaceAfter: true });
    }

    return (
        <SubPage title={t('settings.faceUnlockPasscode', 'Face Unlock & Passcode')} backLabel={t('settings.settings', 'Settings')} onBack={onBack} sub={subNode}>

            <ListGroup header={t('settings.faceUnlock', 'Face Unlock')}>
                <ActionRow
                    label={faceId ? t('settings.disableFaceUnlock', 'Disable Face Unlock') : t('settings.enableFaceUnlock', 'Enable Face Unlock')}
                    color={faceId ? 'red' : 'default'}
                    onPress={toggleFace}
                />
            </ListGroup>

            <ListGroup header={t('settings.pinCode', 'Pin Code')}>
                {passcodeEnabled ? (
                    <>
                        <ActionRow
                            label={t('settings.turnPasscodeOff', 'Turn Passcode Off')}
                            color="red"
                            onPress={() => setFlow({ mode: 'off' })}
                            divider
                        />
                        <ActionRow
                            label={t('settings.changePasscode', 'Change Passcode')}
                            color="blue"
                            onPress={() => setFlow({ mode: 'change' })}
                        />
                    </>
                ) : (
                    <>
                        <ActionRow
                            label={t('settings.turnPasscodeOn', 'Turn Passcode On')}
                            color="blue"
                            onPress={() => setFlow({ mode: 'set' })}
                            divider
                        />
                        <ActionRow
                            label={t('settings.changePasscode', 'Change Passcode')}
                            color="disabled"
                        />
                    </>
                )}
            </ListGroup>

        </SubPage>
    );
}


type RowColor = 'default' | 'blue' | 'red' | 'disabled';

function ActionRow({
    label, color = 'default', divider, onPress,
}: {
    label: string; color?: RowColor; divider?: boolean; onPress?: () => void;
}) {
    const textClass =
        color === 'blue'     ? 'text-ios-blue'
        : color === 'red'    ? 'text-ios-red'
        : color === 'disabled' ? 'text-ios-gray'
        : 'text-black dark:text-white';

    return (
        <button
            type="button"
            onClick={color === 'disabled' ? undefined : onPress}
            disabled={color === 'disabled'}
            className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5 disabled:active:bg-transparent"
        >
            <span className={`text-[17px] font-normal ${textClass}`}>{label}</span>
            {divider && (
                <div
                    className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control"
                    style={{ left: 0, height: '0.5px' }}
                />
            )}
        </button>
    );
}


type FlowMode = 'set' | 'change' | 'off';
type FlowStep = 'old' | 'enter' | 'confirm';

function PinFlow({
    mode, current, onComplete, onCancel,
}: {
    mode: FlowMode; current: string; onComplete: (newPin: string) => void; onCancel: () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onCancel);
    const needsOld = mode === 'change' || mode === 'off';
    const [step,    setStep]    = useState<FlowStep>(needsOld ? 'old' : 'enter');
    const [pin,     setPin]     = useState('');
    const [first,   setFirst]   = useState('');
    const [error,   setError]   = useState('');

    const title =
        step === 'old'     ? (mode === 'off' ? t('settings.enterPasscode', 'Enter Passcode') : t('settings.enterOldPasscode', 'Enter Old Passcode'))
        : step === 'enter'   ? t('settings.enterNewPasscode', 'Enter New Passcode')
        : t('settings.reenterPasscode', 'Re-enter Passcode');

    const subtitle =
        step === 'old'
            ? (mode === 'off' ? t('settings.enterCurrentToDisable', 'Enter your current passcode to disable it.') : t('settings.enterCurrentPasscode', 'Enter your current passcode.'))
            : step === 'confirm'
            ? t('settings.reenterToConfirm', 'Re-enter your new passcode to confirm.')
            : t('settings.chooseFourDigit', 'Choose a 4-digit passcode.');

    function press(d: string) {
        if (pin.length >= 4) return;
        const next = pin + d;
        setPin(next);
        setError('');

        if (next.length === 4) {
            setTimeout(() => advance(next), 120);
        }
    }

    function del() { setPin(p => p.slice(0, -1)); setError(''); }

    useKeypadInput({
        onPress: press,
        onDelete: del,
        canDelete: pin.length > 0,
    });

    function advance(entered: string) {
        if (step === 'old') {
            if (entered !== current) {
                setError(t('settings.incorrectPasscode', 'Incorrect passcode. Try again.'));
                setPin('');
                return;
            }
            if (mode === 'off') { onComplete(''); return; }
            setPin(''); setStep('enter');
            return;
        }
        if (step === 'enter') {
            setFirst(entered);
            setPin('');
            setStep('confirm');
            return;
        }
        if (entered === first) {
            onComplete(entered);
        } else {
            setError(t('settings.passcodesNoMatch', 'Passcodes did not match. Try again.'));
            setPin('');
            setStep('enter');
            setFirst('');
        }
    }

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base"
            style={pageStyle}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.cancel', 'Cancel')}
                onBack={goBack}
                title={mode === 'off' ? t('settings.disablePasscode', 'Disable Passcode') : mode === 'change' ? t('settings.changePasscode', 'Change Passcode') : t('settings.setPasscode', 'Set Passcode')}
                hairline
            />

            <div className="flex flex-1 flex-col items-center justify-start pt-14 px-8">
                <p className="text-[17px] font-semibold text-black dark:text-white mb-1">{title}</p>
                <p className="text-[13px] text-ios-gray text-center mb-10">{subtitle}</p>

                <div className="flex gap-5 mb-4">
                    {[0, 1, 2, 3].map(i => (
                        <div
                            key={i}
                            className={`h-[14px] w-[14px] rounded-full border-2 transition-colors duration-150 ${
                                i < pin.length
                                    ? 'bg-black dark:bg-white border-black dark:border-white'
                                    : 'bg-transparent border-black/35 dark:border-white/35'
                            }`}
                        />
                    ))}
                </div>

                {error && (
                    <p className="text-[13px] text-ios-red text-center mb-4">{error}</p>
                )}

                <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-[300px]">
                    {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                        if (k === '') return <div key={i} />;
                        if (k === '⌫') {
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={del}
                                    className="flex items-center justify-center h-[72px] rounded-[14px] bg-white dark:bg-elevated active:bg-ios-gray5 dark:active:bg-[#3A3A3C] transition-colors shadow-sm"
                                >
                                    <Delete className="h-[22px] w-[22px] text-black dark:text-white" strokeWidth={1.75} />
                                </button>
                            );
                        }
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => press(k)}
                                className="flex flex-col items-center justify-center h-[72px] rounded-[14px] bg-white dark:bg-elevated active:bg-ios-gray5 dark:active:bg-[#3A3A3C] transition-colors shadow-sm"
                            >
                                <span className="text-[28px] font-light text-black dark:text-white leading-none">{k}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
