import type { ReactNode } from 'react';

import { mdtFieldClass, mdtSectionHeader } from '../mdtTheme';
import { MdtSelect } from './MdtSelect';

interface MdtFieldProps {
    label?:       string;
    hint?:        string;
    value:        string;
    onChange:     (value: string) => void;
    options?:     { value: string; label: string }[];
    multiline?:   boolean;
    rows?:        number;
    placeholder?: string;
    maxLength?:   number;
    inputMode?:   'text' | 'numeric' | 'decimal';
    autoFocus?:   boolean;
    disabled?:    boolean;
    className?:   string;
    fieldClassName?: string;
}

function Labelled({ label, hint, className, children }: {
    label?:     string;
    hint?:      string;
    className?: string;
    children:   ReactNode;
}) {
    return (
        <label className={`block min-w-0 ${className ?? ''}`}>
            {label && <span className={`mb-1 block ${mdtSectionHeader}`}>{label}</span>}
            {children}
            {hint && <span className="mt-1 block text-[12.5px] text-ios-gray">{hint}</span>}
        </label>
    );
}

export function MdtField({
    label, hint, value, onChange, options, multiline = false, rows = 4,
    placeholder, maxLength, inputMode, autoFocus, disabled = false, className, fieldClassName = '',
}: MdtFieldProps) {
    const base = `${mdtFieldClass} ${disabled ? 'opacity-50' : ''} ${fieldClassName}`;

    return (
        <Labelled label={label} hint={hint} className={className}>
            {options ? (
                <MdtSelect
                    value={value}
                    onChange={onChange}
                    options={options}
                    disabled={disabled}
                    ariaLabel={label}
                    placeholder={placeholder}
                    className={fieldClassName}
                />
            ) : multiline ? (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    rows={rows}
                    autoFocus={autoFocus}
                    disabled={disabled}
                    className={`${base} resize-none leading-snug`}
                />
            ) : (
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    inputMode={inputMode}
                    autoFocus={autoFocus}
                    disabled={disabled}
                    className={base}
                />
            )}
        </Labelled>
    );
}
