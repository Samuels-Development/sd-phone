export function isHostMessage(event: MessageEvent): boolean {
    const source = event.source;
    return source === null || source === window || source === window.parent;
}
