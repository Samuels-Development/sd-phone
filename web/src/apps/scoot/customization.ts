import catalog from './extrasCatalog.json';
export interface Customization {
    basket: boolean; stemBag: boolean; phoneMount: boolean;
    rear: string; trim: string; lighting: string; bell: string; decal: string; name: string; number: string;
}
export interface ExtraOption { id: string; label: string; fee: number; hex?: string; description?: string }
export interface ExtrasCatalog {
    defaults: Customization; accessories: ExtraOption[]; rear: ExtraOption[]; trim: ExtraOption[];
    lighting: ExtraOption[]; bell: ExtraOption[]; decal: ExtraOption[];
    presets: {id: string; label: string; description: string; options: Partial<Customization>}[];
}
export const EXTRAS: ExtrasCatalog = catalog;
export function extraFee(value: Customization, c = EXTRAS): number {
    let fee = c.accessories.reduce((sum, item) => sum + (value[item.id as keyof Customization] === true ? item.fee : 0), 0);
    for (const key of ['rear', 'trim', 'lighting', 'bell', 'decal'] as const) fee += c[key].find(item => item.id === value[key])?.fee ?? 0;
    return fee;
}
export function attachmentKeys(value: Customization): Set<string> {
    const keys = new Set<string>(['bell_' + value.bell]);
    if (value.basket) keys.add('basket');
    if (value.stemBag) keys.add('stem_bag');
    if (value.phoneMount) keys.add('phone_mount');
    if (value.rear !== 'none') keys.add('rack');
    if (value.rear === 'delivery') keys.add('delivery');
    if (value.trim !== 'stock') for (const part of ['grip', 'deck', 'front', 'rear']) keys.add(`trim_${value.trim}_${part}`);
    if (value.lighting !== 'off') keys.add('light_' + value.lighting);
    if (value.decal === 'stripes') keys.add('stripes');
    return keys;
}
