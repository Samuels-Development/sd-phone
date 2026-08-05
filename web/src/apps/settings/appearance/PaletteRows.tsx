import { Plus } from 'lucide-react';

import { t } from '@/i18n';
import type { CustomPalette, CustomPaletteId } from '@/stores/themeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { cssColor, MAX_CUSTOM_PALETTES, rampFor } from './paletteRamp';
import type { PaletteMode } from './paletteRamp';

export function PaletteChip({ swatch }: { swatch: { base: string; surface: string; control: string } }) {
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

export function CustomPalettesSection({ mode, palettes, selected, onSelect, onEdit, onCreate }: {
    mode:     PaletteMode;
    palettes: CustomPalette[];
    selected: string;
    onSelect: (id: CustomPaletteId) => void;
    onEdit:   (id: CustomPaletteId) => void;
    onCreate: () => void;
}) {
    const mine = palettes.filter(p => p.mode === mode);
    const full = mine.length >= MAX_CUSTOM_PALETTES;

    return (
        <ListGroup
            header={t('settings.paletteMine', 'My Palettes')}
            footer={t('settings.paletteMineHint', 'Pick a hue, then set how strongly it tints the background and how deep that background goes.')}
        >
            {mine.map(p => (
                <CustomPaletteRow
                    key={p.id}
                    palette={p}
                    selected={p.id === selected}
                    onSelect={() => onSelect(p.id)}
                    onEdit={() => onEdit(p.id)}
                />
            ))}
            <ListRow
                label={t('settings.paletteCreate', 'Create Palette')}
                sub={t('settings.paletteCount', '{used} of {max} used', { used: mine.length, max: MAX_CUSTOM_PALETTES })}
                left={(
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-ios-blue">
                        <Plus className="h-[19px] w-[19px] text-white" strokeWidth={3} />
                    </span>
                )}
                onPress={() => { if (!full) onCreate(); }}
            />
        </ListGroup>
    );
}

function CustomPaletteRow({ palette, selected, onSelect, onEdit }: {
    palette:  CustomPalette;
    selected: boolean;
    onSelect: () => void;
    onEdit:   () => void;
}) {
    const ramp = rampFor(palette.mode, palette);

    return (
        <div className="relative flex items-center pr-4">
            <div className="min-w-0 flex-1">
                <ListRow
                    label={palette.name}
                    sub={selected
                        ? t('settings.paletteInUse', 'In use')
                        : t('settings.paletteTapToUse', 'Tap to use')}
                    selected={selected}
                    left={<PaletteChip swatch={{ base: cssColor(ramp.base), surface: cssColor(ramp.surface), control: cssColor(ramp.control) }} />}
                    onPress={onSelect}
                />
            </div>
            <button
                type="button"
                onClick={onEdit}
                className="shrink-0 pl-3 text-[15px] font-normal text-ios-blue active:opacity-60"
            >
                {t('common.edit', 'Edit')}
            </button>
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                style={{ height: '0.5px' }}
            />
        </div>
    );
}
