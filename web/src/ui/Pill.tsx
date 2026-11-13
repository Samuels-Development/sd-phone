import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

const pill = cva(
    'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] text-[13px] font-bold uppercase tracking-wide',
    {
        variants: {
            tone: {
                green:  'bg-ios-green/20 text-[#15803d] dark:text-ios-green',
                blue:   'bg-ios-blue/20 text-[#1d4ed8] dark:text-ios-blue',
                orange: 'bg-ios-orange/20 text-[#b45309] dark:text-ios-orange',
                red:    'bg-ios-red/20 text-[#c1121f] dark:text-ios-red',
                grey:   'bg-ios-gray/20 text-[#4b5563] dark:text-ios-gray',
            },
        },
        defaultVariants: { tone: 'green' },
    },
);

export type PillTone = NonNullable<VariantProps<typeof pill>['tone']>;

export function Pill({ tone, className, children }: VariantProps<typeof pill> & {
    className?: string;
    children:   ReactNode;
}) {
    return <span className={clsx(pill({ tone }), className)}>{children}</span>;
}
