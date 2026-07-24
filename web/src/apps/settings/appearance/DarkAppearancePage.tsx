import { Check, ChevronRight, MessageCircle, Phone, Star } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import type { DarkTheme } from '@/stores/themeStore';
import { NavBar } from '@/ui/NavBar';
import { Toggle } from '@/ui/Toggle';

const PALETTES: { id: DarkTheme; label: string; swatch: { base: string; surface: string; control: string } }[] = [
    { id: 'graphite', label: t('settings.darkGraphite', 'Graphite'), swatch: { base: '#0B0B0D', surface: '#1C1C1E', control: '#3A3A3C' } },
    { id: 'black',    label: t('settings.darkBlack', 'Black'),       swatch: { base: '#000000', surface: '#161618', control: '#313134' } },
    { id: 'warm',     label: t('settings.darkWarm', 'Warm'),         swatch: { base: '#0C0B0A', surface: '#1D1C1B', control: '#3A3937' } },
];

const DESC: Record<DarkTheme, string> = {
    graphite: t('settings.darkGraphiteHint', 'Soft charcoal. Layers read clearly, easiest on the eyes.'),
    black:    t('settings.darkBlackHint', 'True black. Deep and high-contrast, best on OLED.'),
    warm:     t('settings.darkWarmHint', 'A faint warm tint. Cozier, less clinical.'),
};

export function DarkAppearancePage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { darkTheme, setDarkTheme } = useTheme('darkTheme', 'setDarkTheme');

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar backLabel={t('settings.displayBrightness', 'Display')} onBack={goBack} title={t('settings.darkAppearance', 'Dark Appearance')} hairline />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-7 px-4 pb-12">

                    <section>
                        <div className="flex justify-between gap-3 rounded-[12px] bg-[#e5e5e5] dark:bg-surface px-4 py-5">
                            {PALETTES.map(p => (
                                <PaletteButton
                                    key={p.id}
                                    label={p.label}
                                    swatch={p.swatch}
                                    selected={darkTheme === p.id}
                                    onSelect={() => setDarkTheme(p.id)}
                                />
                            ))}
                        </div>
                        <p className="mt-2 px-1 text-[13px] leading-snug text-ios-gray">{DESC[darkTheme]}</p>
                    </section>

                    <section>
                        <p className="mb-2 px-1 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.preview', 'Preview')}
                        </p>
                        <Preview />
                    </section>

                </div>
            </div>
        </div>
    );
}

function Preview() {
    return (
        <div className="overflow-hidden rounded-[16px] bg-base ring-1 ring-white/10">
            <div className="flex flex-col gap-4 p-4">

                <div className="overflow-hidden rounded-[11px] bg-surface">
                    <PreviewRow left={<Dot className="bg-ios-blue" />} label={t('settings.wifi', 'Wi-Fi')} value="Home" divider />
                    <PreviewRow left={<Dot className="bg-ios-green" />} label={t('settings.bluetooth', 'Bluetooth')} right={<Toggle on />} divider />
                    <PreviewRow left={<Dot className="bg-ios-gray" />} label={t('settings.general', 'General')} />
                </div>

                <div className="flex flex-col gap-2">
                    <div className="max-w-[78%] self-start rounded-[16px] rounded-bl-[5px] bg-elevated px-3.5 py-2 text-[14px] text-white">
                        {t('settings.previewBubbleIn', 'How does this shade look?')}
                    </div>
                    <div className="max-w-[78%] self-end rounded-[16px] rounded-br-[5px] bg-ios-blue px-3.5 py-2 text-[14px] text-white">
                        {t('settings.previewBubbleOut', 'Nice, much better')}
                    </div>
                </div>

                <div className="flex gap-2.5">
                    <button type="button" className="flex-1 rounded-[11px] bg-ios-blue py-2.5 text-[14px] font-semibold text-white">
                        {t('settings.previewPrimary', 'Continue')}
                    </button>
                    <button type="button" className="flex-1 rounded-[11px] bg-control py-2.5 text-[14px] font-semibold text-white">
                        {t('settings.previewSecondary', 'Not Now')}
                    </button>
                </div>
            </div>

            <div className="flex items-stretch justify-around border-t border-white/10 bg-base px-1 pb-2 pt-2">
                <TabIcon icon={<Phone className="h-[19px] w-[19px]" strokeWidth={2} />} label={t('settings.previewTabCalls', 'Calls')} active />
                <TabIcon icon={<MessageCircle className="h-[19px] w-[19px]" strokeWidth={2} />} label={t('settings.previewTabChats', 'Chats')} />
                <TabIcon icon={<Star className="h-[19px] w-[19px]" strokeWidth={2} />} label={t('settings.previewTabFaves', 'Faves')} />
            </div>
        </div>
    );
}

function PreviewRow({ left, label, value, right, divider }: {
    left: React.ReactNode; label: string; value?: string; right?: React.ReactNode; divider?: boolean;
}) {
    return (
        <div className="relative flex items-center gap-3 px-3.5 py-2.5">
            {left}
            <span className="flex-1 text-[15px] text-white">{label}</span>
            {value && <span className="text-[15px] text-ios-gray">{value}</span>}
            {right}
            {!right && !value && <ChevronRight className="h-4 w-4 text-ios-gray" strokeWidth={2.5} />}
            {divider && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[0.5px] bg-control" />}
        </div>
    );
}

function Dot({ className }: { className: string }) {
    return <span className={`h-[22px] w-[22px] shrink-0 rounded-[6px] ${className}`} />;
}

function TabIcon({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
    return (
        <div className={`flex flex-1 flex-col items-center gap-1 py-0.5 ${active ? 'text-ios-blue' : 'text-white/55'}`}>
            {icon}
            <span className="text-[10px] font-semibold">{label}</span>
        </div>
    );
}

function PaletteButton({ label, swatch, selected, onSelect }: {
    label: string;
    swatch: { base: string; surface: string; control: string };
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button type="button" onClick={onSelect} className="flex flex-1 flex-col items-center gap-2 active:opacity-70">
            <div
                className="relative w-full overflow-hidden rounded-[13px]"
                style={{
                    aspectRatio: '9 / 15',
                    background: swatch.base,
                    boxShadow: selected ? '0 0 0 2.5px #0a84ff' : `inset 0 0 0 1px ${swatch.control}`,
                }}
            >
                <div className="absolute left-1/2 top-2 h-[5px] w-[24px] -translate-x-1/2 rounded-full bg-black" />
                <div className="absolute inset-x-2 top-6 rounded-[7px]" style={{ background: swatch.surface }}>
                    <div className="flex flex-col gap-[5px] p-[7px]">
                        <div className="h-[5px] w-[70%] rounded-full" style={{ background: swatch.control }} />
                        <div className="h-[5px] w-[45%] rounded-full" style={{ background: swatch.control }} />
                    </div>
                </div>
                <div className="absolute inset-x-2 bottom-2 h-[18px] rounded-[7px]" style={{ background: swatch.surface }} />
            </div>
            <span className="text-[14px] font-normal text-black dark:text-white">{label}</span>
            <div className={[
                'flex h-[21px] w-[21px] items-center justify-center rounded-full border-2 transition-colors',
                selected ? 'border-ios-blue bg-ios-blue' : 'border-[#C6C6C8] dark:border-[#636366] bg-transparent',
            ].join(' ')}>
                {selected && <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} />}
            </div>
        </button>
    );
}
