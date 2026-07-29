import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { DialogShell } from './DialogShell';

type Mode = 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';

type ConfirmResult = string | null | void;

interface FieldConfig {
    label?:        string;
    placeholder?:  string;
    initialValue?: string;
    maxLength?:    number;
    inputMode?:    Mode;
    sanitize?:     (v: string) => string;
}

interface Props {
    title:           string;
    message?:        string;
    label?:          string;
    placeholder?:    string;
    initialValue?:   string;
    maxLength?:      number;
    inputMode?:      Mode;
    secure?:         boolean;
    sanitize?:       (v: string) => string;
    secondField?:  FieldConfig;
    confirmLabel?: string;
    cancelLabel?:  string;
    validate?:     (v1: string, v2?: string) => string | null;
    onCancel:      () => void;
    onConfirm:     (value: string, value2?: string) => ConfirmResult | Promise<ConfirmResult>;
}

function isThenable(r: ConfirmResult | Promise<ConfirmResult>): r is Promise<ConfirmResult> {
    return !!r && typeof (r as Promise<ConfirmResult>).then === 'function';
}

export function PromptDialog({
    title, message, label, placeholder, initialValue = '', maxLength, inputMode, secure, sanitize,
    secondField, confirmLabel = t('common.ok', 'OK'), cancelLabel = t('common.cancel', 'Cancel'),
    validate, onCancel, onConfirm,
}: Props) {
    const [v1, setV1]           = useState(initialValue);
    const [v2, setV2]           = useState(secondField?.initialValue ?? '');
    const [error, setError]     = useState<string | null>(null);
    const [busy, setBusy]       = useState(false);
    const [exiting, setExiting] = useState(false);
    const input1Ref  = useRef<HTMLInputElement>(null);
    const input2Ref  = useRef<HTMLInputElement>(null);
    const exitingRef = useRef(false);

    const canConfirm = v1.trim().length > 0 && (!secondField || v2.trim().length > 0);

    useEffect(() => {
        const target = input1Ref.current;
        target?.focus();
        target?.select();
    }, []);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.stopPropagation(); dismiss(onCancel); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
         
    }, [onCancel]);

    function dismiss(after: () => void) {
        if (exitingRef.current) return;
        exitingRef.current = true;
        setExiting(true);
        window.setTimeout(after, 180);
    }

    function revive() {
        exitingRef.current = false;
        setExiting(false);
    }

    function settle(pending: Promise<ConfirmResult>) {
        setBusy(true);
        pending.then(
            result => {
                if (exitingRef.current) return;
                setBusy(false);
                if (typeof result === 'string') { setError(result); return; }
                // Promise-returning confirms close the dialog themselves; onCancel is the unmount channel.
                dismiss(onCancel);
            },
            () => {
                if (exitingRef.current) return;
                setBusy(false);
                setError(t('common.somethingWentWrong', 'Something went wrong. Please try again.'));
            },
        );
    }

    function confirm() {
        if (!canConfirm || busy || exiting) return;
        const t1 = v1.trim();
        const t2 = secondField ? v2.trim() : undefined;
        if (validate) {
            const invalid = validate(t1, t2);
            if (invalid) { setError(invalid); return; }
        }
        setError(null);
        // Async handlers run at press time so the busy state is visible while pending.
        // Plain handlers keep the legacy order (exit animation first, then onConfirm)
        // because existing consumers unmount the dialog inside onConfirm.
        if (Object.prototype.toString.call(onConfirm) === '[object AsyncFunction]') {
            settle(Promise.resolve(onConfirm(t1, t2)));
            return;
        }
        dismiss(() => {
            const result = onConfirm(t1, t2);
            if (typeof result === 'string') { revive(); setError(result); return; }
            if (isThenable(result)) { revive(); settle(result); }
        });
    }

    const fieldCls = 'w-full rounded-[9px] border border-black/15 bg-white px-3 py-2 text-[16px] text-black outline-none focus:border-ios-blue disabled:opacity-60 dark:border-white/20 dark:bg-base/40 dark:text-white';
    const labelCls = 'mb-1 text-[12.5px] font-semibold uppercase tracking-wide text-black/45 dark:text-white/45';

    return (
        <DialogShell
            title={title}
            message={message}
            exiting={exiting}
            cancel={{ label: cancelLabel, onClick: () => dismiss(onCancel) }}
            confirm={{ label: confirmLabel, onClick: confirm, disabled: !canConfirm || busy, busy }}
        >
            <div className="mt-4 space-y-3 text-left">
                <div>
                    {label && <div className={labelCls}>{label}</div>}
                    <input
                        ref={input1Ref}
                        type={secure ? 'password' : undefined}
                        value={v1}
                        maxLength={maxLength}
                        placeholder={placeholder}
                        inputMode={inputMode}
                        disabled={busy}
                        onChange={e => { setV1(sanitize ? sanitize(e.target.value) : e.target.value); if (error) setError(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); confirm(); } }}
                        className={fieldCls}
                    />
                </div>

                {secondField && (
                    <div>
                        {secondField.label && <div className={labelCls}>{secondField.label}</div>}
                        <input
                            ref={input2Ref}
                            value={v2}
                            maxLength={secondField.maxLength}
                            placeholder={secondField.placeholder}
                            inputMode={secondField.inputMode}
                            disabled={busy}
                            onChange={e => { setV2(secondField.sanitize ? secondField.sanitize(e.target.value) : e.target.value); if (error) setError(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); confirm(); } }}
                            className={`${fieldCls} tabular-nums`}
                        />
                    </div>
                )}
            </div>

            {error && (
                <div className="mt-2 text-left text-[14px] leading-snug text-ios-red">{error}</div>
            )}
        </DialogShell>
    );
}
