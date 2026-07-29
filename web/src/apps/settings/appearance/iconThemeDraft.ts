import type {
    ColorRecipe, CustomIconTheme, CustomIconThemeId, IconThemeDef, IconThemeDraft, IconThemeVariant,
} from '@/stores/iconThemeStore';

export type BaseLook = IconThemeVariant & { background: ColorRecipe; glyph: ColorRecipe };

export type VariantKey = 'base' | 'dark';

export type TraitKey = keyof IconThemeVariant;

export interface DraftState {
    name: string;
    base: BaseLook;
    dark: IconThemeVariant | null;
}

export const LIGHTEN = '#ffffff';
export const DARKEN  = '#0f0f12';
export const WHITE   = '#ffffff';

const NEGATION_LOCKED: TraitKey[] = ['background2', 'depth', 'bevel'];

export function seedDraft(name: string, seed: IconThemeDraft): DraftState {
    const { dark, ...base } = seed;
    return { name, base: { ...base }, dark: dark ? { ...dark } : null };
}

export function draftFromTheme(theme: CustomIconTheme): DraftState {
    const { id, name, dark, ...base } = theme;
    void id;
    return { name, base: { ...base }, dark: dark ? { ...dark } : null };
}

export function draftFromBuiltin(def: IconThemeDef): DraftState {
    const { id, art, label, hint, minContrast, dark, ...base } = def;
    void id;
    void art;
    void hint;
    void minContrast;
    return { name: label(), base: { ...base }, dark: dark ? { ...dark } : null };
}

export function toTheme(id: CustomIconThemeId, state: DraftState): CustomIconTheme {
    const dark = state.dark && Object.keys(state.dark).length > 0 ? { ...state.dark } : undefined;
    return { id, name: state.name.trim(), ...state.base, ...(dark ? { dark } : {}) };
}

export function activeLook(state: DraftState, variant: VariantKey): BaseLook {
    if (variant === 'base' || !state.dark) return state.base;
    const merged = { ...state.base, ...state.dark };
    return {
        ...merged,
        background: merged.background ?? state.base.background,
        glyph:      merged.glyph      ?? state.base.glyph,
    };
}

export function previewDraft(state: DraftState, variant: VariantKey): IconThemeDraft {
    return activeLook(state, variant);
}

export function writeTrait<K extends TraitKey>(
    state: DraftState, variant: VariantKey, key: K, value: NonNullable<IconThemeVariant[K]>,
): DraftState {
    if (variant === 'dark') {
        const dark = { ...(state.dark ?? {}) } as Record<string, unknown>;
        dark[key] = value;
        return { ...state, dark: dark as IconThemeVariant };
    }
    const base = { ...state.base } as Record<string, unknown>;
    base[key] = value;
    return { ...state, base: base as unknown as BaseLook };
}

export function dropTraits(state: DraftState, variant: VariantKey, keys: TraitKey[]): DraftState {
    if (variant === 'dark') {
        if (!state.dark) return state;
        const dark = { ...state.dark } as Record<string, unknown>;
        for (const key of keys) delete dark[key];
        const left = Object.keys(dark).length > 0 ? dark as IconThemeVariant : null;
        return { ...state, dark: left };
    }
    const base = { ...state.base } as Record<string, unknown>;
    for (const key of keys) {
        if (key === 'background' || key === 'glyph') continue;
        delete base[key];
    }
    return { ...state, base: base as unknown as BaseLook };
}

export function hasOwnTraits(state: DraftState, variant: VariantKey, keys: TraitKey[]): boolean {
    if (variant === 'base') return false;
    if (!state.dark) return false;
    const dark = state.dark;
    return keys.some(key => dark[key] !== undefined);
}

export function isLockedInDark(state: DraftState, variant: VariantKey, key: TraitKey): boolean {
    if (variant === 'base') return false;
    if (!NEGATION_LOCKED.includes(key)) return false;
    const inherited = state.base[key];
    return inherited !== undefined && inherited !== false;
}

export function mixAmount(recipe: ColorRecipe): number {
    if (recipe.toward === undefined || recipe.amount === undefined) return 0;
    return Math.round(recipe.amount * 100);
}
