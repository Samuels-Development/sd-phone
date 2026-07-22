/** Shimmering placeholder shapes shown while Birdy fetches. CSS-keyframe shimmer only - rAF is
 *  starved in CEF in-game, so all motion here is compositor-driven. */

function Bone({ className }: { className?: string }) {
    return (
        <div
            className={`animate-shimmer rounded-full bg-black/[0.07] ${className ?? ''}`}
            style={{
                backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0) 35%, rgba(255,255,255,0.55) 50%, rgba(0,0,0,0) 65%)',
                backgroundSize: '200% 100%',
            }}
        />
    );
}

function PostSkeleton({ wide = false }: { wide?: boolean }) {
    return (
        <div className="flex gap-3.5 border-b border-black/10 px-4 py-4" aria-hidden>
            <Bone className="h-14 w-14 shrink-0 !rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                <div className="flex items-center gap-2">
                    <Bone className="h-4 w-28" />
                    <Bone className="h-4 w-16" />
                </div>
                <Bone className="h-4 w-full" />
                <Bone className={`h-4 ${wide ? 'w-11/12' : 'w-2/3'}`} />
            </div>
        </div>
    );
}

/** A screenful of post placeholders, alternating line widths so the column doesn't read as a
 *  repeated tile. */
export function FeedSkeleton() {
    return (
        <div className="animate-fade-in">
            {[0, 1, 2, 3, 4].map(i => <PostSkeleton key={i} wide={i % 2 === 0} />)}
        </div>
    );
}
