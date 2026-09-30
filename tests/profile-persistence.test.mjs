import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the production read/write methods against an isolated PostgREST
// model, including its important zero-row UPDATE semantics. No real accounts.
const source = ts.createSourceFile('content.ts', readFileSync(new URL('../src/services/supabase/contentServices.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function methods(service, names) {
  const declaration = source.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []).find(n => n.name.getText(source) === service);
  return declaration.initializer.properties.filter(n => names.includes(n.name?.getText(source))).map(n => n.getText(source)).join(',\n');
}
const readProfile = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'loadProfiles').getText(source);
const plain = value => JSON.parse(JSON.stringify(value));
const gridDensity = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/projectGridDensity.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: gridDensity });
function fixture({ rpcResult = { data: null, error: { code: 'PGRST202', message: 'RPC not installed' } } } = {}) {
  const db = {
    profiles: [{id:'owner',account_id:'account',name:'Original',handle:'owner',headline:'Bio',location:'City',links:[],social_links:{},is_private:false}],
    portfolio_categories: ['one','two'].map((id,position)=>({id,profile_id:'owner',label:id,position,icon_name:'FolderIcon',is_hidden:false})),
    projects: ['a','b','c'].map((id,i)=>({id,profile_id:'owner',category_id:i===1?'two':'one',position:i,published_at:`2026-09-${20-i}`,is_hidden:false,is_pinned:false,design:{typefaceId:'default'}})),
    project_attachments: [],
  };
  let denied=false,failId=null,viewer='account';
  const writes=[], rpcCalls=[], tableCalls=[];
  const client={rpc:async(name,params)=>{rpcCalls.push({name,params:plain(params)});return rpcResult;},auth:{getSession:async()=>({data:{session:viewer?{user:{id:viewer}}:null}})},from(table){
    tableCalls.push(table);
    const filters=[],orders=[];let patch=null,singular=false,returning=false;
    const query={
      select(){if(patch)returning=true;return query;},
      update(value){patch=value;return query;},
      eq(key,value){filters.push(row=>row[key]===value);return query;},
      in(key,values){filters.push(row=>values.includes(row[key]));return query;},
      order(key,options={}){orders.push([key,options.ascending!==false]);return query;},
      single(){singular=true;return query;},
      then(resolve,reject){
        let rows=db[table].filter(row=>filters.every(filter=>filter(row)));
        if(patch){
          if(rows.some(row=>row.id===failId))return Promise.resolve({data:null,error:{message:'Connection interrupted'}}).then(resolve,reject);
          if(denied) rows=[];
          for(const row of rows){Object.assign(row,plain(patch));writes.push({table,id:row.id,patch:plain(patch)});}
          if(!returning)return Promise.resolve({data:null,error:null}).then(resolve,reject);
        }
        for(const [key,ascending] of [...orders].reverse()) rows.sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(ascending?1:-1));
        const error=singular&&rows.length!==1?{code:'PGRST116',message:'Expected one updated row; received zero'}:null;
        return Promise.resolve({data:error?null:plain(singular?rows[0]:rows),error}).then(resolve,reject);
      },
    };return query;
  }};
  class ServiceError extends Error {constructor(code,message){super(message);this.code=code;}}
  const exports={};
  vm.runInNewContext(ts.transpileModule(`${readProfile}\nconst supabaseProfileService={${methods('supabaseProfileService',['getProfile','getProjectGridLayout','updateProjectGridLayout','updateProfile','getPortfolioArrangement','savePortfolioArrangement','renameCategory','setCategoryIcon'])}};\nconst supabaseProjectService={${methods('supabaseProjectService',['saveProfileProjectOrder','getProjectArrangement','saveProjectArrangement','updateProjectDesign'])}};\nexports.profiles=supabaseProfileService;exports.projects=supabaseProjectService;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
    exports,...gridDensity,requireSupabase:()=>client,ProfileServiceError:ServiceError,CategoryMutationError:ServiceError,ProjectMutationError:ServiceError,
    throwProfileError:error=>{throw new Error(error.message);},normalizePublicAppearance:value=>value??null,normalizeHandle:value=>value.replace(/^@/,''),
    uploadAvatar:async()=>'/test-avatar.png',deriveInitials:()=>'',asStats:()=>[],asStringRecord:value=>value??{},asLinks:value=>value??[],
    hydrateProjects:async rows=>new Map(rows.map(row=>[row.id,{id:row.id,categoryId:row.category_id}])),
    removeProfilePublicCovers:async()=>{},
    typefaces:[{id:'default'}],MIN_PAGES_PER_ROW:1,MAX_PAGES_PER_ROW:13,
  });
  return {...exports,db,writes,rpcCalls,tableCalls,deny:()=>{denied=true;},fail:id=>{failId=id;},viewAs:id=>{viewer=id;}};
}

test('profile identity, links, avatar, privacy and branding survive a fresh service read',async()=>{
  const h=fixture();
  const appearance={accentColor:'#FF375F',systemGray:'gray4',mode:'auto'};
  const saved=await h.profiles.updateProfile('owner',{name:' Saved name ',headline:' Saved bio ',location:' Saved city ',links:[{label:'Website',href:'https://example.test',iconName:'globe'}],socialLinks:{},isPrivate:true,publicAppearance:appearance,avatar:{}});
  const reloaded=await h.profiles.getProfile('owner');
  assert.deepEqual(plain(saved),plain(reloaded));
  assert.equal(reloaded.name,'Saved name');assert.equal(reloaded.headline,'Saved bio');assert.equal(reloaded.location,'Saved city');
  assert.equal(reloaded.isPrivate,true);assert.equal(reloaded.avatar,'/test-avatar.png');assert.equal(reloaded.links[0].href,'https://example.test');
  assert.deepEqual(plain(reloaded.publicAppearance),appearance);
});

test('lightweight layout reads and saves never hydrate portfolio content and enforce owner/range checks', async () => {
  const h = fixture();
  const original = plain(h.db.profiles[0]);
  assert.deepEqual(plain(await h.profiles.getProjectGridLayout('owner')), { id: 'owner', projectGridColumns: 2 });
  assert.deepEqual(plain(await h.profiles.updateProjectGridLayout('owner', 5)), { id: 'owner', projectGridColumns: 5 });
  assert.deepEqual(plain(h.db.profiles[0]), { ...original, project_grid_columns: 5 });
  assert.ok(h.tableCalls.every(table => table === 'profiles'));
  assert.deepEqual(h.writes, [{ table: 'profiles', id: 'owner', patch: { project_grid_columns: 5 } }]);
  for (const value of [1, 14, 2.5]) await assert.rejects(h.profiles.updateProjectGridLayout('owner', value), /between 2 and 13/);
  h.viewAs('visitor'); await assert.rejects(h.profiles.updateProjectGridLayout('owner', 7), /zero/);
  h.viewAs(null); await assert.rejects(h.profiles.updateProjectGridLayout('owner', 7), /Sign in/);
  assert.equal(h.db.profiles[0].project_grid_columns, 5);
});

test('profile order survives reload and a portal reorder preserves other portals positions',async()=>{
  const h=fixture(); await h.projects.saveProfileProjectOrder('owner',['c','b','a']);
  assert.deepEqual(plain((await h.profiles.getProfile('owner')).projects.map(p=>p.id)),['c','b','a']);
  await h.projects.saveProjectArrangement('owner','one',{projectOrder:['a','c'],hiddenProjectIds:['c'],pinnedProjectIds:['a']});
  assert.deepEqual(plain((await h.profiles.getProfile('owner')).projects.map(p=>p.id)),['a','b','c']);
  const saved=await h.projects.getProjectArrangement('owner','one');
  assert.deepEqual(plain(saved),{projectOrder:['a','c'],hiddenProjectIds:['c'],pinnedProjectIds:['a']});
});

test('portal order, visibility, icon and title survive reopening',async()=>{
  const h=fixture();await h.profiles.savePortfolioArrangement('owner',{categoryOrder:['two','one'],hiddenCategoryIds:['two'],categoryIcons:{one:'CameraIcon',two:'MusicIcon'}});
  await h.profiles.renameCategory('owner','one','Photography');await h.profiles.setCategoryIcon('owner','one','ImageIcon');
  const profile=await h.profiles.getProfile('owner');assert.deepEqual(plain(profile.categories.map(c=>c.id)),['two','one']);
  assert.equal(profile.categories[1].label,'Photography');assert.equal(profile.categories[1].iconName,'ImageIcon');
  assert.deepEqual(plain((await h.profiles.getPortfolioArrangement('owner')).hiddenCategoryIds),['two']);
});

test('every profile/settings/order write rejects zero affected rows instead of claiming success',async()=>{
  const attempts=[
    h=>h.profiles.updateProfile('owner',{name:'Changed'}),
    h=>h.profiles.renameCategory('owner','one','Changed'),
    h=>h.profiles.setCategoryIcon('owner','one','CameraIcon'),
    h=>h.profiles.savePortfolioArrangement('owner',{categoryOrder:['two','one'],hiddenCategoryIds:[],categoryIcons:{}}),
    h=>h.projects.saveProfileProjectOrder('owner',['c','b','a']),
    h=>h.projects.saveProjectArrangement('owner','one',{projectOrder:['c','a'],hiddenProjectIds:[],pinnedProjectIds:[]}),
    h=>h.projects.updateProjectDesign('a',{typefaceId:'default',pagesPerRow:2}),
  ];
  for(const attempt of attempts){const h=fixture();h.deny();await assert.rejects(attempt(h),/zero/);assert.equal(h.writes.length,0);}
  const ranked=fixture();await ranked.projects.saveProfileProjectOrder('owner',['a','b','c']);ranked.deny();
  await assert.rejects(ranked.projects.saveProjectArrangement('owner','one',{projectOrder:['c','a'],hiddenProjectIds:[],pinnedProjectIds:[]}),/zero/);
});

test('partial order failures reject and retry repairs the intended order',async()=>{
  const h=fixture();h.fail('b');await assert.rejects(h.projects.saveProfileProjectOrder('owner',['c','b','a']),/interrupted/);
  h.fail(null);await h.projects.saveProfileProjectOrder('owner',['c','b','a']);
  assert.deepEqual(plain((await h.profiles.getProfile('owner')).projects.map(p=>p.id)),['c','b','a']);
});

test('duplicate or foreign project IDs are rejected before any arrangement updates',async()=>{
  for(const ids of [['a','a'],['a','foreign']]){const h=fixture();
    await assert.rejects(h.projects.saveProjectArrangement('owner','one',{projectOrder:ids,hiddenProjectIds:[],pinnedProjectIds:[]}));assert.equal(h.writes.length,0);
  }
});

test('project grid normalization clamps the whole 2–13 range and defaults malformed input',()=>{
  const normalize=gridDensity.normalizeProjectGridColumns;
  for(let columns=2;columns<=13;columns++)assert.equal(normalize(columns),columns);
  assert.equal(normalize(-10),2);assert.equal(normalize(14),13);assert.equal(normalize(4.6),5);
  for(const invalid of [undefined,null,NaN,Infinity,-Infinity,'5',{},[]])assert.equal(normalize(invalid),2);
});

test('saved project density is read by owners, other accounts and anonymous public visitors',async()=>{
  const h=fixture();
  assert.equal((await h.profiles.getProfile('owner')).projectGridColumns,2);
  await h.profiles.updateProfile('owner',{projectGridColumns:5});
  for(const viewer of ['account','other-account',null]){
    h.viewAs(viewer);assert.equal((await h.profiles.getProfile('owner')).projectGridColumns,5);
  }
});

test('density-only saves preserve all profile fields and project order; reorder never writes density',async()=>{
  const h=fixture();
  await h.projects.saveProfileProjectOrder('owner',['c','a','b']);
  const before=plain(h.db.profiles[0]);const order=plain(h.db.projects);
  await h.profiles.updateProfile('owner',{projectGridColumns:13});
  assert.deepEqual(plain(h.db.profiles[0]),{...before,project_grid_columns:13});
  assert.deepEqual(plain(h.db.projects),order);
  assert.deepEqual(h.writes.at(-1),{table:'profiles',id:'owner',patch:{project_grid_columns:13}});
  await h.projects.saveProfileProjectOrder('owner',['b','c','a']);
  await h.profiles.updateProfile('owner',{name:'Renamed'});
  const reopened=await h.profiles.getProfile('owner');
  assert.equal(reopened.projectGridColumns,13);
  assert.deepEqual(plain(reopened.projects.map(p=>p.id)),['b','c','a']);
});

test('density saves reject invalid counts, guest writes and non-owner updates without false success',async()=>{
  for(const count of [1,14,5.5,NaN,Infinity,null,'5']){
    const h=fixture();await assert.rejects(h.profiles.updateProfile('owner',{projectGridColumns:count}),/Projects per row/);
    assert.equal(h.writes.length,0);
  }
  for(const viewer of ['other-account',null]){
    const h=fixture();h.viewAs(viewer);
    await assert.rejects(h.profiles.updateProfile('owner',{projectGridColumns:5}));
    assert.equal(h.writes.length,0);
  }
  for(const count of [2,13]){
    const h=fixture();await h.profiles.updateProfile('owner',{projectGridColumns:count});
    assert.equal((await h.profiles.getProfile('owner')).projectGridColumns,count);
  }
});


const arrangementAttempts = [
  { name: 'save_portfolio_arrangement', params: { p_profile_id: 'owner', p_category_order: ['two','one'], p_hidden_category_ids: ['two'], p_category_icons: { one: 'CameraIcon' } },
    run: h => h.profiles.savePortfolioArrangement('owner', { categoryOrder: ['two','one'], hiddenCategoryIds: ['two'], categoryIcons: { one: 'CameraIcon' } }) },
  { name: 'save_profile_project_order', params: { p_profile_id: 'owner', p_project_ids: ['c','b','a'] },
    run: h => h.projects.saveProfileProjectOrder('owner', ['c','b','a']) },
  { name: 'save_project_arrangement', params: { p_profile_id: 'owner', p_category_id: 'one', p_project_order: ['c','a'], p_hidden_project_ids: ['c'], p_pinned_project_ids: ['a'] },
    run: h => h.projects.saveProjectArrangement('owner', 'one', { projectOrder: ['c','a'], hiddenProjectIds: ['c'], pinnedProjectIds: ['a'] }) },
];

test('arrangement saves send one atomic RPC with complete intended state and no per-row requests', async () => {
  for (const attempt of arrangementAttempts) {
    const h = fixture({ rpcResult: { data: null, error: null } });
    assert.equal(await attempt.run(h), undefined);
    assert.deepEqual(h.rpcCalls, [{ name: attempt.name, params: attempt.params }]);
    assert.deepEqual(h.tableCalls, []);
    assert.deepEqual(h.writes, []);
  }
});

test('only missing-function codes use the compatible arrangement path before migration is applied', async () => {
  for (const code of ['PGRST202', '42883']) for (const attempt of arrangementAttempts) {
    const h = fixture({ rpcResult: { data: null, error: { code, message: 'Function missing' } } });
    await attempt.run(h);
    assert.equal(h.rpcCalls.length, 1);
    assert.ok(h.writes.length > 0);
    if (attempt.name === 'save_profile_project_order') {
      assert.deepEqual(plain([...h.db.projects].sort((a,b)=>a.position-b.position).map(row=>row.id)), ['c','b','a']);
      assert.ok(h.db.projects.every(row => row.position < 0));
    }
  }
});

test('RPC validation, ownership, network and transaction failures never fan out into fallback writes', async () => {
  for (const code of ['42501', '23503', '23514', '57014', 'PGRST301', undefined]) for (const attempt of arrangementAttempts) {
    const h = fixture({ rpcResult: { data: null, error: { code, message: 'Arrangement rejected' } } });
    await assert.rejects(attempt.run(h), /Arrangement rejected/);
    assert.equal(h.rpcCalls.length, 1);
    assert.deepEqual(h.tableCalls, []);
    assert.deepEqual(h.writes, []);
  }
});
