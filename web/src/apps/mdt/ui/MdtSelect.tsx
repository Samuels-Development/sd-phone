import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { useMdtRoot } from '../mdtRoot';
import { mdtFieldClass, mdtFieldSm, mdtFieldXs } from '../mdtTheme';
import { useAnchoredMenu } from './useAnchoredMenu';

export interface MdtSelectOption<T extends string = string> {
    value:     T;
    label:     string;
    disabled?: boolean;
}

type MdtSelectSize = 'md' | 'sm' | 'xs';

const TRIGGER: Record<MdtSelectSize, string> = {
    md: mdtFieldClass,
    sm: mdtFieldSm,
    xs: mdtFieldXs,
};

const ROW: Record<MdtSelectSize, string> = {
    md: 'px-3 py-[9px] text-[15px]',
    sm: 'px-3 py-2 text-[14px]',
    xs: 'px-2.5 py-1.5 text-[13px]',
};

const CHEVRON: Record<MdtSelectSize, string> = {
    md: 'h-[15px] w-[15px]',
    sm: 'h-[14px] w-[14px]',
    xs: 'h-[13px] w-[13px]',
};

export function MdtSelect<T extends string = string>({
    value, onChange, options, size = 'md', disabled = false, className = '', ariaLabel, placeholder,
}: {
    value:       T;
    onChange:    (value: T) => void;
    options:     readonly MdtSelectOption<T>[];
    size?:       MdtSelectSize;
    disabled?:   boolean;
    className?:  string;
    ariaLabel?:  string;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const rowsRef = useRef<HTMLDivElement>(null);
    const typed = useRef({ buffer: '', at: 0 });

    const close = useCallback(() => setOpen(false), []);
    const { hostRef, style } = useAnchoredMenu({
        anchor: open ? triggerRef.current : null,
        onClose: close,
        align: 'start',
        matchWidth: true,
        revision: options.length,
    });

    const selectedIndex = useMemo(() => options.findIndex(o => o.value === value), [options, value]);
    const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

    const host = useMdtRoot();

    useEffect(() => {
        if (open) setActive(selectedIndex >= 0 ? selectedIndex : 0);
    }, [open, selectedIndex]);

    useEffect(() => {
        if (!open) return;
        const box = hostRef.current;
        const row = rowsRef.current?.querySelector<HTMLElement>('[data-active="true"]');
        if (!box || !row) return;
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < box.scrollTop) box.scrollTop = top;
        else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    }, [open, active, hostRef]);

    function commit(index: number) {
        const option = options[index];
        if (!option || option.disabled) return;
        onChange(option.value);
        setOpen(false);
        triggerRef.current?.focus();
    }

    function step(delta: number) {
        if (!options.length) return;
        let next = active;
        for (let i = 0; i < options.length; i++) {
            next = (next + delta + options.length) % options.length;
            if (!options[next]?.disabled) break;
        }
        setActive(next);
    }

    function typeAhead(key: string) {
        const now = Date.now();
        const buffer = now - typed.current.at > 800 ? key : typed.current.buffer + key;
        typed.current = { buffer, at: now };
        const found = options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(buffer.toLowerCase()));
        if (found >= 0) setActive(found);
    }

    function onKeyDown(e: React.KeyboardEvent) {
        if (disabled) return;
        if (e.key === ' ' && !isFiveM) {
            e.preventDefault();
            setOpen(o => !o);
            return;
        }
        if (!open) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }
        if (e.key === 'ArrowDown')      { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowUp')   { e.preventDefault(); step(-1); }
        else if (e.key === 'Home')      { e.preventDefault(); setActive(0); }
        else if (e.key === 'End')       { e.preventDefault(); setActive(options.length - 1); }
        else if (e.key === 'Enter')     { e.preventDefault(); commit(active); }
        else if (e.key === 'Tab')       { setOpen(false); }
        else if (e.key.length === 1 && /\S/.test(e.key)) { typeAhead(e.key); }
    }

    const menu = open && host && createPortal(
        <div
            ref={hostRef}
            role="listbox"
            aria-label={ariaLabel}
            className="absolute z-30 overflow-y-auto overscroll-contain rounded-[12px] bg-elevated py-1 shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.08] dark:ring-white/[0.10]"
            style={{
                left:            style?.left ?? 0,
                top:             style?.top ?? 0,
                maxHeight:       style?.maxHeight,
                minWidth:        style?.minWidth,
                opacity:         style ? 1 : 0,
                transformOrigin: style?.origin ?? 'top left',
                animation:       style ? 'ios-alert-in 0.16s cubic-bezier(0.32,0.72,0,1)' : undefined,
            }}
        >
            <div ref={rowsRef}>
                {options.map((option, index) => {
                    const isSelected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            data-active={index === active}
                            disabled={option.disabled}
                            onPointerEnter={() => !option.disabled && setActive(index)}
                            onClick={() => commit(index)}
                            className={[
                                'flex w-full items-center gap-2 text-left transition-colors duration-100',
                                ROW[size],
                                option.disabled
                                    ? 'text-black/30 dark:text-white/30'
                                    : index === active
                                        ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                                        : '',
                                isSelected ? 'font-semibold text-ios-blue' : 'text-black dark:text-white',
                            ].join(' ')}
                        >
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            {isSelected && <Check className="h-[15px] w-[15px] shrink-0 text-ios-blue" strokeWidth={2.6} />}
                        </button>
                    );
                })}
            </div>
        </div>,
        host,
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                onKeyDown={onKeyDown}
                className={[
                    TRIGGER[size],
                    'flex items-center gap-1.5 text-left',
                    disabled ? 'opacity-50' : '',
                    className,
                ].join(' ')}
            >
                <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-black/35 dark:text-white/35'}`}>
                    {selected?.label ?? placeholder ?? ''}
                </span>
                <ChevronDown
                    className={`${CHEVRON[size]} shrink-0 text-ios-gray transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                    strokeWidth={2.4}
                />
            </button>
            {menu}
        </>
    );
}
