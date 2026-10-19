import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.createSourceFile('StudioPage.tsx',readFileSync('src/features/studio/StudioPage.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let activePillRef;
function find(node) {
 if(ts.isJsxAttribute(node)&&node.name.getText(source)==='ref'&&node.initializer&&ts.isJsxExpression(node.initializer)&&node.initializer.expression?.getText(source).includes('rail.scrollLeft')) activePillRef=node.initializer.expression;
 ts.forEachChild(node,find);
}
find(source);

test('only the selected Studio tab centres horizontally without moving the page',()=>{
 assert.ok(activePillRef,'The selected tab must stay discoverable after changing collections.');
 const callback=ts.transpileModule(`(${activePillRef.getText(source)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const width of [375,420,430])for(const selected of [false,true]) {
  const rail={clientWidth:width,scrollLeft:17,scrollTop:39};
  const pill={parentElement:rail,clientWidth:80,offsetLeft:400,scrollIntoView(){assert.fail('Tab changes must not scroll the surrounding page.');}};
  const ref=vm.runInNewContext(callback,{mobile:true,collection:selected?'bookmarks':'drafts',pill:'bookmarks'});
  ref(pill);
  assert.equal(rail.scrollLeft,selected?400-(width-80)/2:17);
  assert.equal(rail.scrollTop,39);
  ref(null);
 }
});
