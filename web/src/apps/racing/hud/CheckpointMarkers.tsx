import { t } from '@/i18n';
import type { HudMarker } from '@/apps/racing/data';
import { RACING_ACCENT } from '@/apps/racing/racingTheme';

const HEAD_PX  = 80;
const PANEL_PX = 208;

export function CheckpointMarkers({ markers, color, colorClosest }: {
    markers:      HudMarker[];
    color:        string;
    colorClosest: string;
}) {
    return (
        <>
            {markers.filter(marker => marker.on).map(marker => {
                const accent  = (marker.primary ? colorClosest : color) || RACING_ACCENT;
                const stemTop = HEAD_PX * marker.scale;
                return (
                    <div
                        key={marker.label}
                        className="pointer-events-none absolute"
                        style={{
                            left:      `${marker.x * 100}%`,
                            top:       `${marker.y * 100}%`,
                            transform: 'translateX(-50%)',
                            zIndex:    marker.primary ? 2 : 1,
                            opacity:   marker.primary ? 1 : 0.82,
                            willChange: 'left, top',
                        }}
                    >
                        <div
                            className="absolute left-1/2 w-[2px]"
                            style={{
                                top:        stemTop,
                                height:     `max(0px, ${Math.max(marker.stem, 0) * 100}vh - ${stemTop}px)`,
                                transform:  'translateX(-50%)',
                                background: `linear-gradient(to bottom, ${accent}, ${accent}55 55%, transparent)`,
                            }}
                        />
                        <div
                            className="relative flex flex-col items-center"
                            style={{ transform: `scale(${marker.scale})`, transformOrigin: 'top center' }}
                        >
                            <div
                                className="flex flex-col"
                                style={{ width: PANEL_PX, filter: 'drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45))' }}
                            >
                                <div
                                    className="flex items-center justify-center"
                                    style={{
                                        height:     52,
                                        background: `linear-gradient(to top, ${accent}cc 0%, ${accent}80 35%, ${accent}26 70%, transparent 100%)`,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize:      38,
                                            fontWeight:    900,
                                            lineHeight:    1,
                                            letterSpacing: '-0.01em',
                                            color:         '#fff',
                                            textShadow:    '0 2px 9px rgba(0, 0, 0, 0.85), 0 0 2px rgba(0, 0, 0, 0.9)',
                                        }}
                                    >
                                        {marker.dist}
                                        <span style={{ fontSize: '0.72em' }}>{t('racing.hudMetres', 'm')}</span>
                                    </span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(6, 8, 12, 0.6)' }} />
                            </div>
                            <div
                                style={{
                                    marginTop:     7,
                                    fontSize:      14,
                                    fontWeight:    800,
                                    letterSpacing: '0.24em',
                                    color:         'rgba(255, 255, 255, 0.6)',
                                    textShadow:    '0 2px 6px rgba(0, 0, 0, 0.9)',
                                }}
                            >
                                {t('racing.hudCheckpointMarker', 'CHECKPOINT {n}', { n: marker.label })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}
