const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
    const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/', name + '.ts'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
    const exports = {};
    vm.runInNewContext(compiled.outputText, { exports });
    return exports;
}
const { creationAttributeNames, resolveParentRecord } = load('ParentRecord');
const { loadEntityMetadata } = load('Metadata');
const id = '11111111-2222-3333-4444-555555555555';

test('first row requests hidden parent metadata and resolves runtime ID without existing children', async () => {
    const names = creationAttributeNames(['name'], 'parent_lookup', 'sort_order');
    assert.deepEqual(Array.from(names), ['name', 'parent_lookup', 'sort_order']);
    const urls = [];
    const metadata = await loadEntityMetadata('child_table', names, async url => {
        urls.push(url);
        return { ok: true, json: async () => url.includes('/Attributes/')
            ? { value: [{ LogicalName: 'parent_lookup', Targets: ['parent_table'] }] }
            : { Attributes: [{ LogicalName: 'parent_lookup', AttributeType: 'Lookup' }] } };
    });
    assert.ok(urls.every(url => url.includes("LogicalName eq 'parent_lookup'")));
    const target = metadata.Attributes[0].Targets;
    assert.equal(resolveParentRecord({ records: {} }, 'parent_lookup', id, undefined, target).entityType, 'parent_table');
});

test('does not invent a parent when runtime ID and dataset relationship filter are absent', () => {
    assert.equal(resolveParentRecord({ records: {} }, 'parent_lookup', undefined, undefined, ['parent_table']), undefined);
});
