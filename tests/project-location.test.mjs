import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
function execute(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports, ...globals});
  return exports;
}
const ranking = execute(read('domain/discovery/ranking.ts'), {require(name) {
  if (name.endsWith('/cities')) return {cities:[{name:'San Francisco'}, {name:'Oakland'}]};
  if (name.endsWith('/countryCodes')) return {getCountryCode:()=> 'US'};
  return {};
}});
const {withProjectLocation} = execute(read('features/publishing/projectLocation.ts'), {require:()=>ranking});
const inferred = ranking.deriveProjectRelevance({title:'Poster art',summary:'For the San Francisco campus tour.'});

test('an optional project location is independent of description text and survives reading', () => {
  const chosen = withProjectLocation(inferred, '  Oakland  ');
  assert.equal(chosen.contentGeography.label, 'Oakland');
  assert.equal(chosen.contentGeography.city, 'Oakland');
  assert.equal(chosen.geographyConfidence, 1);
  assert.deepEqual(chosen.topicKeys, inferred.topicKeys);
  assert.equal(ranking.deriveProjectRelevance({title:'San Francisco',summary:'Poster',stored:chosen}).contentGeography.label, 'Oakland');
  const blank = withProjectLocation(inferred, '   ');
  assert.equal(blank.contentGeography, null);
  assert.equal(blank.geographicScope, 'location_independent');
  assert.equal(ranking.deriveProjectRelevance({title:'San Francisco',summary:'Poster',stored:blank}).contentGeography, null);
  assert.equal(withProjectLocation(inferred), inferred, 'WEB callers retain inference');
  assert.equal(withProjectLocation(inferred, 'A place outside the city catalogue').contentGeography.label, 'A place outside the city catalogue');
  assert.throws(()=>withProjectLocation(inferred,'x'.repeat(81)), /80 characters/);
});

function serviceHarness(legacy = false) {
  const source = ts.createSourceFile('service.ts', read('services/supabase/contentServices.ts'), ts.ScriptTarget.Latest, true);
  let method;
  const find = node => { if(ts.isMethodDeclaration(node) && node.name.getText(source)==='publishProject') method=node.getText(source); ts.forEachChild(node,find); };
  find(source);
  const calls=[];
  const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:{label:'Art'}})};
  const {service} = execute(`exports.service={${method}}`, {
    withProjectLocation, projectRelevanceForPersistence:()=>inferred,
    PublishServiceError: class extends Error {constructor(code,message){super(message);this.code=code;}},
    requireSupabase:()=>({from:()=>chain,rpc:async(name,payload)=>{
      calls.push(payload);
      return legacy && 'p_content_location' in payload ? {error:{code:'PGRST202',message:'function not found'}} : {data:'project-id',error:null};
    }}),
  });
  return {service,calls};
}
const input={draftId:'draft',profileId:'owner',categoryId:'portal',metadata:{title:'Poster',summary:'San Francisco'},attachments:[{id:'file'}]};
test('publication persists the explicitly chosen place and an optional blank', async()=>{
  for(const location of ['Oakland','']) {
    const {service,calls}=serviceHarness();
    const result=await service.publishProject({...input,location});
    assert.equal(result.projectId,'project-id');
    assert.equal(calls[0].p_content_location,location);
    assert.equal(calls[0].p_geographic_scope,location?'city':'location_independent');
  }
});
test('missing citation publication RPC never drops location or access/date fields',async()=>{
  for(const location of ['Oakland','']) {
    const {service,calls}=serviceHarness(true);
    await assert.rejects(service.publishProject({...input,location}),/access and date could not be saved/);
    assert.equal(calls.length,1);
  }
  const {service,calls}=serviceHarness(true);
  await assert.rejects(service.publishProject(input), /access and date could not be saved/);
  assert.equal(calls.length,1);
});
