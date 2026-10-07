const headings = new Map<string, string>();
export function rememberPageHeading(attachmentId: string, pageIndex: number, text: string): void {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean)
        return;
    if (headings.size >= 100)
        headings.delete(headings.keys().next().value ?? '');
    headings.set(`${attachmentId}:${pageIndex}`, clean);
}
export function readPageHeading(attachmentId: string, pageIndex: number): string | undefined { return headings.get(`${attachmentId}:${pageIndex}`); }
