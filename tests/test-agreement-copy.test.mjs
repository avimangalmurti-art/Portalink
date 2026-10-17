import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const launch=sourceModule('src/features/launch/adultLaunch.ts');
function renderSheet(selected){
 const react={...React,useEffect(){return undefined;},useRef(){return {current:null};},useState(initial){return [initial===null?selected:initial===false?true:initial,()=>undefined];}};
 const module=sourceModule('src/components/auth/EntryAgreements.tsx',{
  react,'../../features/launch/adultLaunch':launch,'../ui/ModalPortal':{ModalPortal:'div'},
  '../../hooks/useModalFocus':{useModalFocus(){return undefined;}},'../../hooks/useDialogViewport':{useDialogViewport:()=>null},'./entryAgreements.css':{}
 });
 const tree=module.EntryAgreements({onDisagree(){return undefined;},children:()=>null});
 const sheet=React.Children.toArray(tree.props.children).find(node=>node.props?.onAgree);
 return renderToStaticMarkup(React.createElement(sheet.type,sheet.props));
}
test('overview presents explicit test acceptance, privacy acknowledgment, immutable candidate version and decline',()=>{
 const html=renderSheet(null);
 assert.equal(launch.LAUNCH_REVIEW_VERSION,'portalink-controlled-test-2026-10-15-v1');
 assert.match(html,/DRAFT FOR REVIEW/);assert.match(html,/Avinaash Mangalmurti/);
 assert.match(html,/Accept test Terms and acknowledge Privacy/);assert.match(html,/Disagree/);
 assert.match(html,/not consent to optional processing/);assert.match(html,/portalink-controlled-test-2026-10-15-v1/);
 assert.doesNotMatch(html,/\[Placeholder:|adult-launch-review-2026-10-15/);
});
for(const [section,expected] of [
 [0,['18','United States','There is no mandatory arbitration','avi@portalinknetworks.com']],
 [1,['in-app account deletion','Google','Supabase','30 minutes','10 minutes','seven days','does not promise a fixed account-deletion']],
 [2,['You retain ownership','non-exclusive','does not authorize public distribution','withdraw']],
 [3,['unavailable','grants no permission','will not use','separate review']]
])test('complete test agreement section '+section+' has no placeholders and matches the review draft',()=>{
 const html=renderSheet(section),draft=readFileSync('docs/google-test-agreements-review.md','utf8');
 for(const text of expected){assert.ok(html.toLowerCase().includes(text.toLowerCase()),text);assert.ok(draft.toLowerCase().includes(text.toLowerCase()),text);}
 assert.doesNotMatch(html,/\[Placeholder:/);assert.match(html,/No marketing, analytics, promotional/);
});
test('retired placeholder-version admissions cannot authorize the new bundle',()=>{
 const now=Date.now();
 assert.equal(launch.validAdmission({country:'US',ageBand:'18+',checkedAt:now,acknowledgedAt:now,termsVersion:'adult-launch-review-2026-10-15',privacyVersion:'adult-launch-review-2026-10-15'}),false);
});
