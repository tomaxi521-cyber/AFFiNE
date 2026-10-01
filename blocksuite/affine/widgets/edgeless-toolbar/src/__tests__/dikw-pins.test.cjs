const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../dikw-pins.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const {normalizePins,readPins,movePin}=exportsObject;
const plain=x=>JSON.parse(JSON.stringify(x));
test('pins filter unknown IDs and duplicates without interpreting payloads',()=>assert.deepEqual(plain(normalizePins(['media','media','mindmap',null,{},'__proto__','default'])),['media','mindmap']));
test('bad JSON, blocked storage and unknown version restore safe defaults',()=>{
for(const getItem of [()=>'{',()=>JSON.stringify({version:2,tools:['media']}),()=>{throw Error('blocked')}])assert.deepEqual(plain(readPins({getItem})),[]);
});
test('supported preference version restores ordered toolbar',()=>assert.deepEqual(plain(readPins({getItem:()=>JSON.stringify({version:1,tools:['template','media']})})),['template','media']));
test('drag pin is insertion not duplicate and supports ordered movement',()=>{
assert.deepEqual(plain(movePin(['media','brush'],'frame','brush')),['media','frame','brush']);
assert.deepEqual(plain(movePin(['media','brush'],'brush','media')),['brush','media']);
assert.deepEqual(plain(movePin(['media'],'media','media')),['media']);
assert.deepEqual(plain(movePin(['media'],'__proto__')),['media']);
});
