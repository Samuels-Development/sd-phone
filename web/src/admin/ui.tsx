import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';

// Shared primitives for the admin panel. The panel styles itself (fixed dark
// theme) and deliberately does not reuse the phone's iOS component kit.

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'subtle';

const BTN: Record<BtnVariant, string> = {
    primary: 'bg-ios-blue/90 hover:bg-ios-blue text-white',
    ghost:   'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200',
    subtle:  'bg-transparent hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200',
    danger:  'bg-ios-red/15 hover:bg-ios-red/25 text-ios-red',
};

interface BtnProps {
    children:  ReactNode;
    onClick?:  () => void;
    variant?:  BtnVariant;
    disabled?: boolean;
    busy?:     boolean;
    className?: string;
    title?:    string;
}

export function Btn({ children, onClick, variant = 'ghost', disabled, busy, className, title }: BtnProps) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled || busy}
            onClick={onClick}
            className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-40',
                BTN[variant], className,
            )}
        >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {children}
        </button>
    );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'green' | 'red' | 'blue' | 'amber'; className?: string }) {
    const tones = {
        neutral: 'bg-white/[0.07] text-zinc-300',
        green:   'bg-ios-green/15 text-ios-green',
        red:     'bg-ios-red/15 text-ios-red',
        blue:    'bg-ios-blue/15 text-[#6db4ff]',
        amber:   'bg-ios-orange/15 text-ios-orange',
    };
    return (
        <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', tones[tone], className)}>
            {children}
        </span>
    );
}

export function OnlineDot({ online }: { online?: boolean }) {
    return (
        <span
            title={online ? 'Online' : 'Offline'}
            className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', online ? 'bg-ios-green' : 'bg-zinc-600')}
        />
    );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
    return (
        <div className={clsx('rounded-xl bg-white/[0.035] ring-1 ring-white/[0.06]', className)}>
            {(title !== undefined || actions !== undefined) && (
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
                    {actions}
                </div>
            )}
            {children}
        </div>
    );
}

export function Input({ value, onChange, placeholder, autoFocus, mono, type = 'text', onEnter }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    mono?: boolean;
    type?: string;
    onEnter?: () => void;
}) {
    return (
        <input
            type={type}
            value={value}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }}
            className={clsx(
                'w-full rounded-lg bg-white/[0.06] px-3 py-2 text-[13px] text-zinc-100 outline-none ring-1 ring-white/[0.08]',
                'placeholder:text-zinc-500 focus:ring-ios-blue/60',
                mono && 'font-mono',
            )}
        />
    );
}

export function Spinner({ className }: { className?: string }) {
    return <Loader2 size={18} className={clsx('animate-spin text-zinc-500', className)} />;
}

export function CenterNote({ children }: { children: ReactNode }) {
    return <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-zinc-500">{children}</div>;
}

export function LoadMore({ onClick, loading, hasMore }: { onClick: () => void; loading: boolean; hasMore: boolean }) {
    if (!hasMore) return null;
    return (
        <div className="flex justify-center py-3">
            <Btn variant="ghost" onClick={onClick} busy={loading}>Load more</Btn>
        </div>
    );
}

// Modal rendered inside the panel window (absolute, not portal) so it stays
// within the admin surface and inherits its stacking context.
export function Modal({ title, children, onClose, width = 'w-[420px]' }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    width?: string;
}) {
    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-[2px]" onMouseDown={onClose}>
            <div
                className={clsx('max-h-[80%] overflow-y-auto rounded-xl bg-[#1a1b1f] p-4 shadow-2xl ring-1 ring-white/10', width)}
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-[14px] font-bold text-zinc-100">{title}</div>
                    <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200">
                        <X size={15} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export function ConfirmModal({ title, body, confirmLabel = 'Confirm', danger, requireText, onConfirm, onClose }: {
    title: string;
    body: ReactNode;
    confirmLabel?: string;
    danger?: boolean;
    requireText?: string;
    onConfirm: () => Promise<void> | void;
    onClose: () => void;
}) {
    const [typed, setTyped] = useState('');
    const [busy, setBusy]   = useState(false);
    const blocked = !!requireText && typed !== requireText;
    return (
        <Modal title={title} onClose={onClose}>
            <div className="space-y-3 text-[13px] text-zinc-300">
                <div>{body}</div>
                {requireText && (
                    <div className="space-y-1.5">
                        <div className="text-[12px] text-zinc-500">Type <span className="font-mono text-zinc-300">{requireText}</span> to confirm:</div>
                        <Input value={typed} onChange={setTyped} mono autoFocus />
                    </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                    <Btn variant="subtle" onClick={onClose}>Cancel</Btn>
                    <Btn
                        variant={danger ? 'danger' : 'primary'}
                        disabled={blocked}
                        busy={busy}
                        onClick={() => {
                            setBusy(true);
                            void Promise.resolve(onConfirm()).finally(() => { setBusy(false); onClose(); });
                        }}
                    >
                        {confirmLabel}
                    </Btn>
                </div>
            </div>
        </Modal>
    );
}

export function PromptModal({ title, body, placeholder, mono, initial = '', submitLabel = 'Save', validate, onSubmit, onClose }: {
    title: string;
    body?: ReactNode;
    placeholder?: string;
    mono?: boolean;
    initial?: string;
    submitLabel?: string;
    validate?: (v: string) => string | null;
    onSubmit: (value: string) => Promise<void> | void;
    onClose: () => void;
}) {
    const [value, setValue] = useState(initial);
    const [busy, setBusy]   = useState(false);
    const error = validate ? validate(value) : null;
    const submit = () => {
        if (error || busy) return;
        setBusy(true);
        void Promise.resolve(onSubmit(value)).finally(() => { setBusy(false); onClose(); });
    };
    return (
        <Modal title={title} onClose={onClose}>
            <div className="space-y-3 text-[13px] text-zinc-300">
                {body && <div>{body}</div>}
                <Input value={value} onChange={setValue} placeholder={placeholder} mono={mono} autoFocus onEnter={submit} />
                {value !== '' && error && <div className="text-[12px] text-ios-red">{error}</div>}
                <div className="flex justify-end gap-2 pt-1">
                    <Btn variant="subtle" onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={value === '' || !!error} busy={busy} onClick={submit}>{submitLabel}</Btn>
                </div>
            </div>
        </Modal>
    );
}

// Bottom-corner toast for action feedback, auto-dismissing.
export interface ToastMsg { id: number; text: string; error?: boolean }

export function ToastHost({ toasts }: { toasts: ToastMsg[] }) {
    return (
        <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className={clsx(
                        'animate-admin-toast rounded-lg px-3.5 py-2 text-[12.5px] font-semibold shadow-xl ring-1',
                        t.error ? 'bg-[#2a1416] text-ios-red ring-ios-red/30' : 'bg-[#14231a] text-ios-green ring-ios-green/30',
                    )}
                >
                    {t.text}
                </div>
            ))}
        </div>
    );
}

export function useToasts() {
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    const next = useRef(1);
    const push = (text: string, error = false) => {
        const id = next.current++;
        setToasts(t => [...t, { id, text, error }]);
        window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
    };
    return { toasts, push };
}

// Debounced value for live-search inputs.
export function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(value), ms);
        return () => window.clearTimeout(t);
    }, [value, ms]);
    return debounced;
}
