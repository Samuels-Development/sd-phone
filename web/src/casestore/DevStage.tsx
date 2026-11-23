/** How the browser stand-in phone is turned; the game turns the real one. */
export interface DevTurn { yaw: number; pitch: number; zoom: number }

/** What sits where the game draws the 3D phone when the store is opened in a browser: a dark
 *  photo studio and the outline of a phone, back on, in the case colour, turned by dragging; with
 *  `screen` on, the light of its screen spills round its edges. */
export function DevStage({ hex, turn, right, screen }: { hex: string; turn: DevTurn; right: number; screen: boolean }) {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: '#0d0b0a' }}>
            <div
                className="absolute inset-0"
                style={{
                    background: [
                        'radial-gradient(60% 70% at 36% 42%, rgba(255,236,210,0.16), rgba(255,236,210,0) 70%)',
                        'linear-gradient(180deg, #1d1915 0%, #16130f 58%, #0f0d0b 58.2%, #1a1612 100%)',
                    ].join(', '),
                }}
            />
            <div className="absolute inset-y-0 left-0 flex items-center justify-center" style={{ right }}>
                <div className="relative flex flex-col items-center" style={{ transform: `scale(${turn.zoom})`, transition: 'transform 160ms ease-out' }}>
                    <div
                        className="relative h-[460px] w-[222px] rounded-[38px]"
                        style={{
                            background: `linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 40%, rgba(0,0,0,0.28)), ${hex}`,
                            boxShadow: screen
                                ? '0 0 0 3px #2a2a2e, 0 0 46px 10px rgba(190,215,255,0.38), 0 30px 60px rgba(0,0,0,0.55)'
                                : '0 0 0 3px #2a2a2e, 0 30px 60px rgba(0,0,0,0.55)',
                            transform: `perspective(1100px) rotateY(${turn.yaw}deg) rotateX(${turn.pitch}deg)`,
                        }}
                    >
                        <div className="absolute left-[16px] top-[16px] h-[92px] w-[92px] rounded-[26px] bg-black/35 ring-1 ring-white/15">
                            <span className="absolute left-[12px] top-[12px] h-[30px] w-[30px] rounded-full bg-[#111216] ring-2 ring-white/20" />
                            <span className="absolute bottom-[12px] left-[12px] h-[30px] w-[30px] rounded-full bg-[#111216] ring-2 ring-white/20" />
                            <span className="absolute right-[12px] top-[31px] h-[30px] w-[30px] rounded-full bg-[#111216] ring-2 ring-white/20" />
                        </div>
                    </div>
                    <div className="mt-8 h-[26px] w-[260px] rounded-[50%]" style={{ background: 'radial-gradient(closest-side, rgba(0,0,0,0.6), transparent)' }} />
                </div>
            </div>
        </div>
    );
}
