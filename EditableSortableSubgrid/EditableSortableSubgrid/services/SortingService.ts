export interface OrderedItem { id: string; sortOrder: number; }

/** Calculates an insertion rank. Callers must scope rows to one parent record. */
export function rankBetween(previous?: number, next?: number, spacing = 1000): number | null {
    if (previous === undefined && next === undefined) return spacing;
    if (previous === undefined) return next! - spacing;
    if (next === undefined) return previous + spacing;
    if (next - previous <= 1) return null;
    return Math.floor((previous + next) / 2);
}

/** Produces deterministic spaced ranks for controlled, parent-scoped reindexing. */
export function reindex<T extends { id: string }>(items: T[], spacing = 1000): (T & { sortOrder: number })[] {
    return items.map((item, index) => ({ ...item, sortOrder: (index + 1) * spacing }));
}
