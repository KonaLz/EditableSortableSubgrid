const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/Errors.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { errorDescription } = exported;

test('shows messages from plain PCF error objects rather than object Object', () => {
    assert.equal(errorDescription({ message: 'Missing required hky_name', errorCode: 2147746304 }, 'Copy failed'), 'Missing required hky_name [0x80040200]');
});
test('reads OData nested errors and serialized response bodies', () => {
    assert.equal(errorDescription({ error: { message: 'Invalid navigation property', code: '0x80060888' } }, 'Copy failed'), 'Invalid navigation property [0x80060888]');
    assert.equal(errorDescription({ responseText: '{"error":{"message":"Access denied"}}' }, 'Copy failed'), 'Access denied');
});
test('handles errors from other JavaScript realms, circular objects and opaque host errors', () => {
    assert.equal(errorDescription(new Error('Server rejected copy'), 'Copy failed'), 'Server rejected copy');
    const circular = {}; circular.raw = circular;
    assert.equal(errorDescription(circular, 'Copy failed'), 'Copy failed');
    assert.equal(errorDescription({ message: '[object Object]', error: { message: 'Duplicate key' } }, 'Copy failed'), 'Duplicate key');
});
