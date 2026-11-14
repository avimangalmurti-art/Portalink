import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';
const {decideProjectPlacement}=sourceModule('src/domain/contentPlacement.ts', {
  '../features/projects/projectPortals': sourceModule('src/features/projects/projectPortals.ts'),
});
const view={creator:{id:'unfollowed',isPrivate:false},project:{id:'public',categoryId:'portal'}};
test('Home admits public work for every account regardless of follow state',()=>{for(const viewer of ['new-user','existing-user','unfollowed'])assert.equal(decideProjectPlacement({view,surface:'home',viewerProfileId:viewer,followedCreatorIds:[]}).eligible,true);});
test('Home excludes private creators even for owners and confirmed followers',()=>{for(const viewer of ['new-user','unfollowed'])assert.equal(decideProjectPlacement({view:{...view,creator:{...view.creator,isPrivate:true}},surface:'home',viewerProfileId:viewer,followedCreatorIds:['unfollowed']}).reason,'private_profile');});
test('Home excludes hidden work and portals while owner editing retains access',()=>{for(const flag of ['isProjectHidden','isCategoryHidden']){assert.equal(decideProjectPlacement({view,surface:'home',viewerProfileId:'unfollowed',[flag]:true}).eligible,false);assert.equal(decideProjectPlacement({view,surface:'profile',viewerProfileId:'unfollowed',[flag]:true}).eligible,true);}});
