import { ColumnMetadata, isColumnWritable, metadataProperty, normalizeAttributes } from "./Metadata";

interface Relationship { ReferencingAttribute: string; ReferencingEntityNavigationPropertyName: string; ReferencedEntity: string; }
export interface CopyDefinition {
    EntitySetName: string;
    PrimaryIdAttribute: string;
    Attributes: ColumnMetadata[];
    Relationships: Relationship[];
    UniqueColumns: string[];
}

export function excludedCopyColumns(value = ""): Set<string> {
    return new Set(value.split(/[,;，；\s]+/).map((name) => name.trim().toLowerCase()).filter(Boolean));
}

async function readJson(path: string, request: typeof fetch, annotations = false): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { Accept: "application/json", "OData-Version": "4.0", "OData-MaxVersion": "4.0" };
    if (annotations) headers.Prefer = 'odata.include-annotations="Microsoft.Dynamics.CRM.lookuplogicalname,Microsoft.Dynamics.CRM.associatednavigationproperty"';
    const response = await request(path, { credentials: "same-origin", headers });
    const body: unknown = await response.json();
    if (!response.ok) {
        const message = metadataProperty(metadataProperty(body, "error"), "message");
        throw new Error(typeof message === "string" ? message : `Dataverse HTTP ${response.status}`);
    }
    if (!body || typeof body !== "object") throw new Error("Invalid Dataverse response");
    return body as Record<string, unknown>;
}

function logicalName(value: string): string {
    if (!/^[a-z][a-z0-9_]*$/i.test(value)) throw new Error(`Invalid logical name: ${value}`);
    return value;
}

export async function loadCopyDefinition(entityName: string, request: typeof fetch = fetch): Promise<CopyDefinition> {
    const root = `/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName(entityName)}')`;
    const base = await readJson(`${root}?$select=EntitySetName,PrimaryIdAttribute&$expand=Attributes($select=LogicalName,AttributeType,AttributeOf,IsValidForCreate,SourceType),Keys($select=KeyAttributes),ManyToOneRelationships($select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity)`, request);
    const attributes = normalizeAttributes(base.Attributes);
    // AutoNumberFormat is a StringAttributeMetadata property, not a base attribute property.
    const strings = await readJson(`${root}/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,AutoNumberFormat`, request);
    for (const detail of normalizeAttributes(strings.value)) {
        const attribute = attributes.find((item) => item.LogicalName === detail.LogicalName);
        if (attribute) Object.assign(attribute, detail);
    }
    const keys = Array.isArray(base.Keys) ? base.Keys as unknown[] : [];
    const unique = keys.flatMap((key) => {
        const names = metadataProperty(key, "KeyAttributes");
        return Array.isArray(names) ? (names as unknown[]).filter((name): name is string => typeof name === "string").map((name) => name.toLowerCase()) : [];
    });
    return {
        EntitySetName: typeof base.EntitySetName === "string" ? base.EntitySetName : "",
        PrimaryIdAttribute: typeof base.PrimaryIdAttribute === "string" ? base.PrimaryIdAttribute : "",
        Attributes: attributes,
        Relationships: Array.isArray(base.ManyToOneRelationships) ? base.ManyToOneRelationships as Relationship[] : [],
        UniqueColumns: unique
    };
}

export async function loadCopySource(definition: CopyDefinition, id: string, request: typeof fetch = fetch): Promise<Record<string, unknown>> {
    const guid = id.replace(/[{}]/g, "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid)) throw new Error("Invalid source record ID");
    return readJson(`/api/data/v9.2/${logicalName(definition.EntitySetName)}(${guid})`, request, true);
}

export async function lookupEntitySet(entityName: string, request: typeof fetch = fetch): Promise<string> {
    const result = await readJson(`/api/data/v9.2/EntityDefinitions(LogicalName='${logicalName(entityName)}')?$select=EntitySetName`, request);
    if (typeof result.EntitySetName !== "string" || !result.EntitySetName) throw new Error(`Missing entity set: ${entityName}`);
    return logicalName(result.EntitySetName);
}

export async function buildCopyPayload(definition: CopyDefinition, source: Record<string, unknown>, exclusions: Set<string>, parentField: string, resolveEntitySet: (entity: string) => Promise<string>, sortField?: string, sortValue?: number): Promise<Record<string, unknown>> {
    const fields = new Set(definition.Attributes.map((attribute) => attribute.LogicalName.toLowerCase()));
    for (const excluded of exclusions) if (!fields.has(excluded)) throw new Error(`Unknown excluded copy column: ${excluded}`);
    const parent = parentField.toLowerCase();
    if (!parent || !fields.has(parent)) throw new Error("Bind the parent lookup column before copying");
    const payload: Record<string, unknown> = {};
    const unique = new Set(definition.UniqueColumns);
    const system = new Set([definition.PrimaryIdAttribute.toLowerCase(), "createdon", "createdby", "createdonbehalfby", "modifiedon", "modifiedby", "modifiedonbehalfby", "versionnumber", "overriddencreatedon"]);
    const bindLookup = async (name: string) => {
        const property = `_${name}_value`;
        const value = source[property];
        if (value === null || value === undefined) {
            if (name === parent) throw new Error(`Source record has no parent lookup: ${name}`);
            return;
        }
        if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value.replace(/[{}]/g, ""))) throw new Error(`Invalid lookup value: ${name}`);
        const type = source[`${property}@Microsoft.Dynamics.CRM.lookuplogicalname`];
        const navigation = source[`${property}@Microsoft.Dynamics.CRM.associatednavigationproperty`];
        const relations = definition.Relationships.filter((relation) => relation.ReferencingAttribute.toLowerCase() === name);
        const actualType = typeof type === "string" ? type.toLowerCase() : undefined;
        const matchesType = (relation: Relationship) => relation.ReferencedEntity.toLowerCase() === actualType
            || (relation.ReferencedEntity.toLowerCase() === "owner" && (actualType === "systemuser" || actualType === "team"));
        const relation = relations.find((item) => matchesType(item) && (typeof navigation !== "string" || item.ReferencingEntityNavigationPropertyName === navigation))
            ?? (!actualType && relations.length === 1 ? relations[0] : undefined);
        if (!relation) throw new Error(`Cannot resolve lookup relationship: ${name}`);
        // owner is an abstract principal type. Its metadata may expose "owners",
        // but binds must address the concrete systemusers or teams entity set.
        const referencedEntity = relation.ReferencedEntity.toLowerCase() === "owner" ? actualType : relation.ReferencedEntity;
        if (!referencedEntity || referencedEntity === "owner") throw new Error(`Cannot resolve owner type: ${name}`);
        const entitySet = await resolveEntitySet(referencedEntity);
        payload[`${relation.ReferencingEntityNavigationPropertyName}@odata.bind`] = `/${entitySet}(${value.replace(/[{}]/g, "")})`;
    };
    for (const attribute of definition.Attributes) {
        const name = attribute.LogicalName.toLowerCase();
        if (name === parent || name === sortField?.toLowerCase()) continue;
        if (system.has(name) || unique.has(name) || exclusions.has(name) || attribute.AttributeOf || !isColumnWritable(attribute, "create")) continue;
        if (String(attribute.AttributeType).toLowerCase() === "uniqueidentifier") continue;
        if (/lookup|customer|owner/i.test(String(attribute.AttributeType))) { await bindLookup(name); continue; }
        const value = source[name];
        // Retrieve the complete record: this includes fields absent from the current view.
        if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") payload[name] = value;
    }
    // Parent association is structural and is always retained, even if listed as excluded.
    await bindLookup(parent);
    if (sortField && sortValue !== undefined) {
        const sort = definition.Attributes.find((attribute) => attribute.LogicalName.toLowerCase() === sortField.toLowerCase());
        if (!isColumnWritable(sort, "create")) throw new Error(`Sort column is not writable: ${sortField}`);
        payload[sortField] = sortValue;
    }
    return payload;
}
