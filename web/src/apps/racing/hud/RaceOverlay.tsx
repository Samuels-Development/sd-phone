import { useCallback, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { clampHudScale, DEFAULT_HUD } from '@/apps/racing/data';
import type { HudMarker, HudPosition, HudState, HudStyle, LineupState, StartBoard } from '@/apps/racing/data';
import { hudAnchor } from './anchor';
import { CheckpointMarkers } from './CheckpointMarkers';
import { RaceStartBoard } from './RaceStartBoard';
import { DnfCountdown } from './DnfCountdown';
import { RaceCountdown } from './RaceCountdown';
import { RaceHud } from './RaceHud';

const IDLE_STATE: HudState = {
    lap:               1,
    totalLaps:         1,
    cp:                0,
    cpTotal:           0,
    progress:          0,
    bestLapMs:         0,
    lapStartElapsedMs: 0,
    sectors:           [],
    racers:            [],
    pos:               1,
    totalRacers:       1,
};

export function RaceOverlay() {
    const visibleRef = useRef(false);

    const [visible, setVisible]           = useState(false);
    const [style, setStyle]               = useState<HudStyle>(DEFAULT_HUD.style);
    const [position, setPosition]         = useState<HudPosition>(DEFAULT_HUD.position);
    const [scale, setScale]               = useState(DEFAULT_HUD.scale);
    const [startedAt, setStartedAt]       = useState(0);
    const [state, setState]               = useState<HudState>(IDLE_STATE);
    const [countdown, setCountdown]       = useState<{ from: number; run: number } | null>(null);
    const [dnf, setDnf]                   = useState<{ seconds: number; run: number } | null>(null);
    const [markers, setMarkers]           = useState<HudMarker[]>([]);
    const [markerColor, setMarkerColor]   = useState(DEFAULT_HUD.checkpointColor);
    const [closestColor, setClosestColor] = useState(DEFAULT_HUD.closestColor);
    const [board, setBoard]               = useState<StartBoard | null>(null);
    const [boardAt, setBoardAt]           = useState<{ on: boolean; x: number; y: number } | null>(null);
    const [lineup, setLineup]             = useState<LineupState | null>(null);

    useNuiEvent('sd-phone:racing:board:show', useCallback((data) => {
        setBoard(data);
    }, []));

    useNuiEvent('sd-phone:racing:board:pos', useCallback((data) => {
        setBoardAt({ on: data.on, x: data.x, y: data.y });
        setBoard(prev => (prev && prev.joined !== data.joined ? { ...prev, joined: data.joined } : prev));
    }, []));

    useNuiEvent('sd-phone:racing:board:hide', useCallback(() => {
        setBoard(null);
        setBoardAt(null);
    }, []));

    useNuiEvent('sd-phone:racing:board:lineup', useCallback((data) => {
        setLineup(data.state);
    }, []));

    useNuiEvent('sd-phone:racing:hud:show', useCallback((data) => {
        setStyle(data.style);
        setPosition(data.position);
        setScale(clampHudScale(data.scale));
        if (!visibleRef.current) {
            setState(IDLE_STATE);
            setStartedAt(performance.now());
        }
        visibleRef.current = true;
        setVisible(true);
    }, []));

    useNuiEvent('sd-phone:racing:hud:hide', useCallback(() => {
        visibleRef.current = false;
        setVisible(false);
        setMarkers([]);
        setDnf(null);
        setCountdown(null);
    }, []));

    useNuiEvent('sd-phone:racing:hud:state', useCallback((patch) => {
        setState(prev => ({
            ...prev,
            ...patch,
            racers:  Array.isArray(patch.racers) ? patch.racers : prev.racers,
            sectors: Array.isArray(patch.sectors) ? patch.sectors : prev.sectors,
        }));
    }, []));

    useNuiEvent('sd-phone:racing:hud:countdown', useCallback((data) => {
        setCountdown(prev => ({ from: data.from, run: (prev?.run ?? 0) + 1 }));
    }, []));

    useNuiEvent('sd-phone:racing:hud:dnf', useCallback((data) => {
        setDnf(prev => ({ seconds: data.seconds, run: (prev?.run ?? 0) + 1 }));
    }, []));

    useNuiEvent('sd-phone:racing:markers', useCallback((data) => {
        setMarkers(Array.isArray(data.markers) ? data.markers : []);
        if (data.color) setMarkerColor(data.color);
        if (data.colorClosest) setClosestColor(data.colorClosest);
    }, []));

    const clearCountdown = useCallback(() => setCountdown(null), []);
    const clearDnf       = useCallback(() => setDnf(null), []);

    if (!visible && countdown === null && dnf === null && markers.length === 0 && board === null) return null;

    const anchor = hudAnchor(position, 'fixed');

    return (
        <div
            className="pointer-events-none fixed inset-0"
            style={{ zIndex: 30, '--racing-hud-scale': String(scale) } as CSSProperties}
        >
            <CheckpointMarkers markers={markers} color={markerColor} colorClosest={closestColor} />
            {visible && (
                <div style={anchor.frame}>
                    <div
                        className="inline-flex items-stretch gap-2"
                        style={{
                            flexDirection:   anchor.stackUp ? 'column-reverse' : 'column',
                            transform:       'scale(var(--racing-hud-scale))',
                            transformOrigin: anchor.origin,
                        }}
                    >
                        <RaceHud style={style} state={state} startedAt={startedAt} />
                        {dnf !== null && <DnfCountdown key={dnf.run} seconds={dnf.seconds} onDone={clearDnf} />}
                    </div>
                </div>
            )}
            {board !== null && boardAt !== null && boardAt.on && (
                <RaceStartBoard board={board} x={boardAt.x} y={boardAt.y} lineup={lineup} />
            )}
            {countdown !== null && <RaceCountdown key={countdown.run} from={countdown.from} onDone={clearCountdown} />}
        </div>
    );
}
