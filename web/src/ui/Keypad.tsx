import { Delete } from 'lucide-react';

import { useKeypadInput } from '@/hooks/useKeypadInput';
import { t } from '@/i18n';


const PAD_KEYS: { digit: string; letters: string }[] = [
    { digit: '1', letters: ''     }, { digit: '2', letters: 'ABC'  }, { digit: '3', letters: 'DEF'  },
    { digit: '4', letters: 'GHI'  }, { digit: '5', letters: 'JKL'  }, { digit: '6', letters: 'MNO'  },
    { digit: '7', letters: 'PQRS' }, { digit: '8', letters: 'TUV'  }, { digit: '9', letters: 'WXYZ' },
];

const KEY_CLS   = 'rounded-[14px] bg-[#f1f1f3] py-4 active:opacity-60 dark:bg-elevated';
const DIGIT_CLS = 'text-[34px] font-medium leading-none text-black/80 dark:text-white/90';
const SUB_CLS   = 'mt-1 min-h-[14px] text-[13px] font-semibold tracking-[0.14em] text-black/65 dark:text-white/75';

export function Keypad({ variant = 'pin', onPress, onDelete, canDelete = true, className = '' }: {
    variant?:    'phone' | 'pin' | 'digits' | 'decimal';
    onPress:     (digit: string) => void;
    onDelete?:   () => void;
    canDelete?:  boolean;
    className?:  string;
}) {
    const showLetters = variant === 'phone' || variant === 'pin';
    const zeroSub     = variant === 'phone' ? '+' : '';

    useKeypadInput({
        onPress,
        onDelete,
        canDelete,
        extraKeys: variant === 'decimal' ? ['.'] : [],
    });

    return (
        <div className={`grid grid-cols-3 gap-x-3 gap-y-2.5 ${className}`}>
            {PAD_KEYS.map(k => (
                <button key={k.digit} type="button" aria-label={k.digit} onClick={() => onPress(k.digit)} className={`flex flex-col items-center justify-center ${KEY_CLS}`}>
                    <span className={DIGIT_CLS}>{k.digit}</span>
                    <span className={SUB_CLS}>{showLetters ? k.letters : ''}</span>
                </button>
            ))}
            {variant === 'decimal' ? (
                <button type="button" aria-label="." onClick={() => onPress('.')} className={`flex items-center justify-center ${KEY_CLS}`}>
                    <span className={DIGIT_CLS}>.</span>
                </button>
            ) : <div />}
            <button type="button" aria-label="0" onClick={() => onPress('0')} className={`flex flex-col items-center justify-center ${KEY_CLS}`}>
                <span className={DIGIT_CLS}>0</span>
                <span className={SUB_CLS}>{zeroSub}</span>
            </button>
            {onDelete ? (
                <button
                    type="button"
                    aria-label={t('common.delete', 'Delete')}
                    onClick={onDelete}
                    disabled={!canDelete}
                    className="flex items-center justify-center active:opacity-60"
                >
                    <Delete
                        className={`h-[31px] w-[31px] transition-colors ${canDelete ? 'text-black dark:text-white' : 'text-black/20 dark:text-white/20'}`}
                        strokeWidth={2.1}
                    />
                </button>
            ) : <div />}
        </div>
    );
}
