import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import test from 'node:test';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const require=createRequire(import.meta.url);
const {transform}=createRequire(require.resolve('vite/package.json'))('lightningcss');
const targets={chrome:111<<16,safari:(16<<16)|(4<<8),firefox:114<<16};
const all=values=>values.includes(false)?false:values.every(value=>value===true)?true:null;
const any=values=>values.includes(true)?true:values.every(value=>value===false)?false:null;

// Structural selectors stay unknown: the audit asks whether some matching
// surface can receive this preference rule, not whether one mock DOM does.
function selectorGuard(node,state){
  if(node.type==='class'){
    if(node.value==='high-contrast')return state.highContrast;
    if(node.value==='reduce-translucency')return false;
    if(node.value==='theme-light'||node.value==='theme-dark')return node.value==='theme-'+state.theme;
  }
  if(node.type==='attribute'){
    const contrast=['data-entry-contrast','data-welcome-contrast','data-setup-high-contrast'].includes(node.attribute);
    const reduction=['data-entry-solid','data-welcome-solid','data-setup-reduce-translucency'].includes(node.attribute);
    if(contrast||reduction){
      const enabled=contrast?state.highContrast:false;
      return node.operator?node.value===String(enabled):enabled;
    }
  }
  if(node.type==='pseudo'&&node.nodes){
    const branches=node.nodes.map(branch=>selectorGuard(branch,state));
    if(node.value===':is'||node.value===':where')return any(branches);
    if(node.value===':not'){
      const result=any(branches);
      return result===null?null:!result;
    }
  }
  if(node.type==='selector')return all(node.nodes.map(child=>selectorGuard(child,state)));
  return null;
}

function mediaMatches(params,state){
  return postcss.list.comma(params).some(branch=>{
    if(/forced-colors\s*:\s*active/i.test(branch))return false;
    const preferences=[...branch.matchAll(/\(\s*prefers-(contrast|reduced-transparency)\s*:\s*([\w-]+)\s*\)/gi)];
    return preferences.every(([,name,value])=>name.toLowerCase()==='contrast'
      ? (value.toLowerCase()==='more'?state.osContrast:!state.osContrast)
      : value.toLowerCase()!=='reduce');
  });
}

function ancestry(rule){
  const parents=[];
  for(let parent=rule.parent;parent;parent=parent.parent)parents.push(parent);
  return parents;
}

function opaquePaint(declaration,selector){
  const {prop,value}=declaration;
  if(['backdrop-filter','-webkit-backdrop-filter','--navigation-blur'].includes(prop))return value==='none';
  if(['--interface-glass-opacity','--fixed-header-opacity'].includes(prop))return value==='100%';
  if(prop==='--interface-glass-alpha')return value==='1';
  if(!['background','background-color','--ui-popup-surface'].includes(prop))return false;
  if(/^var\(--(?:surface-(?:raised|canvas|overlay)|fixed-header-canvas|ui-popup-surface|entry-bg)(?:[,)])/.test(value))return true;
  const glassHost=/header|toolbar|scrim|backdrop|sheet|panel|popup|drawer|modal|data-material|role\s*=\s*['"]?(?:dialog|menu|tooltip)/i.test(selector);
  return glassHost&&(/^(?:white|black|#[\da-f]{3}|#[\da-f]{6})$/i.test(value)
    ||/^rgba?\([^/]+\s*\/\s*1\s*\)$/i.test(value));
}

function contrastOnlyInhibitors(root){
  const found=[];
  root.walkRules(rule=>{
    const parents=ancestry(rule);
    const media=parents.filter(parent=>parent.type==='atrule'&&parent.name==='media');
    const osContrast=media.some(parent=>/prefers-contrast\s*:\s*more/i.test(parent.params));
    // An unsupported-filter fallback is independent of either setting.
    if(parents.some(parent=>parent.type==='atrule'&&parent.name==='supports'&&/not\s+.*backdrop-filter/i.test(parent.params)))return;
    const parsed=selectorParser().astSync(rule.selector);
    for(const selector of parsed.nodes){
      let appContrast=false;
      selector.walkClasses(node=>{if(node.value==='high-contrast')appContrast=true;});
      selector.walkAttributes(node=>{if(['data-entry-contrast','data-welcome-contrast','data-setup-high-contrast'].includes(node.attribute))appContrast=true;});
      if(!appContrast&&!osContrast)continue;
      const active=['light','dark'].some(theme=>[[true,false],[false,true],[true,true]].some(([highContrast,os])=>{
        if(!(appContrast&&highContrast)&&!(osContrast&&os))return false;
        const state={theme,highContrast,osContrast:os};
        return media.every(parent=>mediaMatches(parent.params,state))&&selectorGuard(selector,state)!==false;
      }));
      if(active)for(const declaration of rule.nodes.filter(node=>node.type==='decl')){
        if(opaquePaint(declaration,selector.toString()))found.push(`${selector}: ${declaration.prop}: ${declaration.value}`);
      }
    }
  });
  return [...new Set(found)];
}

function cssFiles(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()
    ? cssFiles(join(directory,entry.name)):entry.name.endsWith('.css')?[join(directory,entry.name)]:[]);
}

test('the preference audit distinguishes stronger contrast from reduced-transparency and unsupported-browser fallbacks',()=>{
  assert.equal(contrastOnlyInhibitors(postcss.parse('.high-contrast .panel { border-color: white; color: white; }')).length,0);
  assert.equal(contrastOnlyInhibitors(postcss.parse('.high-contrast.reduce-translucency .panel { backdrop-filter: none; }')).length,0);
  assert.equal(contrastOnlyInhibitors(postcss.parse('@media (prefers-reduced-transparency: reduce) { .high-contrast .panel { backdrop-filter: none; } }')).length,0);
  assert.equal(contrastOnlyInhibitors(postcss.parse('@supports not (backdrop-filter: blur(1px)) { .high-contrast .panel { background: white; } }')).length,0);
  assert.equal(contrastOnlyInhibitors(postcss.parse('.shell:is(.reduce-translucency,.high-contrast) .panel { backdrop-filter: none; }')).length,1);
  assert.equal(contrastOnlyInhibitors(postcss.parse('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .panel { background: var(--surface-raised); } }')).length,1);
});

test('main, public and lazy feature CSS never make glass opaque solely because contrast is increased',()=>{
  const failures=[];
  for(const path of cssFiles(fileURLToPath(new URL('../src',import.meta.url)))){
    const source=readFileSync(path,'utf8');
    for(const [kind,css]of [['source',source],['optimized',transform({filename:path,code:Buffer.from(source),minify:true,targets}).code.toString()]]){
      for(const failure of contrastOnlyInhibitors(postcss.parse(css)))failures.push(`${path} (${kind}): ${failure}`);
    }
  }
  assert.deepEqual(failures,[],'Contrast may strengthen ink and edges; only a separate transparency preference may flatten glass.');
});
