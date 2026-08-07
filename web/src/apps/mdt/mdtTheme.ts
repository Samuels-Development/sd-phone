import type { PillTone } from '@/ui/Pill';
import { cardSurface, columnTitle, fieldArea, fieldBase, fieldClass, panePad, refText, rowBody,
         rowHover, rowMeta, rowTitle, ruleX, ruleY, sectionHeader, surfaceBackdrop } from '@/ui/surfaces';

export const MDT_STATUS_RESERVE = 54;

export const MDT_RAIL_W = 236;
export const MDT_RAIL_W_COLLAPSED = 68;

export const MDT_ACCENT = '#1d4ed8';

export const mdtBackdrop = surfaceBackdrop;

export const mdtCardSurface = cardSurface;

export const mdtRuleX = ruleX;
export const mdtRuleY = ruleY;

export const mdtPanePad = panePad;

export const mdtViewEnter = 'animate-mdt-pane';

export const mdtSectionHeader = sectionHeader;
export const mdtColumnTitle = columnTitle;
export const mdtRowTitle = rowTitle;
export const mdtRowBody = rowBody;
export const mdtRowMeta = rowMeta;
export const mdtRef = refText;

export const mdtSegmented = '[&>button]:flex-auto [&>button]:min-w-0 [&>button]:truncate [&>button]:px-2';
export const mdtSegmentedDense = '[&>button]:flex-auto [&>button]:min-w-0 [&>button]:truncate [&>button]:px-1 [&>button]:text-[13px]';

export const mdtRowHover = rowHover;

export const mdtFieldBase = fieldBase;

export const mdtFieldClass = fieldClass;
export const mdtFieldArea = fieldArea;

export const STATUS_TONE: Record<string, PillTone> = {
    open:        'blue',
    in_progress: 'orange',
    closed:      'green',
    active:      'red',
    expired:     'orange',
    valid:       'green',
    suspended:   'orange',
    impounded:   'red',
    low:         'green',
    medium:      'orange',
    high:        'red',
    suspect:     'red',
    victim:      'blue',
    witness:     'orange',
    primary:     'blue',
    assisting:   'green',
    supervisor:  'orange',
    felony:      'red',
    misdemeanor: 'orange',
    infraction:  'blue',
    wanted:         'red',
    armed:          'red',
    gang:           'orange',
    mental_health:  'orange',
    flight_risk:    'orange',
    informant:      'blue',
};
