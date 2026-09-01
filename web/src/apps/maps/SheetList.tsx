import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { t } from '@/i18n';

export function SheetList({ empty, children }: { empty?: string; children?: ReactNode }) {
    if (empty !== undefined) {
        return <p className="py-6 text-center text-[15px] text-ios-gray">{empty}</p>;
    }
    return <div className="overflow-hidden rounded-[12px] bg-surface">{children}</div>;
}

export function SheetRow({ rowRef, asButton = false, selected = false, disabled = false, onPress, leading, title, titleClass = 'text-[21px]', subtitle, subtitleClass = 'truncate text-ios-gray', trailing, actions, divider }: {
    rowRef?:        (el: HTMLDivElement | null) => void;
    asButton?:      boolean;
    selected?:      boolean;
    disabled?:      boolean;
    onPress:        () => void;
    leading:        ReactNode;
    title:          string;
    titleClass?:    string;
    subtitle:       ReactNode;
    subtitleClass?: string;
    trailing?:      ReactNode;
    actions?:       ReactNode;
    divider:        boolean;
}) {
    const text = (
        <span className={'flex min-w-0 flex-col leading-tight' + (asButton ? ' flex-1' : '')}>
            <span className={'truncate font-semibold text-black dark:text-white ' + titleClass}>{title}</span>
            <span className={'mt-[2px] text-[16px] font-medium ' + subtitleClass}>{subtitle}</span>
        </span>
    );
    const hairline = divider && (
        <div className="absolute bottom-0 left-0 right-0 h-px bg-hairline/[0.08]" />
    );
    if (asButton) {
        return (
            <button
                disabled={disabled}
                onClick={onPress}
                className={'relative flex h-[78px] w-full items-center gap-3.5 pl-3.5 pr-4 text-left ' +
                    (disabled ? 'opacity-55' : 'active:bg-black/5 dark:active:bg-white/5')}
            >
                {leading}
                {text}
                {trailing}
                {hairline}
            </button>
        );
    }
    return (
        <div
            ref={rowRef}
            className={'relative flex h-[78px] items-center gap-3.5 pl-3.5 pr-2 ' +
                (selected ? 'bg-ios-blue/10' : 'active:bg-black/5 dark:active:bg-white/5')}
        >
            <button onClick={onPress} disabled={disabled} className="flex min-w-0 flex-1 items-center gap-3.5 text-left disabled:cursor-default">
                {leading}
                {text}
            </button>
            {actions}
            {hairline}
        </div>
    );
}

export function RoundActionBtn({ icon: Icon, color = 'blue', onClick, label, title }: {
    icon:     LucideIcon;
    color?:   'blue' | 'red';
    onClick:  () => void;
    label:    string;
    title?:   string;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            title={title}
            className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + (color === 'red'
                ? 'bg-ios-red/[0.12] text-ios-red active:bg-ios-red/25 dark:bg-ios-red/[0.18] dark:active:bg-ios-red/30'
                : 'bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30')}
        >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
    );
}

export function PanelHeader({ title, onCancel, right }: { title: string; onCancel: () => void; right?: ReactNode }) {
    if (right !== undefined) {
        return (
            <div className="flex h-[42px] shrink-0 items-center px-4">
                <div className="flex flex-1 justify-start">
                    <button onClick={onCancel} className="text-[16px] text-ios-blue active:opacity-60">{t('maps.cancel', 'Cancel')}</button>
                </div>
                <h2 className="shrink-0 text-[18px] font-bold tracking-tight text-black dark:text-white">{title}</h2>
                <div className="flex flex-1 justify-end">{right}</div>
            </div>
        );
    }
    return (
        <div className="flex h-[42px] shrink-0 items-center justify-between px-4">
            <h2 className="text-[20px] font-bold tracking-tight text-black dark:text-white">{title}</h2>
            <button onClick={onCancel} className="text-[16px] font-semibold text-ios-blue active:opacity-60">
                {t('maps.cancel', 'Cancel')}
            </button>
        </div>
    );
}

export function PanelInput({ value, onChange, onSubmit, onCancel, placeholder, className, inputClass, leading, trailing, autoFocus = false, maxLength, inputMode }: {
    value:       string;
    onChange:    (v: string) => void;
    onSubmit:    () => void;
    onCancel?:   () => void;
    placeholder: string;
    className:   string;
    inputClass:  string;
    leading?:    ReactNode;
    trailing?:   ReactNode;
    autoFocus?:  boolean;
    maxLength?:  number;
    inputMode?:  'tel';
}) {
    return (
        <div className={'flex items-center rounded-[10px] bg-[#e5e5e5] dark:bg-white/10 ' + className}>
            {leading}
            <input
                autoFocus={autoFocus}
                maxLength={maxLength}
                inputMode={inputMode}
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel?.(); }}
                placeholder={placeholder}
                className={'min-w-0 flex-1 bg-transparent text-black outline-none placeholder-black/55 dark:text-white dark:placeholder-white/55 ' + inputClass}
            />
            {trailing}
        </div>
    );
}
