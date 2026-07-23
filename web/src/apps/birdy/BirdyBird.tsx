// The Birdy bird mark (user-drawn "plump two-feather flyer"), bare glyph for headers,
// empty states and splash spots. Sized and coloured the Lucide way: className drives
// dimensions, currentColor the fill. The eye is a true cutout (mask), so it always shows
// the surface behind the glyph. The viewBox hugs the artwork's bounding box, so the bird
// renders centered and full-size in any box.
export function BirdyBird({ className }: { className?: string }) {
    return (
        <svg viewBox="8 19 87 77" className={className} fill="currentColor" aria-hidden>
            <defs>
                <mask id="bdyeye">
                    <rect x="0" y="0" width="100" height="100" fill="#fff" />
                    <circle cx="67" cy="30" r="4" fill="#000" />
                </mask>
            </defs>
            <path
                mask="url(#bdyeye)"
                d="M95 25 C89 29 83 33 78 35 C82 43 84 52 80 58 C74 78 60 95 37 95 C28 96 18 94 8 90 C18 84 26 80 32 76 C23 75 16 69 14 60 C19 62 24 62 28 61 C17 55 10 42 13 28 C20 38 30 43 41 44 C42 36 46 29 52 25 C57 20 65 19 70 22 C75 24 79 25 82 26 C86 26 90 25 95 25 Z"
            />
        </svg>
    );
}
