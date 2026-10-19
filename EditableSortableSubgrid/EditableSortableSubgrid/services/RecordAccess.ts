/** Check effective record access, including role, ownership, team and sharing rights. */
export async function hasRecordWriteAccess(userId: string, entitySet: string, recordId: string,
    request: typeof fetch = fetch): Promise<boolean> {
    const user = userId.replace(/[{}]/g, "");
    const id = recordId.replace(/[{}]/g, "");
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guid.test(user) || !guid.test(id) || !/^[a-z][a-z0-9_]*$/i.test(entitySet)) throw new Error("Invalid record access reference");
    const target = encodeURIComponent(JSON.stringify({ "@odata.id": `${entitySet}(${id})` }));
    const response = await request(`/api/data/v9.2/systemusers(${user})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@p1)?@p1=${target}`,
        { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json", "OData-Version": "4.0", "OData-MaxVersion": "4.0" } });
    if (!response.ok) throw new Error(`Record access HTTP ${response.status}`);
    const body: unknown = await response.json();
    const rights = (body as { AccessRights?: unknown })?.AccessRights;
    if (typeof rights !== "string") throw new Error("Missing record access rights");
    return rights.split(",").some((right) => right.trim() === "WriteAccess");
}
