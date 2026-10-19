export function cellDestination(row: number, column: number, rowCount: number, columnCount: number, key: string, shift = false): { row: number; column: number } | null {
    if (!rowCount || !columnCount) return null;
    if (key === "Tab") {
        const index = row * columnCount + column + (shift ? -1 : 1);
        if (index < 0 || index >= rowCount * columnCount) return null;
        return { row: Math.floor(index / columnCount), column: index % columnCount };
    }
    const directions: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const direction = directions[key];
    if (!direction) return null;
    return { row: Math.max(0, Math.min(rowCount - 1, row + direction[0])), column: Math.max(0, Math.min(columnCount - 1, column + direction[1])) };
}

export function typedEditValue(dataType: string, current: string, key: string): string {
    // Choice and date editors accept valid options/dates, rather than arbitrary text.
    return /optionset|picklist|choice|twooptions|boolean|date|time/i.test(dataType) ? current : key;
}
