const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/CellValues.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { commitScalarValue } = exported;
const options = [{ value: 816060010, label: 'km' }, { value: 0, label: '個' }];

test('draft choice keeps label for display and ID for reopening and creation', () => {
    const original = { id: 'local-1', isDraft: true, values: { name: 'Apple' } };
    const row = commitScalarValue(original, 'unit', '816060010', 'OptionSet', options, 'Yes', 'No');
    assert.equal(row.values.unit, 'km');
    assert.equal(row.rawValues.unit, '816060010');
    assert.equal(Number(row.rawValues.unit), 816060010);
    assert.equal(row.values.name, 'Apple');
    assert.equal(original.values.unit, undefined);
});

test('existing row local state uses labels before the dataset refresh, including zero option IDs', () => {
    const row = commitScalarValue({ id: 'persisted', values: { unit: 'km' } }, 'unit', '0', 'OptionSet', options, 'Yes', 'No');
    assert.equal(row.values.unit, '個');
    assert.equal(row.rawValues.unit, '0');
});

test('Boolean labels remain separate from their API/editor values', () => {
    const row = commitScalarValue({ id: 'local-2', values: {} }, 'enabled', 'false', 'TwoOptions', [], 'はい', 'いいえ');
    assert.equal(row.values.enabled, 'いいえ');
    assert.equal(row.rawValues.enabled, 'false');
});
