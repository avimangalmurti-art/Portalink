import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('radio arrows wrap, respect RTL and skip unavailable or nested choices', () => {
  let direction='ltr';const document={activeElement:null};const choices=[];
  const group={querySelectorAll:()=>choices};
  const choice=(name,other={})=>({name, clicks:0,closest(selector){return selector.includes('radiogroup')?(other.nested?{}:group):(other.hidden?{}:null);},
    getAttribute:()=>other.disabled?'true':null,
    focus(){document.activeElement=this;},click(){this.clicks++;}});
  choices.push(choice('first'),choice('disabled',{disabled:true}),choice('hidden',{hidden:true}),choice('nested',{nested:true}),choice('last'));
  const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('src/utils/radioGroupKeyboard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports,document,getComputedStyle:()=>({direction})});
  const key=(key,extra={})=>{const event={key,currentTarget:group,prevented:false,preventDefault(){this.prevented=true;},...extra};exports.handleRadioGroupKeyDown(event);return event;};
  document.activeElement=choices[0];assert.equal(key('ArrowLeft').prevented,true);assert.equal(document.activeElement,choices[4]);
  key('ArrowRight');assert.equal(document.activeElement,choices[0]);key('End');assert.equal(document.activeElement,choices[4]);
  key('Home');assert.equal(document.activeElement,choices[0]);direction='rtl';key('ArrowRight');assert.equal(document.activeElement,choices[4]);
  assert.equal(key('ArrowLeft',{ctrlKey:true}).prevented,false);assert.equal(document.activeElement,choices[4]);
  assert.equal(choices[1].clicks+choices[2].clicks+choices[3].clicks,0);
});
