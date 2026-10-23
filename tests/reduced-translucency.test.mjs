import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import postcss from 'postcss';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const source=read('../src/presentation/reduced-translucency.css');
const stylesheet=postcss.parse(source);
const require=createRequire(import.meta.url);
const {transform}=createRequire(require.resolve('vite/package.json'))('lightningcss');
const targets={chrome:111<<16,safari:(16<<16)|(4<<8),firefox:114<<16};
const optimized=postcss.parse(transform({filename:'reduced-translucency.css',code:Buffer.from(source),minify:true,targets}).code.toString());

function ancestor(node,predicate){
 for(let parent=node.parent;parent;parent=parent.parent)if(predicate(parent))return parent;
 return null;
}
const osPreference=rule=>ancestor(rule,node=>node.type==='atrule'&&node.name==='media'&&/prefers-reduced-transparency\s*:\s*reduce/.test(node.params));
// The optimizer drops the optional universal before a descendant pseudo-element.
const normalize=selector=>selector.trim().replace(/::?(before|after)/g,'::$1').replace(/\s+/g,' ').replace(/ (?=::(?:before|after))/g,' *');

function assertReduction(root,os){
 const matches=[];
 root.walkRules(rule=>{
  if(Boolean(osPreference(rule))===os&&rule.nodes.some(node=>node.type==='decl'&&node.prop==='backdrop-filter'))matches.push(rule);
 });
 assert.ok(matches.length,'The preference must retain a backdrop rule after production optimization.');
 const selectors=new Set(matches.flatMap(rule=>postcss.list.comma(rule.selector).map(normalize)));
 const scope=os?'body':'.reduce-translucency';
 for(const suffix of ['',' *','::before','::after',' *::before',' *::after']){
  assert.ok(selectors.has(scope+suffix),`Missing ${scope+suffix}: body portals and decorative layers must also honor the preference.`);
 }
 for(const rule of matches){
  assert.ok(ancestor(rule,node=>node.type==='atrule'&&node.name==='layer'),'Important accessibility filters must outrank unlayered feature overrides.');
  for(const property of ['backdrop-filter','-webkit-backdrop-filter']){
   const declarations=rule.nodes.filter(node=>node.type==='decl'&&node.prop===property);
   assert.ok(declarations.length,`${property} must survive the production optimizer.`);
   assert.ok(declarations.every(node=>node.value==='none'&&node.important),`${property} must disable even important modal/avatar filters.`);
  }
 }
}

test('main and public presentations load the same accessibility cascade',()=>{
 assert.match(read('../src/presentation/AppPresentation.tsx'),/import ['"]\.\/reduced-translucency\.css['"]/);
 for(const path of ['../src/App.tsx','../src/visitor/VisitorApp.tsx']){
  assert.match(read(path),/import[^\n]+AppPresentation[^\n]+['"][^'"]*presentation\/AppPresentation['"]/);
 }
});

test('production CSS retains explicit reduction for surfaces, body portals and pseudo-elements',()=>{
 assertReduction(stylesheet,false);
 assertReduction(optimized,false);
});

test('production CSS retains OS reduction even when the in-app switch is off',()=>{
 assertReduction(stylesheet,true);
 assertReduction(optimized,true);
});

test('the shared override changes only backdrop filtering under a reduction preference',()=>{
 stylesheet.walkRules(rule=>{
  if(!osPreference(rule))for(const selector of postcss.list.comma(rule.selector)){
   assert.ok(selector.includes('.reduce-translucency'),'Normal appearance must not receive a blanket accessibility override.');
  }
 });
 stylesheet.walkDecls(declaration=>{
  assert.ok(['backdrop-filter','-webkit-backdrop-filter'].includes(declaration.prop)||declaration.prop.startsWith('--'),
   `Do not alter ${declaration.prop}: scrim tint, media filters, geometry and visibility retain their existing behavior.`);
 });
});
