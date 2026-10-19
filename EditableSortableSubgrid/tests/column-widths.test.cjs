const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/ColumnWidths.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { viewLayoutWidths, defaultColumnWidth, loadViewWidths } = exported;

test('uses exact view pixel widths including columns narrower than 90px', () => {
    const widths = viewLayoutWidths('<grid><row><cell name="hky_name" width="280"/><cell width="60" name="hky_unit" /></row></grid>');
    assert.equal(defaultColumnWidth('hky_name', 10, widths), 280);
    assert.equal(defaultColumnWidth('hky_unit', 10, widths), 60);
});
test('supports single quotes, attribute order and case-insensitive field names', () => {
    const widths = viewLayoutWidths("<cell width='123.5' name='HKY_NAME' />");
    assert.equal(defaultColumnWidth('hky_name', 1, widths), 123.5);
});
test('invalid widths use a valid dataset value or a stable fallback', () => {
    const widths = viewLayoutWidths('<cell name="x" width="0"/><cell name="y" width="bad"/>');
    assert.equal(defaultColumnWidth('x', 75, widths), 75);
    assert.equal(defaultColumnWidth('y', undefined, widths), 160);
});
test('reads system view layout by its selected view ID', async () => {
    const calls = [];
    const widths = await loadViewWidths({ retrieveRecord: async (...args) => { calls.push(args); return { layoutxml: '<cell name="x" width="210"/>' }; } }, '{11111111-1111-1111-1111-111111111111}');
    assert.equal(calls[0][0], 'savedquery');
    assert.equal(calls[0][1], '11111111-1111-1111-1111-111111111111');
    assert.equal(widths.x, 210);
});
test('supports personal views and unavailable view definitions', async () => {
    const widths = await loadViewWidths({ retrieveRecord: async (table) => { if (table === 'savedquery') throw new Error('not a system view'); return { layoutxml: '<cell name="x" width="180"/>' }; } }, '11111111-1111-1111-1111-111111111111');
    assert.equal(widths.x, 180);
    const missing = await loadViewWidths({ retrieveRecord: async () => { throw new Error('forbidden'); } }, '11111111-1111-1111-1111-111111111111');
    assert.equal(Object.keys(missing).length, 0);
});
