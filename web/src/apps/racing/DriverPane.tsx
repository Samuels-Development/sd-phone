import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { t } from '@/i18n';
import { colorFor, initialsFor } from '@/lib/format';
import { ContactAvatar } from '@/shared/ContactAvatar';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { PromptDialog } from '@/ui/PromptDialog';
import { Scroller } from '@/ui/Scroller';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Slider } from '@/ui/Slider';
import { panePad } from '@/ui/surfaces';
import { useSessionState } from '@/hooks/useSessionState';

import { HUD_POSITIONS, HUD_SCALE_MAX, HUD_SCALE_MIN, HUD_STYLES, clampHudScale } from './data';
import type { HudPosition, HudSettings, HudStyle } from './data';
import { HudPreview } from './hud/HudPreview';
import { racingSetAlias, racingSetAvatar, racingSetHud } from './racingApi';
import { racingAccentFill, racingSegmented, racingStat, racingStatLabel } from './racingTheme';
import { useRacingSession } from './useRacingSession';

const ALIAS_MIN = 3;
const ALIAS_MAX = 16;
const AVATAR_MAX = 500;

const INERT_POSITION: HudPosition = 'middle-center';
const SCALE_STEP = 0.05;
const SCALE_SAVE_DELAY = 400;

const HUD_COLORS: readonly string[] = [
    '#0BF2B4', '#FFD60A', '#FF453A', '#0A84FF', '#BF5AF2', '#34C759', '#FF9F0A', '#FFFFFF',
];

function styleLabel(style: HudStyle): string {
    if (style === 'simple')   return t('racing.hudStyleSimple', 'Simple');
    if (style === 'advanced') return t('racing.hudStyleAdvanced', 'Advanced');
    return t('racing.hudStyleCasual', 'Casual');
}

function positionLabel(position: HudPosition): string {
    switch (position) {
        case 'top-left':      return t('racing.hudTopLeft', 'Top left');
        case 'top-center':    return t('racing.hudTopCentre', 'Top centre');
        case 'top-right':     return t('racing.hudTopRight', 'Top right');
        case 'middle-left':   return t('racing.hudMiddleLeft', 'Middle left');
        case 'middle-center': return t('racing.hudMiddleCentre', 'Middle centre');
        case 'middle-right':  return t('racing.hudMiddleRight', 'Middle right');
        case 'bottom-left':   return t('racing.hudBottomLeft', 'Bottom left');
        case 'bottom-center': return t('racing.hudBottomCentre', 'Bottom centre');
        default:              return t('racing.hudBottomRight', 'Bottom right');
    }
}

function SettingRow({ label, hint, divider, children }: {
    label:    string;
    hint?:    string;
    divider?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="relative px-4 py-3">
            <div className="flex items-center gap-4">
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[17px] font-normal text-black dark:text-white">{label}</span>
                    {hint && <span className="text-[13.5px] text-ios-gray">{hint}</span>}
                </div>
                <div className="shrink-0">{children}</div>
            </div>
            {divider && (
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </div>
    );
}

function HudPositionGrid({ value, onChange }: { value: HudPosition; onChange: (position: HudPosition) => void }) {
    return (
        <div className="grid w-[186px] grid-cols-3 gap-1.5">
            {HUD_POSITIONS.map(position => {
                const inert = position === INERT_POSITION;
                const active = position === value;
                const tone = inert
                    ? 'cursor-default bg-black/[0.03] dark:bg-white/[0.04]'
                    : active
                        ? racingAccentFill
                        : 'bg-black/[0.07] hover:bg-black/[0.12] dark:bg-white/[0.10] dark:hover:bg-white/[0.16]';
                return (
                    <button
                        key={position}
                        type="button"
                        disabled={inert}
                        aria-label={positionLabel(position)}
                        aria-pressed={active}
                        onClick={() => onChange(position)}
                        className={`flex h-9 items-center justify-center rounded-[7px] transition-colors duration-150 ${tone}`}
                    >
                        {inert && <span className="h-[4px] w-[4px] rounded-full bg-black/25 dark:bg-white/30" />}
                    </button>
                );
            })}
        </div>
    );
}

function HudColourRow({ label, value, divider, onChange }: {
    label:    string;
    value:    string;
    divider?: boolean;
    onChange: (color: string) => void;
}) {
    const current = value.trim().toUpperCase();
    return (
        <SettingRow label={label} divider={divider}>
            <div className="flex items-center gap-2">
                {HUD_COLORS.map(color => {
                    const active = color.toUpperCase() === current;
                    return (
                        <button
                            key={color}
                            type="button"
                            aria-label={t('racing.colourSwatch', 'Colour {hex}', { hex: color })}
                            aria-pressed={active}
                            onClick={() => onChange(color)}
                            className="h-[26px] w-[26px] shrink-0 rounded-full ring-1 ring-inset ring-black/15 transition-transform duration-150 hover:scale-110 dark:ring-white/20"
                            style={{
                                background: color,
                                boxShadow:  active ? `0 0 0 2.5px ${color}, 0 0 0 4px rgba(0,0,0,0.4)` : undefined,
                            }}
                        />
                    );
                })}
            </div>
        </SettingRow>
    );
}

export function DriverPane() {
    const { me, hud, setHud, refresh } = useRacingSession();

    const [draft, setDraft] = useSessionState<HudSettings | null>('racing:driver:draft', null);
    const [prompt, setPrompt] = useState<'alias' | 'avatar' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const pendingRef = useRef<HudSettings | null>(null);
    const timerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    }, []);

    const changeHud = useCallback((next: HudSettings, delay = 0) => {
        setDraft(next);
        setHud(next);
        pendingRef.current = next;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            const payload = pendingRef.current;
            if (!payload) return;
            void racingSetHud(payload).then(envelope => {
                setError(envelope.success
                    ? null
                    : envelope.message ?? t('racing.hudSaveFailed', 'Those HUD settings could not be saved.'));
            });
        }, delay);
    }, [setDraft, setHud]);

    const clearIdentity = useCallback((pending: Promise<{ success: boolean; message?: string }>) => {
        void pending.then(envelope => {
            if (!envelope.success) {
                setError(envelope.message ?? t('racing.identityFailed', 'That change could not be saved.'));
                return;
            }
            setError(null);
            refresh();
        });
    }, [refresh]);

    const settings = draft ?? hud;
    const displayName = me?.alias?.trim() || me?.name || '';
    const aliasValue = me?.alias?.trim() ?? '';
    const avatarValue = me?.avatar?.trim() ?? '';

    return (
        <Scroller className={`min-h-0 flex-1 ${panePad} pb-8`}>
            <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
                <div className="flex items-center gap-5 px-4">
                    <ContactAvatar
                        size={64}
                        contact={{
                            name:     displayName,
                            initials: initialsFor(displayName),
                            color:    colorFor(me?.citizenid ?? displayName),
                            avatar:   me?.avatar ?? undefined,
                        }}
                    />
                    <div className="flex min-w-0 flex-1 gap-9">
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className={`truncate ${racingStat}`}>{me?.mmr ?? 0}</span>
                            <span className={`truncate ${racingStatLabel}`}>{t('racing.mmr', 'MMR')}</span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className={`truncate ${racingStat}`}>
                                {me?.rank == null ? t('racing.none', 'None') : `#${me.rank}`}
                            </span>
                            <span className={`truncate ${racingStatLabel}`}>{t('racing.rank', 'Rank')}</span>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="px-7 text-[13.5px] font-medium text-ios-red">{error}</div>
                )}

                <ListGroup
                    header={t('racing.identity', 'Identity')}
                    footer={t('racing.identityFooter', 'Your alias replaces your name on the leaderboard and in race standings.')}
                >
                    <ListRow
                        label={t('racing.alias', 'Alias')}
                        value={aliasValue || t('racing.notSet', 'Not set')}
                        chevron
                        divider
                        onPress={() => setPrompt('alias')}
                    />
                    <ListRow
                        label={t('racing.profilePicture', 'Profile picture')}
                        value={avatarValue ? t('racing.avatarSet', 'Set') : t('racing.notSet', 'Not set')}
                        chevron
                        divider={!!aliasValue || !!avatarValue}
                        onPress={() => setPrompt('avatar')}
                    />
                    {!!aliasValue && (
                        <ListRow
                            label={t('racing.removeAlias', 'Remove alias')}
                            destructive
                            chevron={false}
                            divider={!!avatarValue}
                            onPress={() => clearIdentity(racingSetAlias(''))}
                        />
                    )}
                    {!!avatarValue && (
                        <ListRow
                            label={t('racing.removeAvatar', 'Remove picture')}
                            destructive
                            chevron={false}
                            onPress={() => clearIdentity(racingSetAvatar(''))}
                        />
                    )}
                </ListGroup>

                <ListGroup
                    header={t('racing.hud', 'Race HUD')}
                    footer={t('racing.hudFooter', 'Changes apply to the live HUD straight away.')}
                >
                    <div className="relative">
                        <HudPreview settings={settings} youName={me?.alias || me?.name} />
                        <div
                            className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                            style={{ height: '0.5px' }}
                        />
                    </div>

                    <SettingRow label={t('racing.hudStyle', 'Style')} divider>
                        <SegmentedControl
                            className={`w-[268px] ${racingSegmented}`}
                            value={settings.style}
                            onChange={style => changeHud({ ...settings, style })}
                            options={HUD_STYLES.map(style => ({ value: style, label: styleLabel(style) }))}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('racing.hudPosition', 'Screen position')}
                        hint={positionLabel(settings.position)}
                        divider
                    >
                        <HudPositionGrid
                            value={settings.position}
                            onChange={position => changeHud({ ...settings, position })}
                        />
                    </SettingRow>

                    <SettingRow
                        label={t('racing.hudScale', 'Size')}
                        hint={t('racing.hudScaleValue', '{scale}x', { scale: settings.scale.toFixed(2) })}
                        divider
                    >
                        <Slider
                            className="w-[220px]"
                            value={settings.scale}
                            min={HUD_SCALE_MIN}
                            max={HUD_SCALE_MAX}
                            step={SCALE_STEP}
                            ariaLabel={t('racing.hudScale', 'Size')}
                            onChange={scale => changeHud({ ...settings, scale: clampHudScale(scale) }, SCALE_SAVE_DELAY)}
                        />
                    </SettingRow>

                    <HudColourRow
                        label={t('racing.hudCheckpointColour', 'Checkpoint colour')}
                        value={settings.checkpointColor}
                        divider
                        onChange={checkpointColor => changeHud({ ...settings, checkpointColor })}
                    />

                    <HudColourRow
                        label={t('racing.hudClosestColour', 'Next checkpoint colour')}
                        value={settings.closestColor}
                        divider
                        onChange={closestColor => changeHud({ ...settings, closestColor })}
                    />

                    <ToggleRow
                        label={t('racing.hudInAir', 'In-air waypoints')}
                        on={settings.inAirWaypoints}
                        onToggle={() => changeHud({ ...settings, inAirWaypoints: !settings.inAirWaypoints })}
                    />
                </ListGroup>
            </div>

            {prompt === 'alias' && (
                <PromptDialog
                    title={t('racing.setAlias', 'Racing alias')}
                    message={t('racing.setAliasSub', 'Between {min} and {max} characters.', { min: ALIAS_MIN, max: ALIAS_MAX })}
                    label={t('racing.alias', 'Alias')}
                    placeholder={t('racing.aliasPlaceholder', 'Pick a name to race under')}
                    initialValue={aliasValue}
                    maxLength={ALIAS_MAX}
                    validate={value => (value.length < ALIAS_MIN || value.length > ALIAS_MAX
                        ? t('racing.aliasInvalid', 'An alias has to be between {min} and {max} characters.', { min: ALIAS_MIN, max: ALIAS_MAX })
                        : null)}
                    onCancel={() => setPrompt(null)}
                    onConfirm={async value => {
                        const envelope = await racingSetAlias(value);
                        if (!envelope.success) {
                            return envelope.message ?? t('racing.aliasFailed', 'That alias could not be saved.');
                        }
                        refresh();
                        return null;
                    }}
                />
            )}

            {prompt === 'avatar' && (
                <PromptDialog
                    title={t('racing.setAvatar', 'Profile picture')}
                    message={t('racing.setAvatarSub', 'Paste a direct link to an image.')}
                    label={t('racing.imageLink', 'Image link')}
                    placeholder="https://"
                    initialValue={avatarValue}
                    maxLength={AVATAR_MAX}
                    inputMode="url"
                    validate={value => (value.toLowerCase().startsWith('https://')
                        ? null
                        : t('racing.avatarInvalid', 'The link has to start with https://'))}
                    onCancel={() => setPrompt(null)}
                    onConfirm={async value => {
                        const envelope = await racingSetAvatar(value);
                        if (!envelope.success) {
                            return envelope.message ?? t('racing.avatarFailed', 'That picture could not be saved.');
                        }
                        refresh();
                        return null;
                    }}
                />
            )}
        </Scroller>
    );
}
