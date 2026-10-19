export function errorDescription(error: unknown, fallback: string): string {
    const seen = new Set<object>();
    const message = (value: unknown, depth = 0): string => {
        if (depth > 6 || value === null || value === undefined) return "";
        if (typeof value === "string") {
            const text = value.trim();
            if (!text || text === "[object Object]") return "";
            if (/^[{[]/.test(text)) {
                try { return message(JSON.parse(text) as unknown, depth + 1) || text; } catch { return text; }
            }
            return text;
        }
        if (typeof value !== "object" || seen.has(value)) return "";
        seen.add(value);
        const record = value as Record<string, unknown>;
        for (const key of ["message", "Message", "error", "innererror", "innerError", "responseJSON", "responseText", "raw"]) {
            const text = message(record[key], depth + 1);
            if (text) return text;
        }
        return "";
    };
    let text = message(error);
    if (!text && error && typeof error === "object") {
        try { const json = JSON.stringify(error); if (json !== "{}") text = json; } catch { /* Circular host error object. */ }
    }
    const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
    const code = record.errorCode ?? record.code ?? nested.code;
    const codeText = typeof code === "number" ? `0x${(code >>> 0).toString(16)}` : typeof code === "string" ? code : "";
    return `${text || fallback}${codeText ? ` [${codeText}]` : ""}`;
}
