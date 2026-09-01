export function Spinner({ size = 28, className = '' }: { size?: number; className?: string }) {
    return (
        <span
            role="status"
            className={`inline-block animate-spin rounded-full border-[3px] border-black/15 border-t-black/50 dark:border-white/15 dark:border-t-white/60 ${className}`}
            style={{ width: size, height: size }}
        />
    );
}
