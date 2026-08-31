import { ChevronRight, MessageCircle, Phone, Star } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { useTheme } from '@/stores/themeStore';
import type { DarkTheme } from '@/stores/themeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';
import { PaletteChip, CustomPalettesSection } from './PaletteRows';
import { PaletteEditorPage } from './PaletteEditorPage';
import { Toggle } from '@/ui/Toggle';

export function DarkAppearancePage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { darkTheme, setDarkTheme, customPalettes } = useTheme('darkTheme', 'setDarkTheme', 'customPalettes');
    const [editing, setEditing] = useSessionState<string | null>('settings:darkPaletteEditor', null);

    const editTarget = editing === null || editing === 'new' ? null : customPalettes.find(p => p.id === editing) ?? null;
    if (editing === 'new' || editTarget) {
        return (
            <PaletteEditorPage
                key={editing}
                mode="dark"
                editing={editTarget ?? undefined}
                onBack={() => setEditing(null)}
            />
        );
    }

    const PALETTES: { id: DarkTheme; label: string; swatch: { base: string; surface: string; control: string } }[] = [
        { id: 'graphite', label: t('settings.darkGraphite', 'Graphite'), swatch: { base: '#0B0B0D', surface: '#1C1C1E', control: '#3A3A3C' } },
        { id: 'black',    label: t('settings.darkBlack', 'Black'),       swatch: { base: '#000000', surface: '#161618', control: '#313134' } },
        { id: 'warm',     label: t('settings.darkWarm', 'Warm'),         swatch: { base: '#0C0B0A', surface: '#1D1C1B', control: '#3A3937' } },
        { id: 'midnight', label: t('settings.darkMidnight', 'Midnight'), swatch: { base: '#0A0C12', surface: '#181C26', control: '#333948' } },
        { id: 'moss',     label: t('settings.darkMoss', 'Moss'),         swatch: { base: '#0A0D0B', surface: '#191E1A', control: '#343B35' } },
        { id: 'plum',     label: t('settings.darkPlum', 'Plum'),         swatch: { base: '#0D0A10', surface: '#1E1922', control: '#3B3441' } },
        { id: 'slate', label: t('settings.darkSlate', 'Slate'), swatch: { base: '#0B0D10', surface: '#1B1F24', control: '#373D45' } },
        { id: 'ocean', label: t('settings.darkOcean', 'Ocean'), swatch: { base: '#080D0E', surface: '#161E20', control: '#2F3B3E' } },
        { id: 'rose', label: t('settings.darkRose', 'Rose'), swatch: { base: '#0F0A0C', surface: '#21191C', control: '#3F3438' } },
        { id: 'clay', label: t('settings.darkClay', 'Clay'), swatch: { base: '#0E0B09', surface: '#201B17', control: '#3E3730' } },
    ];

    const DESC: Record<DarkTheme, string> = {
        graphite: t('settings.darkGraphiteHint', 'Soft charcoal. Layers read clearly, easiest on the eyes.'),
        black:    t('settings.darkBlackHint', 'True black. Deep and high-contrast, best on OLED.'),
        warm:     t('settings.darkWarmHint', 'A faint warm tint. Cozier, less clinical.'),
        midnight: t('settings.darkMidnightHint', 'A cool blue cast. Calm, and easy at night.'),
        moss:     t('settings.darkMossHint', 'A quiet green tint. Muted and natural.'),
        plum:     t('settings.darkPlumHint', 'A soft violet cast. Moody without being loud.'),
        slate: t('settings.darkSlateHint', 'A cool grey-blue. Neutral, a touch crisper than Graphite.'),
        ocean: t('settings.darkOceanHint', 'Deep teal. Cold and clean, like water at night.'),
        rose: t('settings.darkRoseHint', 'A muted red cast. Warm without going orange.'),
        clay: t('settings.darkClayHint', 'Earthy brown. The warmest of the set.'),
    };

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar backLabel={t('settings.display', 'Display')} onBack={goBack} title={t('settings.darkAppearance', 'Dark Appearance')} hairline />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-7 px-4 pb-12">

                    <section>
                        <ListGroup>
                            {PALETTES.map((p, i) => (
                                <ListRow
                                    key={p.id}
                                    label={p.label}
                                    sub={DESC[p.id]}
                                    left={<PaletteChip swatch={p.swatch} />}
                                    selected={darkTheme === p.id}
                                    divider={i < PALETTES.length - 1}
                                    onPress={() => setDarkTheme(p.id)}
                                />
                            ))}
                        </ListGroup>
                    </section>

                    <section>
                        <CustomPalettesSection
                            mode="dark"
                            palettes={customPalettes}
                            selected={darkTheme}
                            onSelect={setDarkTheme}
                            onEdit={setEditing}
                            onCreate={() => setEditing('new')}
                        />
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
                    <PreviewRow left={<Dot className="bg-ios-blue" />} label={t('settings.wifi', 'Wi-Fi')} value={t('settings.previewWifiNetwork', 'Home')} divider />
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
