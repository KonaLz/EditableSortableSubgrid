const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../EditableSortableSubgrid/services/RecordAccess.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { hasRecordWriteAccess } = exported;
const user = '11111111-1111-1111-1111-111111111111';
const row = '22222222-2222-2222-2222-222222222222';

test('checks current user and target row, accepting explicit write access', async () => {
    const allowed = await hasRecordWriteAccess(`{${user}}`, 'accounts', `{${row}}`, async (url, options) => {
        assert.ok(url.startsWith(`/api/data/v9.2/systemusers(${user})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess`));
        const target = new URL(url, 'https://example.test').searchParams.get('@p1');
        assert.deepEqual(JSON.parse(target), { '@odata.id': `accounts(${row})` });
        assert.equal(options.cache, 'no-store');
        return { ok: true, json: async () => ({ AccessRights: 'ReadAccess, WriteAccess, AppendAccess' }) };
    });
    assert.equal(allowed, true);
});

test('read and append permissions do not permit cell updates', async () => {
    assert.equal(await hasRecordWriteAccess(user, 'accounts', row,
        async () => ({ ok: true, json: async () => ({ AccessRights: 'ReadAccess, AppendAccess' }) })), false);
});

test('failed and malformed permission responses cannot unlock a row', async () => {
    await assert.rejects(hasRecordWriteAccess(user, 'accounts', row, async () => ({ ok: false, status: 403 })));
    await assert.rejects(hasRecordWriteAccess(user, 'accounts', row, async () => ({ ok: true, json: async () => ({}) })));
    await assert.rejects(hasRecordWriteAccess('invalid', 'accounts', row, async () => { throw new Error('must not request'); }));
});
