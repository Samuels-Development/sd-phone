import { t } from '@/i18n';

type TextVars = Record<string, string | number>;

export function localizeShareVars(key: string | undefined, vars?: TextVars): TextVars | undefined {
    if (!vars || !['share.acceptedYourShare', 'share.declinedYourShare',
        'share.couldNotSaveYourShare', 'share.couldNotSaveSharedItem'].includes(key ?? '')) return vars;
    let kind: string;
    switch (vars.kind) {
        case 'contact': kind = t('share.kindContact', 'contact'); break;
        case 'voice memo': kind = t('share.kindVoice', 'voice memo'); break;
        case 'note': kind = t('share.kindNote', 'note'); break;
        case 'map pin': kind = t('share.kindPin', 'map pin'); break;
        case 'song': kind = t('share.kindSong', 'song'); break;
        case 'playlist': kind = t('share.kindPlaylist', 'playlist'); break;
        case 'document': kind = t('share.kindDocument', 'document'); break;
        case 'photo': kind = t('share.kindPhoto', 'photo'); break;
        case 'signature request': kind = t('share.kindSignatureRequest', 'signature request'); break;
        case 'ID card': kind = t('share.kindIdCard', 'ID card'); break;
        case 'Photogram profile': kind = t('share.kindPhotogramProfile', 'Photogram profile'); break;
        default: return vars;
    }
    return { ...vars, kind };
}

export function phoneColorLabel(color: string): string {
    switch (color) {
        case 'black': return t('settings.phoneColorBlack', 'Black');
        case 'blue': return t('settings.phoneColorBlue', 'Blue');
        case 'green': return t('settings.phoneColorGreen', 'Green');
        case 'orange': return t('settings.phoneColorOrange', 'Orange');
        case 'pink': return t('settings.phoneColorPink', 'Pink');
        case 'purple': return t('settings.phoneColorPurple', 'Purple');
        case 'red': return t('settings.phoneColorRed', 'Red');
        case 'yellow': return t('settings.phoneColorYellow', 'Yellow');
        default: return color.charAt(0).toUpperCase() + color.slice(1);
    }
}
