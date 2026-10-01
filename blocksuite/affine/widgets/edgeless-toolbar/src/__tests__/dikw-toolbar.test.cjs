// Source-only contract tests. No browser, workspace data, build, or service required.
// Run with node --test; TypeScript must be resolvable (e.g. yarn node --test ...).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const sourceDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(sourceDir, 'dikw-toolbar.ts'), 'utf8');
const nothing = Symbol('nothing');
const html = (strings, ...values) => ({ strings: [...strings], values });
const mocks = {
  '@blocksuite/affine-model': { ShapeType: { Rect: 'rect' } },
  '@blocksuite/affine-shared/services': { EditPropsStore: 'props' },
  '@blocksuite/affine-shared/utils': { stopPropagation: e => e.stopPropagation() },
  '@blocksuite/icons/lit': new Proxy({}, { get: (_, key) => () => key }),
  '@blocksuite/std/gfx': { ToolIdentifier: name => name },
  lit: { html, nothing },
};
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: exportsObject,
  require: name => {
    assert.ok(name in mocks, 'Unexpected runtime dependency: ' + name);
    return mocks[name];
  },
});
const { renderDikwToolOptions, renderDikwToolbar, isDikwBoard } = exportsObject;
function fixture() {
  const calls = [];
  const props = { lastProps$: { value: { connector: { mode: 'straight' } } },
    recordLastProps(type, changes) { calls.push(['props', type, changes]); Object.assign(this.lastProps$.value[type], changes); } };
  class Controller {}
  const host = {
    host: {hasAttribute:()=>true}, store: { readonly: false }, block: {}, edgelessTool: 'default', locked: false,
    hasAttribute() { return this.locked; },
    std: { get: () => props, getOptional: () => ({ constructor: Controller }) },
    gfx: { tool: { currentToolOption$: { value: { options: { childType: 'h1' } } },
      setTool: (controller, options) => calls.push(['tool', controller, options]) } },
  };
  return { host, calls, props };
}
function callback(template) { return template.values.find(value => typeof value === 'function'); }

test('DIKW variant requires valid board relation, not arbitrary edgeless mode', () => {
  const record = { version: 1, docId: 'child', parentId: 'root', operationId: 'op' };
  assert.equal(isDikwBoard(record, 'child'), true);
  assert.equal(isDikwBoard({ ...record, parentId: 'child' }, 'child'), false);
  assert.equal(isDikwBoard({ ...record, operationId: '' }, 'child'), false);
  assert.equal(isDikwBoard(record, 'other'), false);
});
test('shape options reuse native menu and registered controller', () => {
  const { host, calls } = fixture();
  const menu = renderDikwToolOptions(host, 'shape');
  assert.match(menu.strings.join(''), /edgeless-shape-menu/);
  callback(menu)('ellipse');
  assert.equal(calls[0][2].shapeName, 'ellipse');
});
test('connector options persist native properties before selecting controller', () => {
  const { host, calls } = fixture();
  const menu = renderDikwToolOptions(host, 'connector');
  callback(menu)({ mode: 'curve', strokeWidth: 6 });
  assert.equal(calls[0][0], 'props');
  assert.equal(calls[1][2].mode, 'curve');
});
test('note options retain native current options and apply chosen type', () => {
  const { host, calls } = fixture();
  callback(renderDikwToolOptions(host, 'affine:note'))({ tip: 'Heading' });
  assert.equal(calls[0][2].childType, 'h1');
  assert.equal(calls[0][2].tip, 'Heading');
});
test('option callbacks recheck readonly and toolbar lock at activation', () => {
  for (const flag of ['readonly', 'locked']) {
    for (const name of ['shape', 'connector', 'affine:note']) {
      const { host, calls } = fixture();
      const run = callback(renderDikwToolOptions(host, name));
      if (flag === 'readonly') host.store.readonly = true;
      else host.locked = true;
      run(name === 'shape' ? 'ellipse' : { mode: 'curve' });
      assert.equal(calls.length, 0, name + '/' + flag);
    }
  }
});
test('More controls compact panel and unsupported tools add no option panel', () => {
  const { host } = fixture();
  const rail = renderDikwToolbar(host, false, () => {}, () => {});
  assert.match(rail.strings.join(''), /aria-controls="dikw-advanced-tools"/);
  assert.equal(renderDikwToolOptions(host, 'default'), nothing);
});
test('DIKW render structurally excludes duplicate dock, keeps native advanced components', () => {
  const widget = fs.readFileSync(path.join(sourceDir, 'edgeless-toolbar.ts'), 'utf8');
  const branch = widget.slice(widget.indexOf('private _renderDikwContent()'), widget.indexOf('private _renderContent()'));
  assert.doesNotMatch(branch, /_renderContent()|presentation-toolbar|quick-tool-more/);
  assert.match(branch, /t.compact/);
  assert.match(branch, /_renderDikwCompact/);
  assert.match(widget, /tool.content/);
  assert.ok(branch.includes('?inert='));
  assert.match(widget, /return this._renderDikwContent()/);
});
