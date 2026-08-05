import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import type { LightTheme } from '@/stores/themeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';

const PALETTES: { id: LightTheme; label: string; swatch: { base: string; surface: string; control: string } }[] = [
    { id: 'silver',   label: t('settings.lightSilver', 'Silver'),     swatch: { base: '#d4d4d4', surface: '#e5e5e5', control: '#c6c6c8' } },
    { id: 'snow',     label: t('settings.lightSnow', 'Snow'),         swatch: { base: '#f5f5f7', surface: '#ffffff', control: '#dbdbe0' } },
    { id: 'linen',    label: t('settings.lightLinen', 'Linen'),       swatch: { base: '#f0ede6', surface: '#faf8f3', control: '#d6d2c8' } },
    { id: 'sky',      label: t('settings.lightSky', 'Sky'),           swatch: { base: '#d0d8e2', surface: '#e4eaf2', control: '#bec8d4' } },
    { id: 'mint',     label: t('settings.lightMint', 'Mint'),         swatch: { base: '#d0e0d6', surface: '#e5f0e9', control: '#becec4' } },
    { id: 'blush',    label: t('settings.lightBlush', 'Blush'),       swatch: { base: '#e4d4d8', surface: '#f2e6e9', control: '#d2c0c6' } },
    { id: 'sand',     label: t('settings.lightSand', 'Sand'),         swatch: { base: '#e0d6c8', surface: '#eee7dc', control: '#cec3b4' } },
    { id: 'lavender', label: t('settings.lightLavender', 'Lavender'), swatch: { base: '#d8d2e4', surface: '#eae6f2', control: '#c6bfd4' } },
    { id: 'stone',    label: t('settings.lightStone', 'Stone'),       swatch: { base: '#caced3', surface: '#dfe2e6', control: '#bcc0c6' } },
    { id: 'dusk',     label: t('settings.lightDusk', 'Dusk'),         swatch: { base: '#c4c6cc', surface: '#d8dae0', control: '#b6b8c0' } },
];

const DESC: Record<LightTheme, string> = {
    silver:   t('settings.lightSilverHint', 'The standard light grey. Neutral and familiar.'),
    snow:     t('settings.lightSnowHint', 'Bright white. Crisp, with the most contrast.'),
    linen:    t('settings.lightLinenHint', 'Warm off-white. Softer on the eyes than pure white.'),
    sky:      t('settings.lightSkyHint', 'A cool blue wash. Clean and airy.'),
    mint:     t('settings.lightMintHint', 'A pale green tint. Fresh and quiet.'),
    blush:    t('settings.lightBlushHint', 'A soft pink cast. Warm without being loud.'),
    sand:     t('settings.lightSandHint', 'Warm tan. Like paper in daylight.'),
    lavender: t('settings.lightLavenderHint', 'A gentle violet tint. Calm and a little dreamy.'),
    stone:    t('settings.lightStoneHint', 'Cool grey with a blue lean. Crisper than Silver.'),
    dusk:     t('settings.lightDuskHint', 'The deepest light shade. Easier at night.'),
};

export function LightAppearancePage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { lightTheme, setLightTheme } = useTheme('lightTheme', 'setLightTheme');

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar backLabel={t('settings.displayBrightness', 'Display')} onBack={goBack} title={t('settings.lightAppearance', 'Light Appearance')} hairline />

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
                                    selected={lightTheme === p.id}
                                    divider={i < PALETTES.length - 1}
                                    onPress={() => setLightTheme(p.id)}
                                />
                            ))}
                        </ListGroup>
                    </section>
                </div>
            </div>
        </div>
    );
}

function PaletteChip({ swatch }: { swatch: { base: string; surface: string; control: string } }) {
    return (
        <span
            className="relative block h-[34px] w-[34px] shrink-0 overflow-hidden rounded-[9px]"
            style={{ background: swatch.base, boxShadow: `inset 0 0 0 1px ${swatch.control}` }}
        >
            <span className="absolute inset-x-[5px] top-[6px] block h-[9px] rounded-[3px]" style={{ background: swatch.surface }} />
            <span className="absolute inset-x-[5px] bottom-[6px] block h-[7px] rounded-[3px]" style={{ background: swatch.control }} />
        </span>
    );
}
