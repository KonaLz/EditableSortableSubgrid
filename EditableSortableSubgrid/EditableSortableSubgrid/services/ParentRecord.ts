export interface ParentReference { id: string; entityType: string; }

/** Bound relationship/order fields may be hidden from the current view. */
export function creationAttributeNames(visibleNames: string[], parentLookup: string, sortOrder: string): string[] {
    return [...new Set([...visibleNames, parentLookup, sortOrder])];
}

interface DatasetRecord { getValue?: (columnName: string) => unknown; }
interface DatasetFilter { conditions?: { attributeName?: string; conditionOperator?: number | string; value?: string | string[] }[]; filters?: DatasetFilter[]; }
interface ParentDataset {
    records?: Record<string, DatasetRecord>;
    filtering?: { getFilter?: () => DatasetFilter };
}

const guidPattern = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function reference(value: unknown, entityType?: string): ParentReference | undefined {
    const item: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
    if (typeof item === "string") {
        if (!guidPattern.test(item) || !entityType) return undefined;
        return { id: item.replace(/[{}]/g, ""), entityType };
    }
    if (!item || typeof item !== "object") return undefined;
    const lookup = item as { id?: string | { guid?: string }; etn?: string; entityType?: string };
    const id = typeof lookup.id === "string" ? lookup.id : lookup.id?.guid;
    const target = lookup.etn ?? lookup.entityType ?? entityType;
    if (!id || !guidPattern.test(id) || !target || !/^[a-z][a-z0-9_]*$/i.test(target)) return undefined;
    return { id: id.replace(/[{}]/g, ""), entityType: target };
}

/** Resolve the current parent from an explicit form binding, a row, or a unique dataset lookup filter. */
export function resolveParentRecord(dataset: ParentDataset, lookupColumn: string, configuredId: unknown, configuredEntity: unknown, lookupTargets: string[]): ParentReference | undefined {
    const target = typeof configuredEntity === "string" && /^[a-z][a-z0-9_]*$/i.test(configuredEntity)
        ? configuredEntity : lookupTargets.length === 1 ? lookupTargets[0] : undefined;
    const configured = reference(configuredId, target);
    if (configured) return configured;

    for (const row of Object.values(dataset.records ?? {})) {
        const found = reference(row.getValue?.(lookupColumn));
        if (found) return found;
    }

    try {
        const names = new Set([lookupColumn.toLowerCase(), `_${lookupColumn.toLowerCase()}_value`]);
        const candidates = new Map<string, ParentReference>();
        const visit = (filter?: DatasetFilter) => {
            for (const condition of filter?.conditions ?? []) {
                if (!condition.attributeName || !names.has(condition.attributeName.toLowerCase())
                    || !(condition.conditionOperator === 0 || condition.conditionOperator === "Equal")) continue;
                const raw = Array.isArray(condition.value) ? condition.value.length === 1 ? condition.value[0] : undefined : condition.value;
                const found = reference(raw, target);
                if (found) candidates.set(`${found.entityType.toLowerCase()}:${found.id.toLowerCase()}`, found);
            }
            for (const child of filter?.filters ?? []) visit(child);
        };
        visit(dataset.filtering?.getFilter?.());
        if (candidates.size === 1) return [...candidates.values()][0];
    } catch { /* A host may not expose the dataset filter at runtime. */ }
    return undefined;
}
