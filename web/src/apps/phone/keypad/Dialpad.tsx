export const DIAL_KEYS: { d: string; sub: string }[] = [
    { d: '1', sub: '' },     { d: '2', sub: 'ABC' },  { d: '3', sub: 'DEF' },
    { d: '4', sub: 'GHI' },  { d: '5', sub: 'JKL' },  { d: '6', sub: 'MNO' },
    { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' },  { d: '9', sub: 'WXYZ' },
    { d: '*', sub: '' },     { d: '0', sub: '+' },    { d: '#', sub: '' },
];

export function Dialpad({ onPress }: { onPress: (digit: string) => void }) {
    return (
        <div className="grid grid-cols-3 justify-items-center gap-y-4">
            {DIAL_KEYS.map(k => (
                <button
                    key={k.d}
                    type="button"
                    onClick={() => onPress(k.d)}
                    className="flex h-[95px] w-[95px] flex-col items-center justify-center rounded-full bg-[#e8e8ea] active:bg-surface dark:bg-elevated dark:active:bg-control"
                >
                    <span className="text-[38px] font-normal leading-none text-black dark:text-white">{k.d}</span>
                    {k.sub && (
                        <span className="mt-[4px] text-[11px] font-semibold leading-none tracking-[0.16em] text-black/55 dark:text-white/55">
                            {k.sub}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}
