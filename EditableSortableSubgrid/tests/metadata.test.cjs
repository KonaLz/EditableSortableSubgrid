const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/Metadata.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
const exportsObject = {};
vm.runInNewContext(compiled.outputText, { exports: exportsObject });
const { normalizeAttributes, normalizeChoiceOptions } = exportsObject;
const { loadEntityMetadata, isColumnWritable, serializeDate, dateEditorValue, isDateOnly } = exportsObject;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('reads platform attribute collections with prototype getAll, including lookup Targets', () => {
    class Collection {
        constructor(items) { this.items = items; }
        getAll() { return this.items; }
    }
    const result = normalizeAttributes(new Collection([{ LogicalName: 'supplier', Targets: ['account'] }]));
    assert.deepEqual(plain(result), [{ LogicalName: 'supplier', Targets: ['account'] }]);
});
test('reads get() collections and dictionaries without losing logical names', () => {
    assert.equal(normalizeAttributes({ get() { return [{ LogicalName: 'unit' }]; } })[0].LogicalName, 'unit');
    assert.equal(normalizeAttributes({ unit: { AttributeType: 11 } })[0].LogicalName, 'unit');
});
test('reads choice dictionaries returned by Utility, including zero and negative values', () => {
    assert.deepEqual(plain(normalizeChoiceOptions({ OptionSet: { 0: '未選択', 100000000: '個', '-1': 'その他' } }, 1041)), [
        { value: 0, label: '未選択' }, { value: 100000000, label: '個' }, { value: -1, label: 'その他' }
    ]);
});
test('reads Web API option arrays using the requested language', () => {
    const result = normalizeChoiceOptions({ OptionSet: { Options: [{ Value: 7, Label: { LocalizedLabels: [{ LanguageCode: 1041, Label: '個' }, { LanguageCode: 2052, Label: '件' }] } }] } }, 2052);
    assert.deepEqual(plain(result), [{ value: 7, label: '件' }]);
});
test('reads dictionary option objects and ignores non-option properties', () => {
    assert.deepEqual(plain(normalizeChoiceOptions({ OptionSet: { 1: { Label: 'ST' }, IsGlobal: true } }, 1033)), [{ value: 1, label: 'ST' }]);
});
test('accepts direct PCF Options arrays and handles absent metadata', () => {
    assert.deepEqual(plain(normalizeChoiceOptions({ Options: [{ Value: 2, Label: 'Unit' }] }, 1033)), [{ value: 2, label: 'Unit' }]);
    assert.equal(normalizeChoiceOptions({}, 1033).length, 0);
    assert.equal(normalizeAttributes(undefined).length, 0);
});

test('loads typed Dataverse definitions when base attributes have no OptionSet or Targets', async () => {
    const requests = [];
    const request = async (url, init) => {
        requests.push(url);
        assert.equal(init.credentials, 'same-origin');
        let body;
        if (url.includes('/Microsoft.Dynamics.CRM.PicklistAttributeMetadata')) {
            assert.match(url, /\$expand=OptionSet/);
            body = { value: [{ LogicalName: 'hky_unit', OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: '個' } } }] } }] };
        } else if (url.includes('/Microsoft.Dynamics.CRM.LookupAttributeMetadata')) {
            assert.match(url, /\$select=LogicalName,Targets/);
            body = { value: [{ LogicalName: 'hky_supplier', Targets: ['account'] }] };
        } else {
            body = { EntitySetName: 'hky_items', PrimaryIdAttribute: 'hky_itemid', PrimaryNameAttribute: 'hky_name', Attributes: [
                { LogicalName: 'hky_unit', AttributeType: 'Picklist', IsValidForUpdate: true, SourceType: 0 },
                { LogicalName: 'hky_supplier', AttributeType: 'Lookup', IsValidForUpdate: true, SourceType: null },
                { LogicalName: 'hky_amount', AttributeType: 'Money', IsValidForUpdate: false, SourceType: 1 }
            ] };
        }
        return { ok: true, json: async () => body };
    };
    const metadata = await loadEntityMetadata('hky_item', ['hky_unit', 'hky_supplier', 'hky_amount'], request);
    assert.equal(requests.length, 3);
    assert.equal(normalizeChoiceOptions(metadata.Attributes[0], 1041)[0].label, '個');
    assert.equal(metadata.Attributes[1].Targets[0], 'account');
    assert.equal(isColumnWritable(metadata.Attributes[0]), true);
    assert.equal(isColumnWritable(metadata.Attributes[1]), true);
    assert.equal(isColumnWritable(metadata.Attributes[2]), false);
});

test('does not treat rejected metadata requests as an empty set of options', async () => {
    await assert.rejects(loadEntityMetadata('account', [], async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Access denied' } }) })), /Access denied/);
});

test('computed, formula, rollup, autonumber and unknown fields remain read only', () => {
    const simple = { LogicalName: 'x', IsValidForUpdate: true, IsValidForCreate: true, SourceType: 0 };
    for (const SourceType of [1, 2, 3, 4, undefined]) assert.equal(isColumnWritable({ ...simple, SourceType }), false);
    assert.equal(isColumnWritable({ ...simple, AutoNumberFormat: 'SEQ-{SEQNUM:5}' }), false);
    assert.equal(isColumnWritable({ ...simple, IsValidForUpdate: false }), false);
    assert.equal(isColumnWritable(undefined), false);
    assert.equal(isColumnWritable(simple), true);
});

test('date-only values save as dates and never shift to the previous day', () => {
    const metadata = { LogicalName: 'due', Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } };
    assert.equal(isDateOnly(metadata), true);
    assert.equal(serializeDate('2026-10-16', metadata), '2026-10-16');
    assert.equal(dateEditorValue('2026-10-16T00:00:00Z', metadata), '2026-10-16');
    assert.equal(serializeDate('', metadata), null);
});

test('date-time values save as strings with the correct behavior', () => {
    const independent = { LogicalName: 'due', DateTimeBehavior: { Value: 'TimeZoneIndependent' } };
    assert.equal(serializeDate('2026-10-16T09:30', independent), '2026-10-16T09:30:00.000Z');
    assert.equal(dateEditorValue('2026-10-16T09:30:00Z', independent), '2026-10-16T09:30');
    const value = serializeDate('2026-10-16T09:30', { LogicalName: 'due', DateTimeBehavior: { Value: 'UserLocal' } });
    assert.equal(value, new Date('2026-10-16T09:30').toISOString());
});
