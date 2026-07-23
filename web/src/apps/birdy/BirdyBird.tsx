// The Birdy bird mark (user-drawn), bare glyph for headers, empty states and splash spots.
// Sized and coloured the Lucide way: className drives dimensions, currentColor the fill.
// The viewBox hugs the artwork's bounding box (it sits low in its authored 100x100 frame),
// so the bird renders centered and full-size in whatever box the call site gives it.
export function BirdyBird({ className }: { className?: string }) {
    return (
        <svg viewBox="6 17 88 79" className={className} fill="currentColor" aria-hidden>
            <path d="M91 27 C87 31 82 33 78 35 C81 41 82 48 80 54 C76 76 60 94 37 95 C27 96 16 93 7 88 C16 86 24 83 31 78 C24 78 17 73 14 66 C18 67 22 67 26 65 C17 62 11 56 10 47 C13 49 17 51 21 51 C14 45 11 37 13 28 C20 38 30 43 41 44 C42 36 46 29 52 25 C57 20 65 19 70 22 C75 24 79 25 82 26 C85 26 88 26 91 27 Z" />
        </svg>
    );
}
