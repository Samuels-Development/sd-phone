import { Check } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import { NavBar } from '@/ui/NavBar';
import { chassisMetrics } from '@/shell/chassis';
import { DEFAULT_FRAME_COLOR, frameStops } from '@/shell/frameColors';
import type { FacePart } from '@/shell/chassis';
import { SHELLS, shellsFor } from '@/shell/shells';
import type { Shell } from '@/shell/shells';

const LABEL: Record<string, string> = {
    ios:       t('settings.shellIos', 'Rounded'),
    android:   t('settings.shellAndroid', 'Flat'),
    edge:      t('settings.shellEdge', 'Slim'),
    classic:   t('settings.shellClassic', 'Classic'),
    compact:   t('settings.shellCompact', 'Compact'),
    droplet:   t('settings.shellDroplet', 'Droplet'),
    dual:      t('settings.shellDual', 'Dual'),
    rugged:    t('settings.shellRugged', 'Rugged'),
    gaming:    t('settings.shellGaming', 'Gaming'),
    waterfall: t('settings.shellWaterfall', 'Waterfall'),
};

const DESC: Record<string, string> = {
    ios:       t('settings.shellIosHint', 'Softly rounded rail with a pill cutout. The default look.'),
    android:   t('settings.shellAndroidHint', 'Flat matte sides, tighter corners and a small camera hole in the middle.'),
    edge:      t('settings.shellEdgeHint', 'The thinnest border of the lot, squared-off sides and a tiny pinhole camera.'),
    classic:   t('settings.shellClassicHint', 'Thicker border with a centred notch hanging from the top edge.'),
    compact:   t('settings.shellCompactHint', 'Wide top and bottom borders, with the camera outside the screen instead of in it.'),
    droplet:   t('settings.shellDropletHint', 'Barely-there borders and a tiny teardrop dipping down for the camera.'),
    dual:      t('settings.shellDualHint', 'The thinnest borders of the lot, with a wide twin-camera cutout in the middle.'),
    rugged:    t('settings.shellRuggedHint', 'Armoured body with a thick protective border, deep buttons and a spare side key.'),
    gaming:    t('settings.shellGamingHint', 'The boxiest of the set, with even borders and shoulder triggers down the right side.'),
    waterfall: t('settings.shellWaterfallHint', 'A near frameless body whose glass rolls over all four edges, with a ringed sensor pill and one orange power key.'),
};

const PREVIEW_H = 116;
const STATUS_ICONS = [
    { x: 333, w: 21 },
    { x: 360, w: 21 },
    { x: 387, w: 28 },
];

function FacePreview({ part, scale, px, rail }: {
    part:  FacePart;
    scale: number;
    px:    (v: number, min: number) => number;
    rail:  { s0: string; s45: string };
}) {
    if (part.t === 'slot') {
        const background =
            part.style === 'slits'
                ? `repeating-linear-gradient(90deg, ${part.color} 0 ${px(part.barW, 0.5)}px, transparent ${px(part.barW, 0.5)}px ${px(part.pitchX, 1.2)}px)`
          : part.style === 'dots'
                ? `radial-gradient(circle, ${part.color} 40%, transparent 45%)`
                : part.color;
        return (
            <div
                className="absolute"
                style={{
                    left: part.x * scale,
                    top: part.y * scale,
                    width: px(part.w, 2),
                    height: px(part.h, 1),
                    borderRadius: px(part.r, 0.5),
                    background,
                    backgroundSize: part.style === 'dots' ? `${px(part.pitchX, 1)}px ${px(part.pitchY, 1)}px` : undefined,
                }}
            />
        );
    }

    if (part.t === 'dot') {
        const d = px(part.r * 2, 1.5);
        return (
            <div
                className="absolute rounded-full"
                style={{
                    left: part.cx * scale - d / 2,
                    top: part.cy * scale - d / 2,
                    width: d,
                    height: d,
                    background: part.kind === 'screw' ? `linear-gradient(180deg, ${rail.s0}, ${rail.s45})` : part.color,
                    boxShadow: part.kind === 'led' ? `0 0 ${d * 1.6}px ${part.color}` : undefined,
                }}
            />
        );
    }

    return (
        <div
            className="absolute"
            style={{
                left: part.x * scale,
                top: part.y * scale,
                width: px(part.w, 3),
                height: px(part.h, 3),
                borderRadius: px(part.r, 1),
                background: 'rgba(0,0,0,0.32)',
                boxShadow: part.ring > 0 ? `inset 0 0 0 ${px(part.ring, 0.5)}px ${rail.s0}` : undefined,
            }}
        />
    );
}

function ShellPreview({ shell, frameColor }: { shell: Shell; frameColor: string }) {
    const m = chassisMetrics(shell);
    const rail = frameStops(frameColor, shell.finish);
    const scale = PREVIEW_H / m.H;
    const w = m.W * scale;
    const px = (v: number, min: number) => Math.max(min, v * scale);
    const railBg = `linear-gradient(105deg, ${rail.s0} 0%, ${rail.s20} 20%, ${rail.s45} 45%, ${rail.s68} 68%, ${rail.s100} 100%)`;
    const glassBg = (dir: string) =>
        `linear-gradient(${dir}, rgba(0,0,0,0.5) 0%, rgba(255,255,255,${m.GLASS_STRENGTH}) 14%, rgba(255,255,255,${m.GLASS_STRENGTH * 0.18}) 52%, rgba(255,255,255,0) 100%)`;

    return (
        <div className="relative shrink-0" style={{ width: w, height: PREVIEW_H }}>
            <div
                className="absolute inset-0"
                style={{
                    borderRadius: m.BR * scale,
                    background: railBg,
                    boxShadow: `inset 0 0 0 0.5px rgba(255,255,255,${m.MATTE ? 0.16 : 0.3}), 0 2px 6px rgba(0,0,0,0.35)`,
                }}
            />

            {m.PLATE && (
                <div
                    className="absolute"
                    style={{
                        left: m.RAIL_T * scale,
                        top: m.RAIL_T * scale,
                        width: (m.W - m.RAIL_T * 2) * scale,
                        height: (m.H - m.RAIL_T * 2) * scale,
                        borderRadius: Math.max(0, m.BR - m.RAIL_T) * scale,
                        background: m.PLATE,
                    }}
                />
            )}

            {m.CAP_COLOR && m.CAPS.map((cap, i) => (
                <div
                    key={i}
                    className="absolute"
                    style={{
                        left: cap.x * scale,
                        top: cap.y * scale,
                        width: cap.run * scale,
                        height: cap.run * scale,
                        background: m.CAP_COLOR ?? undefined,
                        borderTopLeftRadius:     cap.x === 0 && cap.y === 0 ? m.BR * scale : 0,
                        borderTopRightRadius:    cap.x > 0 && cap.y === 0 ? m.BR * scale : 0,
                        borderBottomLeftRadius:  cap.x === 0 && cap.y > 0 ? m.BR * scale : 0,
                        borderBottomRightRadius: cap.x > 0 && cap.y > 0 ? m.BR * scale : 0,
                    }}
                />
            ))}

            {m.MARKS.map((mark, i) => (
                <div
                    key={i}
                    className="absolute"
                    style={{
                        left: mark.x * scale,
                        top: mark.y * scale,
                        width: px(mark.w, 1),
                        height: px(mark.h, 1),
                        background: 'rgba(255,255,255,0.22)',
                    }}
                />
            ))}

            {m.GRIPS.map((grip, i) => (
                <div
                    key={i}
                    className="absolute"
                    style={{
                        left: grip.x * scale,
                        top: grip.y * scale,
                        width: px(grip.w, 1),
                        height: px(grip.h, 2),
                        background: `repeating-linear-gradient(180deg, rgba(0,0,0,0.28) 0 1px, transparent 1px ${px(grip.h / grip.ticks, 1.5)}px)`,
                    }}
                />
            ))}

            {m.RIM_PATH && (
                <div
                    className="absolute"
                    style={{
                        left: m.RIM_IN * scale,
                        top: m.RIM_IN * scale,
                        width: (m.W - m.RIM_IN * 2) * scale,
                        height: (m.H - m.RIM_IN * 2) * scale,
                        borderRadius: Math.max(0, m.BR - m.RIM_IN) * scale,
                        boxShadow: `inset 0 0 0 ${px(m.RIM_W, 0.5)}px ${m.RIM_COLOR ?? 'rgba(255,255,255,0.4)'}`,
                    }}
                />
            )}

            {m.BUTTONS.map((b, i) => {
                const bw = px(b.w, 2);
                return (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            left: b.side === 'left' ? 0.5 - bw : w - 0.5,
                            top: b.y * scale,
                            width: bw,
                            height: px(b.h, 2),
                            borderRadius: 1,
                            background: b.accent ?? `linear-gradient(180deg, ${rail.s0}, ${rail.s45})`,
                        }}
                    />
                );
            })}

            {m.FACE.map((part, i) => (
                <FacePreview key={i} part={part} scale={scale} px={px} rail={rail} />
            ))}

            {m.AUTO_FOREHEAD && (
                <>
                    <div
                        className="absolute rounded-full"
                        style={{
                            left: (m.W / 2 - 42) * scale,
                            top: (m.SY / 2) * scale - px(5, 1) / 2,
                            width: px(84, 4),
                            height: px(5, 1),
                            background: 'rgba(0,0,0,0.5)',
                        }}
                    />
                    <div
                        className="absolute rounded-full"
                        style={{
                            left: (m.W / 2 - 70) * scale - px(14, 3) / 2,
                            top: (m.SY / 2) * scale - px(14, 3) / 2,
                            width: px(14, 3),
                            height: px(14, 3),
                            background: '#0c0c14',
                        }}
                    />
                </>
            )}

            <div
                className="absolute overflow-hidden"
                style={{
                    left: m.SX * scale, top: m.SY * scale,
                    width: m.SW * scale, height: m.SH * scale,
                    borderRadius: m.SR * scale,
                    background: 'radial-gradient(120% 70% at 24% 6%, rgba(255,255,255,0.24), transparent 62%), linear-gradient(158deg, #5b64ab 0%, #2d3058 46%, #101223 100%)',
                }}
            >
                <div
                    className="absolute rounded-full"
                    style={{
                        left: 25 * scale,
                        top: 19 * scale,
                        width: px(55, 4),
                        height: px(17, 2),
                        background: 'rgba(255,255,255,0.78)',
                    }}
                />

                {STATUS_ICONS.map(icon => (
                    <div
                        key={icon.x}
                        className="absolute rounded-full"
                        style={{
                            left: icon.x * scale,
                            top: 17 * scale,
                            width: px(icon.w, 2),
                            height: px(20, 2),
                            background: 'rgba(255,255,255,0.78)',
                        }}
                    />
                ))}

                {m.hasCutout && !m.CUT_PATH && (
                    <div
                        className="absolute bg-[#08080c]"
                        style={{
                            left: (m.CUT_X - m.SX) * scale,
                            top: (m.CUT_Y - m.SY) * scale,
                            width: px(m.CUT_W, 2),
                            height: px(m.CUT_H, 2),
                            borderRadius: m.CUT_R * scale,
                            boxShadow: m.CUT_COLLAR > 0
                                ? `0 0 0 ${px(m.CUT_COLLAR, 0.5)}px rgba(200,200,210,0.9)`
                                : undefined,
                        }}
                    />
                )}

                {m.softPatch && (
                    <div
                        className="absolute"
                        style={{
                            left: (m.CUT_X - m.SX) * scale,
                            top: (m.CUT_Y - m.SY) * scale,
                            width: px(m.CUT_W, 3),
                            height: px(m.CUT_H, 3),
                            borderRadius: m.CUT_R * scale,
                            background: 'rgba(255,255,255,0.06)',
                            boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.12)',
                        }}
                    />
                )}

                {m.GLASS.map(band => (
                    <div
                        key={band.dir}
                        className="absolute"
                        style={{
                            left: (band.x - m.SX) * scale,
                            top: (band.y - m.SY) * scale,
                            width: px(band.w, 1),
                            height: px(band.h, 1),
                            background: glassBg(
                                band.dir === 'l' ? '90deg'
                              : band.dir === 'r' ? '270deg'
                              : band.dir === 't' ? '180deg'
                              : '0deg',
                            ),
                        }}
                    />
                ))}

                {m.CUT_PATH && (
                    <svg
                        className="absolute"
                        style={{ left: -m.SX * scale, top: -m.SY * scale }}
                        width={m.W * scale}
                        height={m.H * scale}
                        viewBox={`0 0 ${m.W} ${m.H}`}
                    >
                        <path d={m.CUT_PATH} fill="#08080c" />
                    </svg>
                )}

                <div
                    className="absolute rounded-full"
                    style={{
                        left: (m.SW / 2 - 70) * scale,
                        bottom: 8 * scale,
                        width: px(140, 8),
                        height: px(5, 1),
                        background: 'rgba(255,255,255,0.6)',
                    }}
                />
            </div>
        </div>
    );
}

export function PhoneShellPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { shell, setShell, shellsAllowed } = useTheme('shell', 'setShell', 'shellsAllowed');

    const options = shellsFor(device.id).filter(s => shellsAllowed.includes(s.id));
    const list = options.length ? options : SHELLS.filter(s => s.id === shell);

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar
                backLabel={t('settings.displayBrightness', 'Display')}
                onBack={goBack}
                title={t('settings.phoneShell', 'Phone Shell')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-3 px-4 pb-12">
                    {list.map(s => {
                        const selected = s.id === shell;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setShell(s.id)}
                                className={`flex items-center gap-4 rounded-[14px] bg-surface px-4 py-4 text-left active:opacity-70 ${selected ? 'ring-2 ring-ios-blue' : ''}`}
                            >
                                <ShellPreview shell={s} frameColor={DEFAULT_FRAME_COLOR} />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="text-[17px] font-semibold">{LABEL[s.id] ?? s.id}</span>
                                    <span className="text-[13px] leading-snug text-ios-gray">{DESC[s.id] ?? ''}</span>
                                </span>
                                {selected && (
                                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ios-blue">
                                        <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} />
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    <p className="mt-1 px-1 text-[12px] leading-snug text-ios-gray">
                        {t('settings.phoneShellHint', 'The shell changes the body of the phone only. The screen, your apps and everything on them stay exactly the same size.')}
                    </p>
                </div>
            </div>
        </div>
    );
}
