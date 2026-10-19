export interface ColumnMetadata {
    LogicalName: string;
    AttributeType?: string | number;
    IsValidForCreate?: boolean;
    IsValidForUpdate?: boolean;
    AutoNumberFormat?: string | null;
    SourceType?: number | null;
    Format?: string;
    DateTimeBehavior?: { Value?: string } | string;
    [key: string]: unknown;
}

export function isColumnWritable(attribute: ColumnMetadata | undefined, operation: "create" | "update" = "update"): boolean {
    if (!attribute || attribute.AutoNumberFormat || (attribute.SourceType !== 0 && attribute.SourceType !== null)) return false;
    return (operation === "create" ? attribute.IsValidForCreate : attribute.IsValidForUpdate) === true;
}

export interface EntityMetadata {
    EntitySetName: string;
    PrimaryIdAttribute: string;
    PrimaryNameAttribute: string;
    Attributes: ColumnMetadata[];
}

export async function loadEntityMetadata(entityName: string, attributeNames: string[], request: typeof fetch = fetch): Promise<EntityMetadata> {
    if (![entityName, ...attributeNames].every((name) => /^[a-z][a-z0-9_]*$/i.test(name))) throw new Error("Invalid metadata logical name");
    const root = `/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')`;
    const get = async (path: string): Promise<unknown> => {
        const response = await request(path, { credentials: "same-origin", headers: { Accept: "application/json", "OData-Version": "4.0", "OData-MaxVersion": "4.0" } });
        const body: unknown = await response.json();
        if (!response.ok) {
            const detail = metadataProperty(metadataProperty(body, "error"), "message");
            throw new Error(typeof detail === "string" ? detail : `Metadata HTTP ${response.status}`);
        }
        return body;
    };
    const filter = attributeNames.map((name) => `LogicalName eq '${name}'`).join(" or ");
    const expand = attributeNames.length ? `&$expand=Attributes($select=LogicalName,AttributeType,IsValidForCreate,IsValidForUpdate,SourceType${filter ? `;$filter=${filter}` : ""})` : "";
    const base = await get(`${root}?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute${expand}`);
    const attributes = normalizeAttributes(metadataProperty(base, "Attributes"));
    const groups: [string, string, boolean][] = [
        ["PicklistAttributeMetadata", "LogicalName", true],
        ["MultiSelectPicklistAttributeMetadata", "LogicalName", true],
        ["StateAttributeMetadata", "LogicalName", true],
        ["StatusAttributeMetadata", "LogicalName", true],
        ["BooleanAttributeMetadata", "LogicalName", true],
        ["LookupAttributeMetadata", "LogicalName,Targets", false],
        ["DateTimeAttributeMetadata", "LogicalName,Format,DateTimeBehavior", false],
        ["StringAttributeMetadata", "LogicalName,AutoNumberFormat", false]
    ];
    const types = new Set(attributes.map((attribute) => String(attribute.AttributeType).toLowerCase()));
    await Promise.all(groups.filter(([type]) => {
        const name = type.replace("AttributeMetadata", "").toLowerCase();
        return types.has(name) || (name === "lookup" && (types.has("customer") || types.has("owner")));
    }).map(async ([type, select, options]) => {
        const result = await get(`${root}/Attributes/Microsoft.Dynamics.CRM.${type}?$select=${select}${options ? "&$expand=OptionSet" : ""}${filter ? `&$filter=${filter}` : ""}`);
        for (const detail of normalizeAttributes(metadataProperty(result, "value"))) {
            const index = attributes.findIndex((attribute) => attribute.LogicalName === detail.LogicalName);
            if (index >= 0) attributes[index] = { ...attributes[index], ...detail };
        }
    }));
    const stringValue = (name: string): string => {
        const value = metadataProperty(base, name);
        return typeof value === "string" ? value : "";
    };
    return { EntitySetName: stringValue("EntitySetName"), PrimaryIdAttribute: stringValue("PrimaryIdAttribute"), PrimaryNameAttribute: stringValue("PrimaryNameAttribute"), Attributes: attributes };
}

export function isDateOnly(attribute?: ColumnMetadata): boolean {
    return attribute?.Format === "DateOnly" || metadataProperty(attribute?.DateTimeBehavior, "Value") === "DateOnly" || attribute?.DateTimeBehavior === "DateOnly";
}

export function dateEditorValue(value: string, attribute?: ColumnMetadata): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const behavior = metadataProperty(attribute?.DateTimeBehavior, "Value") ?? attribute?.DateTimeBehavior;
    const independent = behavior === "DateOnly" || behavior === "TimeZoneIndependent";
    const display = independent ? value : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
    return display.slice(0, isDateOnly(attribute) ? 10 : 16);
}

export function serializeDate(value: string, attribute?: ColumnMetadata): string | null {
    if (!value) return null;
    const behavior = metadataProperty(attribute?.DateTimeBehavior, "Value") ?? attribute?.DateTimeBehavior;
    if (behavior === "DateOnly") {
        if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(new Date(value.slice(0, 10)).getTime())) throw new Error("Enter a valid date");
        return value.slice(0, 10);
    }
    const local = value.length === 10 ? `${value}T00:00:00` : value;
    const date = new Date(behavior === "TimeZoneIndependent" && !/(Z|[+-]\d{2}:\d{2})$/i.test(local) ? `${local}Z` : local);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date");
    return date.toISOString();
}

export function metadataProperty(source: unknown, name: string): unknown {
    if (!source || typeof source !== "object") return undefined;
    const record = source as Record<string, unknown>;
    // Collection methods can live on the prototype and are not enumerable.
    if (name in record) return record[name];
    const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key ? record[key] : undefined;
}

export function normalizeAttributes(source: unknown, requested: string[] = []): ColumnMetadata[] {
    if (!source || typeof source !== "object") return [];
    let values: unknown = source;
    const getAll = metadataProperty(source, "getAll");
    const get = metadataProperty(source, "get");
    if (typeof getAll === "function") values = (getAll as () => unknown).call(source);
    else if (typeof get === "function") {
        try { values = (get as () => unknown).call(source); } catch { values = []; }
        if (!Array.isArray(values) && requested.length) values = requested.map((name) => (get as (name: string) => unknown).call(source, name));
    }
    const entries: [string, unknown][] = Array.isArray(values)
        ? (values as unknown[]).map((value) => ["", value])
        : Object.entries(values as Record<string, unknown>);
    return entries.flatMap(([key, value]) => {
        if (!value || typeof value !== "object") return [];
        const name = metadataProperty(value, "LogicalName");
        const logicalName = typeof name === "string" ? name : key;
        return logicalName ? [{ ...(value as ColumnMetadata), LogicalName: logicalName }] : [];
    });
}

function optionLabel(value: unknown, language: number): string | undefined {
    if (typeof value === "string") return value;
    const labels = metadataProperty(value, "LocalizedLabels");
    if (Array.isArray(labels)) {
        const selected: unknown = (labels as unknown[]).find((label) => metadataProperty(label, "LanguageCode") === language);
        const label = metadataProperty(selected, "Label");
        if (typeof label === "string") return label;
    }
    const label = metadataProperty(metadataProperty(value, "UserLocalizedLabel"), "Label");
    return typeof label === "string" ? label : undefined;
}

export function normalizeChoiceOptions(attribute: unknown, language: number): { value: number; label: string }[] {
    const nested = metadataProperty(attribute, "attributes");
    const set = metadataProperty(attribute, "OptionSet") ?? metadataProperty(attribute, "GlobalOptionSet") ?? metadataProperty(nested, "OptionSet");
    // Utility returns OptionSet as { "100000000": "Label" }; Web API uses Options[].
    const raw = metadataProperty(set, "Options") ?? metadataProperty(attribute, "Options") ?? metadataProperty(nested, "Options") ?? set;
    if (!raw || typeof raw !== "object") return [];
    const entries: [string, unknown][] = Array.isArray(raw)
        ? (raw as unknown[]).map((option) => ["", option]) : Object.entries(raw as Record<string, unknown>);
    return entries.flatMap(([key, option]) => {
        const rawValue = metadataProperty(option, "Value") ?? (/^-?\d+$/.test(key) ? key : undefined);
        if (rawValue === undefined || rawValue === null || rawValue === "") return [];
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return [];
        const label = optionLabel(metadataProperty(option, "Label") ?? option, language) ?? String(value);
        return [{ value, label }];
    });
}
