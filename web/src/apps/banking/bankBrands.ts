import { t } from '@/i18n';

export interface CardColor {
    id:         string;
    label:      string;
    swatch:     string;
    background: string;
    shadow:     string;
    stroke:     string;
    glow:       string;
}

export interface CardPattern {
    id:          string;
    label:       string;
    w:           number;
    h:           number;
    d:           string;
    strokeWidth: number;
    opacity:     number;
}

export interface BankBrand {
    id:       string;
    wordmark: string;
    color:    string;
    pattern:  string;
}

export interface CardStyle {
    bank:    string;
    color:   string;
    pattern: string;
}

export const CARD_COLORS: readonly CardColor[] = [
    {
        id: 'emerald', label: 'Emerald', swatch: '#127A56',
        background: 'radial-gradient(125% 135% at 12% 8%, #1C8A60 0%, #0F6043 34%, #0A3F2D 68%, #062018 100%)',
        shadow: '0 4px 14px rgba(4,40,28,0.22), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#CFF5E4', glow: '#9BEFC9',
    },
    {
        id: 'crimson', label: 'Crimson', swatch: '#B32C22',
        background: 'radial-gradient(125% 135% at 12% 8%, #C0392B 0%, #8E1B1B 34%, #4A0F0F 68%, #190606 100%)',
        shadow: '0 4px 14px rgba(48,8,8,0.26), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#FFD9D6', glow: '#FF9A94',
    },
    {
        id: 'cobalt', label: 'Cobalt', swatch: '#1C64C4',
        background: 'radial-gradient(125% 135% at 12% 8%, #2276DC 0%, #14509E 34%, #0C2F62 68%, #050F24 100%)',
        shadow: '0 4px 14px rgba(6,26,58,0.26), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#D6E8FF', glow: '#8FC0FF',
    },
    {
        id: 'navy', label: 'Navy', swatch: '#233F6D',
        background: 'radial-gradient(125% 135% at 12% 8%, #2B5089 0%, #172E55 34%, #0D1B33 68%, #04080F 100%)',
        shadow: '0 4px 14px rgba(6,14,30,0.28), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#EEDCAC', glow: '#D9BE72',
    },
    {
        id: 'bronze', label: 'Bronze', swatch: '#A5732F',
        background: 'radial-gradient(125% 135% at 12% 8%, #C08A3E 0%, #8A5C24 34%, #513614 68%, #1F1406 100%)',
        shadow: '0 4px 14px rgba(40,24,6,0.26), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#F7E7C6', glow: '#E5C489',
    },
    {
        id: 'graphite', label: 'Graphite', swatch: '#3E434A',
        background: 'radial-gradient(125% 135% at 12% 8%, #4A4F57 0%, #33373D 34%, #1E2126 68%, #0B0C0E 100%)',
        shadow: '0 4px 14px rgba(10,12,15,0.30), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#E4E7EB', glow: '#B9C0C9',
    },
    {
        id: 'teal', label: 'Teal', swatch: '#0E7A72',
        background: 'radial-gradient(125% 135% at 12% 8%, #12897F 0%, #0B5F59 34%, #073E3A 68%, #041F1D 100%)',
        shadow: '0 4px 14px rgba(4,34,32,0.24), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#CFF6F2', glow: '#8FE8DE',
    },
    {
        id: 'violet', label: 'Violet', swatch: '#6B3CAD',
        background: 'radial-gradient(125% 135% at 12% 8%, #7A45C4 0%, #572E90 34%, #351B58 68%, #150A24 100%)',
        shadow: '0 4px 14px rgba(24,10,44,0.28), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#ECDCFF', glow: '#C3A0F5',
    },
    {
        id: 'slate', label: 'Slate', swatch: '#4A6079',
        background: 'radial-gradient(125% 135% at 12% 8%, #56708C 0%, #3C5068 34%, #253243 68%, #0E141C 100%)',
        shadow: '0 4px 14px rgba(12,20,30,0.26), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#DFE9F3', glow: '#A9C2DB',
    },
    {
        id: 'amber', label: 'Amber', swatch: '#B8761F',
        background: 'radial-gradient(125% 135% at 12% 8%, #E0913B 0%, #B06A18 34%, #6B3F0C 68%, #291704 100%)',
        shadow: '0 4px 14px rgba(50,28,4,0.26), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#FFEBCF', glow: '#FFCB8A',
    },
    {
        id: 'rose', label: 'Rose', swatch: '#BE3F6B',
        background: 'radial-gradient(125% 135% at 12% 8%, #D6537F 0%, #A33459 34%, #631F36 68%, #290B16 100%)',
        shadow: '0 4px 14px rgba(48,10,24,0.26), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#FFDCE8', glow: '#FFA6C2',
    },
    {
        id: 'midnight', label: 'Midnight', swatch: '#1B1D21',
        background: 'radial-gradient(125% 135% at 12% 8%, #2A2D33 0%, #1A1C20 34%, #0E0F12 68%, #030304 100%)',
        shadow: '0 4px 14px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#DDE1E8', glow: '#9AA3B0',
    },
    {
        id: 'mint', label: 'Mint', swatch: '#23A077',
        background: 'radial-gradient(125% 135% at 12% 8%, #35B98D 0%, #1E8A67 34%, #115B44 68%, #062B20 100%)',
        shadow: '0 4px 14px rgba(6,44,32,0.24), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#DBFCEF', glow: '#A6F2D2',
    },
    {
        id: 'burgundy', label: 'Burgundy', swatch: '#7A1C36',
        background: 'radial-gradient(125% 135% at 12% 8%, #8E2340 0%, #6A162E 34%, #400C1C 68%, #1A040B 100%)',
        shadow: '0 4px 14px rgba(34,6,14,0.28), inset 0 1px 0 rgba(255,255,255,0.14)',
        stroke: '#FFD9E2', glow: '#E8879F',
    },
];

export const CARD_PATTERNS: readonly CardPattern[] = [
    { id: 'wave',       label: 'Waves',      w: 38, h: 11, strokeWidth: 0.5,  opacity: 0.14, d: 'M0 5.5 Q 9.5 0 19 5.5 T 38 5.5' },
    { id: 'meander',    label: 'Maze',       w: 22, h: 22, strokeWidth: 0.85, opacity: 0.16, d: 'M3 3 H19 V19 H7 V7 H15 V15 H11' },
    { id: 'pinstripe',  label: 'Pinstripe',  w: 9,  h: 9,  strokeWidth: 0.55, opacity: 0.18, d: 'M-1 10 L10 -1 M3 12 L12 3' },
    { id: 'guilloche',  label: 'Guilloche',  w: 34, h: 34, strokeWidth: 0.5,  opacity: 0.22, d: 'M17 3 A14 14 0 1 1 16.9 3 M17 8 A9 9 0 1 1 16.9 8 M17 13 A4 4 0 1 1 16.9 13' },
    { id: 'crosshatch', label: 'Crosshatch', w: 11, h: 11, strokeWidth: 0.5,  opacity: 0.20, d: 'M-1 12 L12 -1 M-1 -1 L12 12' },
    { id: 'chevron',    label: 'Chevron',    w: 16, h: 8,  strokeWidth: 0.6,  opacity: 0.15, d: 'M0 8 L8 0 L16 8' },
    { id: 'dots',       label: 'Dots',       w: 12, h: 12, strokeWidth: 1.4,  opacity: 0.22, d: 'M6 5.3 A0.7 0.7 0 1 1 5.9 5.3' },
    { id: 'grid',       label: 'Grid',       w: 12, h: 12, strokeWidth: 0.5,  opacity: 0.16, d: 'M0 0 H12 M0 0 V12' },
    { id: 'diamond',    label: 'Diamond',    w: 12, h: 12, strokeWidth: 0.55, opacity: 0.16, d: 'M6 0 L12 6 L6 12 L0 6 Z' },
    { id: 'scales',     label: 'Scales',     w: 16, h: 8,  strokeWidth: 0.55, opacity: 0.15, d: 'M0 8 A8 8 0 0 1 16 8 M-8 0 A8 8 0 0 1 8 0 M8 0 A8 8 0 0 1 24 0' },
    { id: 'topo',       label: 'Contour',    w: 40, h: 22, strokeWidth: 0.5,  opacity: 0.16, d: 'M0 11 Q10 3 20 11 T40 11 M0 19 Q10 11 20 19 T40 19 M0 3 Q10 -5 20 3 T40 3' },
    { id: 'circuit',    label: 'Circuit',    w: 20, h: 20, strokeWidth: 0.6,  opacity: 0.18, d: 'M0 10 H6 M6 10 V4 M6 4 H14 M14 4 V16 M14 16 H20 M10 20 V14 M10 14 H6' },
    { id: 'carbon',     label: 'Carbon',     w: 8,  h: 8,  strokeWidth: 0.45, opacity: 0.14, d: 'M0 0 H4 V4 H0 Z M4 4 H8 V8 H4 Z' },
    { id: 'none',       label: 'Plain',      w: 10, h: 10, strokeWidth: 0,    opacity: 0,    d: '' },
];

export const BANK_BRANDS: readonly BankBrand[] = [
    { id: 'fleeca',  wordmark: 'Fleeca',           color: 'emerald', pattern: 'wave' },
    { id: 'maze',    wordmark: 'Maze Bank',        color: 'crimson', pattern: 'meander' },
    { id: 'lombank', wordmark: 'Lombank',          color: 'cobalt',  pattern: 'pinstripe' },
    { id: 'pacific', wordmark: 'Pacific Standard', color: 'navy',    pattern: 'guilloche' },
    { id: 'blaine',  wordmark: 'Blaine County',    color: 'bronze',  pattern: 'crosshatch' },
];

export const DEFAULT_BANK = BANK_BRANDS[0];

export function bankBrand(id: string | undefined): BankBrand {
    return BANK_BRANDS.find(b => b.id === id) ?? DEFAULT_BANK;
}

export function cardColor(id: string | undefined): CardColor {
    return CARD_COLORS.find(c => c.id === id) ?? CARD_COLORS[0];
}

export function cardPattern(id: string | undefined): CardPattern {
    return CARD_PATTERNS.find(p => p.id === id) ?? CARD_PATTERNS[0];
}

export function cardColorLabel(color: CardColor): string {
    switch (color.id) {
        case 'emerald':   return t('banking.cardColorEmerald', 'Emerald');
        case 'crimson':   return t('banking.cardColorCrimson', 'Crimson');
        case 'cobalt':    return t('banking.cardColorCobalt', 'Cobalt');
        case 'navy':      return t('banking.cardColorNavy', 'Navy');
        case 'bronze':    return t('banking.cardColorBronze', 'Bronze');
        case 'graphite':  return t('banking.cardColorGraphite', 'Graphite');
        case 'teal':      return t('banking.cardColorTeal', 'Teal');
        case 'violet':    return t('banking.cardColorViolet', 'Violet');
        case 'slate':     return t('banking.cardColorSlate', 'Slate');
        case 'amber':     return t('banking.cardColorAmber', 'Amber');
        case 'rose':      return t('banking.cardColorRose', 'Rose');
        case 'midnight':  return t('banking.cardColorMidnight', 'Midnight');
        case 'mint':      return t('banking.cardColorMint', 'Mint');
        case 'burgundy':  return t('banking.cardColorBurgundy', 'Burgundy');
        default:          return color.label;
    }
}

export function cardPatternLabel(pattern: CardPattern): string {
    switch (pattern.id) {
        case 'wave':        return t('banking.cardPatternWaves', 'Waves');
        case 'meander':     return t('banking.cardPatternMaze', 'Maze');
        case 'pinstripe':   return t('banking.cardPatternPinstripe', 'Pinstripe');
        case 'guilloche':   return t('banking.cardPatternGuilloche', 'Guilloche');
        case 'crosshatch':  return t('banking.cardPatternCrosshatch', 'Crosshatch');
        case 'chevron':     return t('banking.cardPatternChevron', 'Chevron');
        case 'dots':        return t('banking.cardPatternDots', 'Dots');
        case 'grid':        return t('banking.cardPatternGrid', 'Grid');
        case 'diamond':     return t('banking.cardPatternDiamond', 'Diamond');
        case 'scales':      return t('banking.cardPatternScales', 'Scales');
        case 'topo':        return t('banking.cardPatternContour', 'Contour');
        case 'circuit':     return t('banking.cardPatternCircuit', 'Circuit');
        case 'carbon':      return t('banking.cardPatternCarbon', 'Carbon');
        case 'none':        return t('banking.cardPatternPlain', 'Plain');
        default:            return pattern.label;
    }
}

export function presetFor(bankId: string | undefined): CardStyle {
    const bank = bankBrand(bankId);
    return { bank: bank.id, color: bank.color, pattern: bank.pattern };
}

export function resolveStyle(style: Partial<CardStyle> | null | undefined): CardStyle {
    const bank = bankBrand(style?.bank);
    return {
        bank:    bank.id,
        color:   CARD_COLORS.some(c => c.id === style?.color) ? style!.color! : bank.color,
        pattern: CARD_PATTERNS.some(p => p.id === style?.pattern) ? style!.pattern! : bank.pattern,
    };
}

export function isPreset(style: CardStyle): boolean {
    const bank = bankBrand(style.bank);
    return style.color === bank.color && style.pattern === bank.pattern;
}
