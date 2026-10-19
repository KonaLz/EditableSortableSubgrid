const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/KeyboardNavigation.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { cellDestination, typedEditValue } = exported;
const move = (...args) => JSON.parse(JSON.stringify(cellDestination(...args)));

test('arrow keys select adjacent data cells', () => {
    assert.deepEqual(move(1, 1, 3, 3, 'ArrowUp'), { row: 0, column: 1 });
    assert.deepEqual(move(1, 1, 3, 3, 'ArrowDown'), { row: 2, column: 1 });
    assert.deepEqual(move(1, 1, 3, 3, 'ArrowLeft'), { row: 1, column: 0 });
    assert.deepEqual(move(1, 1, 3, 3, 'ArrowRight'), { row: 1, column: 2 });
});
test('arrows stay within the first and last row and column', () => {
    assert.deepEqual(move(0, 0, 2, 2, 'ArrowUp'), { row: 0, column: 0 });
    assert.deepEqual(move(0, 0, 2, 2, 'ArrowLeft'), { row: 0, column: 0 });
    assert.deepEqual(move(1, 1, 2, 2, 'ArrowDown'), { row: 1, column: 1 });
    assert.deepEqual(move(1, 1, 2, 2, 'ArrowRight'), { row: 1, column: 1 });
});
test('Tab wraps forward and Shift+Tab wraps backward between rows', () => {
    assert.deepEqual(move(0, 2, 2, 3, 'Tab'), { row: 1, column: 0 });
    assert.deepEqual(move(1, 0, 2, 3, 'Tab', true), { row: 0, column: 2 });
});
test('Tab at the grid edges allows focus to leave the table', () => {
    assert.equal(cellDestination(0, 0, 2, 3, 'Tab', true), null);
    assert.equal(cellDestination(1, 2, 2, 3, 'Tab'), null);
    assert.equal(cellDestination(0, 0, 0, 0, 'ArrowRight'), null);
});
test('typing replaces a text or number cell with the first character', () => {
    assert.equal(typedEditValue('SingleLine.Text', 'old', 'a'), 'a');
    assert.equal(typedEditValue('Currency', '380000', '5'), '5');
    assert.equal(typedEditValue('Lookup.Simple', 'old supplier', 'M'), 'M');
});
test('date and choice editors retain valid values when opened by typing', () => {
    assert.equal(typedEditValue('OptionSet', '100000000', 'a'), '100000000');
    assert.equal(typedEditValue('DateAndTime.DateOnly', '2026-10-17', '2'), '2026-10-17');
});
