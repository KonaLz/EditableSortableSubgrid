export function viewLayoutWidths(xml: string): Record<string, number> {
    const widths: Record<string, number> = {};
    const cells = /<cell\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = cells.exec(xml)) !== null) {
        const name = /\bname\s*=\s*["']([^"']+)["']/i.exec(match[0])?.[1];
        const raw = /\bwidth\s*=\s*["']([^"']+)["']/i.exec(match[0])?.[1];
        const width = Number(raw);
        if (name && Number.isFinite(width) && width > 0) widths[name.toLowerCase()] = width;
    }
    return widths;
}

export function defaultColumnWidth(name: string, factor: number | undefined, viewWidths: Record<string, number>): number {
    const width = viewWidths[name.toLowerCase()] ?? factor;
    return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : 160;
}

export async function loadViewWidths(webApi: ComponentFramework.WebApi, viewId: string): Promise<Record<string, number>> {
    const id = viewId.replace(/[{}]/g, "");
    if (!/^[a-f0-9-]{36}$/i.test(id)) return {};
    // System views and personal views are stored in different tables.
    for (const entity of ["savedquery", "userquery"]) {
        try {
            const view = await webApi.retrieveRecord(entity, id, "?$select=layoutxml");
            const xml: unknown = view.layoutxml;
            if (typeof xml === "string") return viewLayoutWidths(xml);
        } catch { /* Try the other view type; dataset widths remain the fallback. */ }
    }
    return {};
}
