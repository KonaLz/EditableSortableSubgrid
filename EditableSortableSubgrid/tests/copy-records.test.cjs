const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, dependencies = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/', name + '.ts'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
    const exported = {};
    vm.runInNewContext(compiled.outputText, { exports: exported, require: (module) => dependencies[module] });
    return exported;
}
const metadata = load('Metadata');
const { buildCopyPayload, excludedCopyColumns, loadCopyDefinition, loadCopySource } = load('CopyRecords', { './Metadata': metadata });
const id = '11111111-1111-1111-1111-111111111111';
const attribute = (name, type = 'String', extra = {}) => ({ LogicalName: name, AttributeType: type, SourceType: 0, IsValidForCreate: true, ...extra });
const definition = {
    EntitySetName: 'hky_items', PrimaryIdAttribute: 'hky_itemid', UniqueColumns: ['hky_externalid'],
    Attributes: [attribute('hky_itemid', 'Uniqueidentifier'), attribute('hky_name'), attribute('hky_note'),
        attribute('hky_number', 'String', { AutoNumberFormat: 'SEQ-{SEQNUM:5}' }), attribute('hky_externalid'),
        attribute('hky_total', 'Money', { SourceType: 1 }), attribute('hky_quantity', 'Decimal'), attribute('hky_enabled', 'Boolean'),
        attribute('hky_due', 'DateTime'), attribute('hky_order', 'Integer'), attribute('hky_parent', 'Lookup', { SourceType: null }),
        attribute('hky_supplier', 'Lookup'), attribute('createdon', 'DateTime')],
    Relationships: [
        { ReferencingAttribute: 'hky_parent', ReferencingEntityNavigationPropertyName: 'hky_Project', ReferencedEntity: 'hky_project' },
        { ReferencingAttribute: 'hky_supplier', ReferencingEntityNavigationPropertyName: 'hky_Supplier_account', ReferencedEntity: 'account' }
    ]
};
const source = { hky_itemid: id, hky_name: 'Product A', hky_note: 'Not in current view', hky_number: 'SEQ-00001', hky_externalid: 'UNIQUE-1',
    hky_total: 200, hky_quantity: 0, hky_enabled: false, hky_due: '2026-10-17', createdon: '2026-10-01T00:00:00Z',
    _hky_parent_value: id, _hky_supplier_value: id,
    '_hky_supplier_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'account',
    '_hky_supplier_value@Microsoft.Dynamics.CRM.associatednavigationproperty': 'hky_Supplier_account' };
const resolve = async (entity) => entity === 'account' ? 'accounts' : 'hky_projects';

test('copies primary name and fields absent from the current view, retaining parent and lookup relationships', async () => {
    const payload = await buildCopyPayload(definition, source, new Set(), 'hky_parent', resolve, 'hky_order', 1500);
    assert.equal(payload.hky_name, 'Product A');
    assert.equal(payload.hky_note, 'Not in current view');
    assert.equal(payload.hky_quantity, 0);
    assert.equal(payload.hky_enabled, false);
    assert.equal(payload.hky_due, '2026-10-17');
    assert.equal(payload['hky_Project@odata.bind'], `/hky_projects(${id})`);
    assert.equal(payload['hky_Supplier_account@odata.bind'], `/accounts(${id})`);
    assert.equal(payload.hky_order, 1500);
    for (const name of ['hky_itemid', 'hky_number', 'hky_externalid', 'hky_total', 'createdon', 'hky_supplier']) assert.equal(name in payload, false);
});
test('configured exclusions are case insensitive; parent association is always retained', async () => {
    const payload = await buildCopyPayload(definition, source, excludedCopyColumns('HKY_NOTE，hky_supplier; hky_parent'), 'hky_parent', resolve);
    assert.equal('hky_note' in payload, false);
    assert.equal('hky_Supplier_account@odata.bind' in payload, false);
    assert.equal(payload['hky_Project@odata.bind'], `/hky_projects(${id})`);
});
test('refuses to build an orphan copy if parent configuration or source parent is missing', async () => {
    await assert.rejects(buildCopyPayload(definition, source, new Set(), '', resolve), /parent lookup/i);
    await assert.rejects(buildCopyPayload(definition, { ...source, _hky_parent_value: null }, new Set(), 'hky_parent', resolve), /no parent lookup/i);
});
test('reports misspelled exclusion fields rather than silently copying their values', async () => {
    await assert.rejects(buildCopyPayload(definition, source, excludedCopyColumns('hky_typo'), 'hky_parent', resolve), /Unknown excluded copy column/);
});
test('retrieves alternate key and autonumber metadata independently of the grid view', async () => {
    const result = await loadCopyDefinition('hky_item', async (url) => ({ ok: true, json: async () => url.includes('/Microsoft.Dynamics.CRM.StringAttributeMetadata')
        ? { value: [{ LogicalName: 'hky_number', AutoNumberFormat: 'AUTO' }] }
        : { EntitySetName: 'hky_items', PrimaryIdAttribute: 'hky_itemid', Attributes: definition.Attributes,
            Keys: [{ KeyAttributes: ['hky_externalid'] }], ManyToOneRelationships: definition.Relationships } }));
    assert.equal(result.UniqueColumns[0], 'hky_externalid');
    assert.equal(result.Attributes.find((item) => item.LogicalName === 'hky_number').AutoNumberFormat, 'AUTO');
});
test('requests the complete source row with lookup target annotations', async () => {
    const result = await loadCopySource(definition, id, async (url, options) => {
        assert.equal(url, `/api/data/v9.2/hky_items(${id})`);
        assert.match(options.headers.Prefer, /lookuplogicalname/);
        assert.match(options.headers.Prefer, /associatednavigationproperty/);
        return { ok: true, json: async () => source };
    });
    assert.equal(result.hky_name, 'Product A');
});

test('binds an abstract owner relationship to its concrete user or team, never owners', async () => {
    const ownerDefinition = { ...definition, Attributes: [...definition.Attributes, attribute('ownerid', 'Owner', { SourceType: null })],
        Relationships: [...definition.Relationships, { ReferencingAttribute: 'ownerid', ReferencingEntityNavigationPropertyName: 'ownerid', ReferencedEntity: 'owner' }] };
    for (const type of ['systemuser', 'team']) {
        const requestedEntities = [];
        const payload = await buildCopyPayload(ownerDefinition, { ...source, _ownerid_value: id,
            '_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': type,
            '_ownerid_value@Microsoft.Dynamics.CRM.associatednavigationproperty': 'ownerid' }, new Set(), 'hky_parent', async (entity) => {
                requestedEntities.push(entity);
                return entity === 'systemuser' ? 'systemusers' : entity === 'team' ? 'teams' : resolve(entity);
            });
        assert.equal(payload['ownerid@odata.bind'], `/${type === 'systemuser' ? 'systemusers' : 'teams'}(${id})`);
        assert.equal(requestedEntities.includes('owner'), false);
    }
});

test('missing concrete owner type fails before an invalid owners bind can be submitted', async () => {
    const ownerDefinition = { ...definition, Attributes: [...definition.Attributes, attribute('ownerid', 'Owner')],
        Relationships: [...definition.Relationships, { ReferencingAttribute: 'ownerid', ReferencingEntityNavigationPropertyName: 'ownerid', ReferencedEntity: 'owner' }] };
    await assert.rejects(buildCopyPayload(ownerDefinition, { ...source, _ownerid_value: id }, new Set(), 'hky_parent', resolve), /Cannot resolve owner type/);
});
