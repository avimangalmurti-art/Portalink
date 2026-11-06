import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import postcss from 'postcss';

// Resolve the optimizer used by the installed Vite build, without a separate
// test dependency. These representative browsers match its production target.
const require=createRequire(import.meta.url);
const requireVite=createRequire(require.resolve('vite/package.json'));
const {transform}=requireVite('lightningcss');
const targets={chrome:111<<16,safari:(16<<16)|(4<<8),firefox:114<<16};
const stylesheet=postcss.parse(readFileSync(new URL('../src/index.css',import.meta.url),'utf8'));
const onboardingSelectors=['.first-login-welcome-backdrop','.profile-setup-backdrop','.project-setup-screen','.onboarding-publish-backdrop','.project-form-overlay[data-onboarding-publish]','.post-publish-idea-backdrop'];
const coversOnboarding=rule=>onboardingSelectors.every(selector=>rule.selector.includes(selector));

function optimizeOnboardingRule(predicate){
 const matches=[];
 stylesheet.walkRules(rule=>{if(coversOnboarding(rule)&&predicate(rule))matches.push(rule);});
 assert.equal(matches.length,1,'The actual stylesheet must contain exactly one matching onboarding preference rule.');
 const actualRule=matches[0],input=actualRule.parent.type==='atrule'?actualRule.parent.clone():actualRule.clone();
 const result=transform({filename:'onboarding-translucency.css',code:Buffer.from(input.toString()),minify:true,targets});
 return postcss.parse(result.code.toString());
}

function assertOpaqueBackdropSurvives(optimized,predicate){
 const rules=[];
 optimized.walkRules(rule=>{if(coversOnboarding(rule)&&predicate(rule))rules.push(rule);});
 assert.ok(rules.length,'Minification must retain the actual onboarding preference selector.');
 for(const rule of rules)for(const property of ['-webkit-backdrop-filter','backdrop-filter']){
  const declarations=rule.nodes.filter(node=>node.type==='decl'&&node.prop===property);
  assert.ok(declarations.length,`${property} must survive the production optimizer.`);
  assert.ok(declarations.every(declaration=>declaration.value==='none'&&declaration.important),`${property} must still disable the shared important blur.`);
 }
}

test('production CSS optimization retains both important backdrop overrides for explicit Reduce translucency',()=>{
 const explicit=rule=>rule.parent.type==='root'&&rule.selector.includes('.codex-shell.reduce-translucency');
 assertOpaqueBackdropSurvives(optimizeOnboardingRule(explicit),explicit);
});

test('production CSS optimization retains both important backdrop overrides for the OS transparency preference',()=>{
 const osPreference=rule=>rule.parent.type==='atrule'&&rule.parent.name==='media'&&/prefers-reduced-transparency\s*:\s*reduce/.test(rule.parent.params);
 assertOpaqueBackdropSurvives(optimizeOnboardingRule(osPreference),osPreference);
});

test('production CSS keeps the standard blur on the mobile optional setup backdrop',()=>{
 const source=readFileSync(new URL('../src/components/auth/optional-account-setup.css',import.meta.url));
 const result=transform({filename:'optional-account-setup.css',code:source,minify:true,targets});
 const scrim=postcss.parse(result.code.toString()).nodes.find(rule=>rule.selector?.includes('.optional-setup-backdrop') && rule.nodes?.some(node=>node.prop==='backdrop-filter'));
 assert.match(scrim?.selector ?? '',/\[data-presentation=mobile\]/);
 assert.ok(scrim.nodes.some(node=>node.prop==='backdrop-filter' && node.value.startsWith('blur(')));
});
