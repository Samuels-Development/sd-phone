import { t } from '@/i18n';
import { PHOTO_STICKER, stickersOf, type Design, type Sticker, type TrimKind } from './casesApi';

export interface PartLabels {
    style:     Record<string, string>;
    pattern:   Record<string, string>;
    accessory: Record<string, string>;
    charm:     Record<string, string>;
    sticker:   Record<string, string>;
}

/** Brand stickers carry the in-game companies' own names, which stay the same in every language. */
const BRAND_NAMES: Record<string, string> = {
    sprunk: 'Sprunk', pisswasser: 'Pisswasser', ammunation: 'Ammu-Nation', lscustoms: 'Los Santos Customs',
    weazel: 'Weazel', binco: 'Binco', ponsonbys: 'Ponsonbys', suburban: 'Suburban', bleeter: 'Bleeter',
    eyefind: 'Eyefind', whiz: 'Whiz', fruit: 'Fruit', maibatsu: 'Maibatsu', vapid: 'Vapid',
    ubermacht: 'Ubermacht', brute: 'Brute', ron: 'RON', bf: 'BF', betta: 'Betta', tinkle: 'Tinkle',
    badger: 'Badger', cnt: 'CNT', schyster: 'Schyster', shark: 'Shark', hvy: 'HVY', ltd: 'LTD',
    crevis: 'Crevis', bittersweet: 'BitterSweet', vomfeuer: 'Vom Feuer', shrewsbury: 'Shrewsbury',
    peckerwood: 'Peckerwood', zit: 'Zit',
};

/** Display names for every part id the server sells. Built per call so a language change shows. */
export function partLabels(): PartLabels {
    return {
        style: {
            slim:    t('cases.styleSlim', 'Slim'),
            gloss:   t('cases.styleGloss', 'Gloss'),
            fabric:  t('cases.styleFabric', 'Fabric'),
            leather: t('cases.styleLeather', 'Leather'),
            wallet:  t('cases.styleWallet', 'Wallet'),
            rugged:  t('cases.styleRugged', 'Rugged'),
            bumper:  t('cases.styleBumper', 'Bumper'),
        },
        pattern: {
            stripes:  t('cases.patternStripes', 'Stripes'),
            bands:    t('cases.patternBands', 'Bands'),
            diagonal: t('cases.patternDiagonal', 'Diagonal'),
            split:    t('cases.patternSplit', 'Split'),
            slash:    t('cases.patternSlash', 'Slash'),
            dots:     t('cases.patternDots', 'Dots'),
            checker:  t('cases.patternChecker', 'Checker'),
            chevron:  t('cases.patternChevron', 'Chevron'),
            belt:     t('cases.patternBelt', 'Belt'),
            waves:    t('cases.patternWaves', 'Waves'),
            carbon:   t('cases.patternCarbon', 'Carbon'),
            camo:     t('cases.patternCamo', 'Camo'),
            marble:   t('cases.patternMarble', 'Marble'),
            hex:      t('cases.patternHex', 'Hex'),
            topo:     t('cases.patternTopo', 'Topo'),
            splatter: t('cases.patternSplatter', 'Splatter'),
        },
        accessory: {
            grip: t('cases.accessoryGrip', 'Grip'),
            ring: t('cases.accessoryRing', 'Ring'),
            loop: t('cases.accessoryLoop', 'Loop'),
        },
        charm: {
            lanyard: t('cases.charmLanyard', 'Lanyard'),
            pearls:  t('cases.charmPearls', 'Pearls'),
            beads:   t('cases.charmBeads', 'Beads'),
            star:    t('cases.charmStar', 'Star'),
            heart:   t('cases.charmHeart', 'Heart'),
            moon:    t('cases.charmMoon', 'Moon'),
            bolt:    t('cases.charmBolt', 'Bolt'),
            gem:     t('cases.charmGem', 'Gem'),
            dice:    t('cases.charmDice', 'Dice'),
            bell:    t('cases.charmBell', 'Bell'),
            coin:    t('cases.charmCoin', 'Coin'),
            tag:     t('cases.charmTag', 'Tag'),
            pompom:  t('cases.charmPompom', 'Pom-pom'),
            tassel:  t('cases.charmTassel', 'Tassel'),
        },
        sticker: {
            ...BRAND_NAMES,
            photo:     t('cases.photoSticker', 'Photo sticker'),
            star:      t('cases.stickerStar', 'Star'),
            heart:     t('cases.stickerHeart', 'Heart'),
            skull:     t('cases.stickerSkull', 'Skull'),
            flame:     t('cases.stickerFlame', 'Flame'),
            zap:       t('cases.stickerZap', 'Zap'),
            smile:     t('cases.stickerSmile', 'Smile'),
            crown:     t('cases.stickerCrown', 'Crown'),
            ghost:     t('cases.stickerGhost', 'Ghost'),
            rocket:    t('cases.stickerRocket', 'Rocket'),
            music:     t('cases.stickerMusic', 'Music'),
            gamepad_2: t('cases.stickerGamepad', 'Gamepad'),
            paw_print: t('cases.stickerPaw', 'Paw'),
            moon:      t('cases.stickerMoon', 'Moon'),
            sun:       t('cases.stickerSun', 'Sun'),
            cherry:    t('cases.stickerCherry', 'Cherry'),
            gem:       t('cases.stickerGem', 'Gem'),
        },
    };
}

/** One line on what each style is, shown under the style grid. */
export function styleBlurbs(): Record<string, string> {
    return {
        slim:    t('cases.blurbSlim', 'Thin matte shell that adds almost no bulk'),
        gloss:   t('cases.blurbGloss', 'Thin shell with a polished, shiny finish'),
        fabric:  t('cases.blurbFabric', 'Woven fabric over a hard shell'),
        leather: t('cases.blurbLeather', 'Grained leather with a soft feel'),
        wallet:  t('cases.blurbWallet', 'Leather with a card pocket on the back'),
        rugged:  t('cases.blurbRugged', 'Textured rubber with padded corners'),
        bumper:  t('cases.blurbBumper', 'A frame around the edges, the back left bare'),
    };
}

export function logoLabels(): Record<string, string> {
    return {
        sd:      t('cases.logoSd', 'SD'),
        ifruit:  t('cases.logoIfruit', 'iFruit'),
        generic: t('cases.logoGeneric', 'Plain Ring'),
    };
}

export function trimLabels(): Record<TrimKind, { name: string; blurb: string }> {
    return {
        rings:   { name: t('cases.trimRings', 'Lens Rings'), blurb: t('cases.trimRingsBlurb', 'A coloured ring round each lens.') },
        bezel:   { name: t('cases.trimBezel', 'Camera Surround'), blurb: t('cases.trimBezelBlurb', 'A coloured band round the cameras.') },
        buttons: { name: t('cases.trimButtons', 'Buttons'), blurb: t('cases.trimButtonsBlurb', 'Coloured side buttons. A case covers them.') },
    };
}

export function labelOf(map: Record<string, string>, id: string): string {
    return map[id] ?? id.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

export type PartKind = 'pattern' | 'accessory' | 'charm' | 'sticker';

/** A sticker's name; the photo sticker is the player's own photo. */
export function stickerName(labels: PartLabels, id: string): string {
    return id === PHOTO_STICKER ? t('cases.photoStickerName', 'Your photo') : labelOf(labels.sticker, id);
}

/** The stickers on a design in a few words: their names, or how many there are past two. */
function stickersSummary(labels: PartLabels, list: Sticker[]): string {
    return list.length > 2 ? t('cases.stickerCount', '{n} stickers', { n: list.length }) : list.map(s => stickerName(labels, s.id)).join(', ');
}

/** The extras on a design as chips: which part, its name, and its colour where it has one. */
export function designChips(labels: PartLabels, d: Design, palette: string[]): { kind: PartKind; name: string; hex?: string }[] {
    const out: { kind: PartKind; name: string; hex?: string }[] = [];
    if (d.pattern) out.push({ kind: 'pattern', name: labelOf(labels.pattern, d.pattern), hex: palette[d.patternColor ?? 0] });
    if (d.accessory) out.push({ kind: 'accessory', name: labelOf(labels.accessory, d.accessory), hex: palette[d.accessoryColor ?? 0] });
    if (d.charm) out.push({ kind: 'charm', name: labelOf(labels.charm, d.charm), hex: palette[d.charmColor ?? 0] });
    const stickers = stickersOf(d);
    if (stickers.length) out.push({ kind: 'sticker', name: stickersSummary(labels, stickers) });
    return out;
}

/** The extras on a design, by name, for a one-line summary under its style. */
export function designParts(labels: PartLabels, d: Design): string[] {
    const out: string[] = [];
    if (d.pattern) out.push(labelOf(labels.pattern, d.pattern));
    if (d.accessory) out.push(labelOf(labels.accessory, d.accessory));
    if (d.charm) out.push(labelOf(labels.charm, d.charm));
    const stickers = stickersOf(d);
    if (stickers.length) out.push(stickersSummary(labels, stickers));
    return out;
}
