import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const tokens = sourceModule('src/data/navButtonTokens.ts');
const appearanceModule = sourceModule('src/components/auth/MobileOnboarding.tsx', {
  react: React, 'lucide-react': { ArrowRightIcon:'arrow', CheckIcon:'check' },
  '../../data/navButtonTokens': tokens,
  '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown() {} },
  '../ui/AppearanceSwitch': { AppearanceSwitch:'switch' }, '../ui/Button': { Button:'button' },
});
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
function component(presentation, appearanceOpen = true) {
  return sourceModule('src/components/auth/OptionalAccountSetup.tsx', {
    react: { ...React, useRef: () => ({current:null}), useState: () => [appearanceOpen, () => {}] },
    'lucide-react': { ArrowRightIcon:'arrow', ChevronDownIcon:'chevron', PaletteIcon:'palette', XIcon:'close' },
    '../../hooks/useModalFocus': { useModalFocus() {} }, '../../hooks/useDialogViewport': { useDialogViewport: () => ({current:null}) },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../data/navButtonTokens': tokens,
    '../ui/InterfaceIcon': { InterfaceIcon:'icon' }, './MobileOnboarding': appearanceModule,
    './oneScreenEntry.css': {}, './first-login-welcome.css': {}, './optional-account-setup.css': {},
  }).OptionalAccountSetup;
}
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => Number.parseInt(value,16)/255);
  const linear = rgb.map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  return linear[0]*.2126 + linear[1]*.7152 + linear[2]*.0722;
}
function contrast(a,b) {
  const [low,high] = [luminance(a),luminance(b)].sort((x,y)=>x-y);
  return (high+.05)/(low+.05);
}
function composite(material, backdrop) {
  const [red, green, blue, alpha] = material.slice(5, -1).split(',').map(Number);
  const channels = [red, green, blue].map(channel => Math.round(channel * alpha + backdrop * (1 - alpha)));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}
const base = { accentColor:'#FF375F', highContrast:false, reduceTranslucency:false,
  onAccentColorChange() {}, onHighContrastChange() {}, onReduceTranslucencyChange() {}, onSystemGrayChange() {}, onDone() {}, onFirstProject() {} };

test('the real account card visibly resolves all six grays with readable resting and hover ink in both presentations', () => {
  for (const presentation of ['mobile','web']) {
    const OptionalAccountSetup = component(presentation);
    for (const theme of ['light','dark']) for (const highContrast of [false,true]) for (const reduceTranslucency of [false,true]) {
      const surfaces = new Set();
      for (const gray of tokens.systemGrays) {
        const tree = OptionalAccountSetup({...base, theme, systemGray:gray.id, highContrast, reduceTranslucency});
        const card = nodes(tree).find(node => node.props.role === 'dialog');
        const style = card.props.style;
        assert.equal(style['--optional-setup-surface'],gray[theme]);
        assert.equal(card.props['data-setup-high-contrast'],highContrast || undefined);
        const material = style['--optional-setup-material'];
        if (highContrast || reduceTranslucency) assert.equal(material,gray[theme]);
        else {
          assert.match(material,/^rgba\(.*0\.92\)$/);
          for (const backdrop of [0,255]) assert.ok(contrast(composite(material,backdrop),style['--optional-setup-foreground']) >= 4.5);
        }
        surfaces.add(style['--optional-setup-surface']);
        assert.ok(contrast(style['--optional-setup-surface'],style['--optional-setup-foreground']) >= 4.5);
        assert.ok(contrast(style['--optional-setup-hover-surface'],style['--optional-setup-hover-foreground']) >= 4.5);
        assert.ok(contrast(style['--optional-setup-surface'],style['--optional-setup-focus-ring']) >= 4.5);
        assert.equal(style['--accent-primary'],undefined,'The neutral panel must not replace the chosen primary accent.');
      }
      assert.equal(surfaces.size,6,'Every gray choice must visibly change the actual card, even with accessibility settings enabled.');
    }
  }
});

test('a real gray radio selection updates the actual card while accent, accessibility and account actions keep their callbacks', () => {
  for (const presentation of ['mobile','web']) {
    const OptionalAccountSetup = component(presentation), calls=[];
    const props = {...base, theme:'dark', systemGray:'gray6',
      onSystemGrayChange(value) {props.systemGray=value;calls.push(['gray',value]);},
      onAccentColorChange:value=>calls.push(['accent',value]),
      onHighContrastChange:value=>calls.push(['contrast',value]),
      onReduceTranslucencyChange:value=>calls.push(['solid',value]),
      onDone:()=>calls.push(['done']), onFirstProject:()=>calls.push(['idea'])};
    const before = OptionalAccountSetup(props);
    const controls = nodes(before).find(node=>node.type===appearanceModule.MobileOnboardingAppearance);
    const appearance = appearanceModule.MobileOnboardingAppearance(controls.props);
    const groups = nodes(appearance).filter(node=>node.props.role==='radiogroup');
    nodes(groups[0]).find(node=>node.props['aria-label']==='System Gray 3').props.onClick();
    const after = OptionalAccountSetup(props), card=nodes(after).find(node=>node.props.role==='dialog');
    assert.equal(card.props.style['--optional-setup-surface'],'#48484A');
    const refreshed = appearanceModule.MobileOnboardingAppearance({...controls.props,systemGray:props.systemGray});
    const grayRadios = nodes(refreshed).filter(node=>node.props.role==='radio').slice(0,6);
    assert.equal(grayRadios.filter(node=>node.props['aria-checked']).length,1);
    assert.equal(grayRadios.find(node=>node.props['aria-checked']).props['aria-label'],'System Gray 3');
    assert.equal(grayRadios.find(node=>node.props['aria-checked']).props.tabIndex,0);
    nodes(groups[1]).find(node=>node.props['aria-label']==='Blue').props.onClick();
    nodes(appearance).filter(node=>node.type==='switch').forEach(node=>node.props.onToggle());
    const publish = nodes(after).find(node=>node.props.className==='optional-setup-primary');
    if (presentation === 'web') publish.props.onClick();
    else assert.equal(publish, undefined);
    nodes(after).find(node=>node.props.className==='optional-setup-skip').props.onClick();
    assert.deepEqual(calls,[['gray','gray3'],['accent','#0A84FF'],['contrast',true],['solid',true],...(presentation === 'web' ? [['idea']] : []),['done']]);
    assert.equal(nodes(after).find(node=>node.props.className==='optional-setup-appearance-toggle').props['data-ui-shape'],'action');
  }
});

test('collapsed mobile setup offers only appearance and Skip for now', () => {
  const setup = component('mobile', false);
  const tree = setup({...base, onFirstProject() { assert.fail('mobile setup cannot start publishing'); }});
  assert.deepEqual(nodes(tree).filter(node => node.type === 'button').map(node => node.props.className), [
    'optional-setup-appearance-toggle', 'optional-setup-skip',
  ]);
  assert.equal(nodes(tree).find(node => node.props.id === 'optional-setup-description').props.children, 'Choose how Portalink looks.');
  const web = component('web', false)({...base, onFirstProject() {}});
  assert.ok(nodes(web).some(node => node.props['aria-label'] === 'Skip account setup'));
  assert.ok(nodes(web).some(node => node.props.className === 'optional-setup-primary'));
});

test('card CSS consumes the selected neutral material without changing primary accent or existing mobile spacing and action heights', () => {
  const css=readFileSync('src/components/auth/optional-account-setup.css','utf8');
  assert.match(css,/background:var\(--optional-setup-surface,var\(--surface-raised\)\)/);
  assert.match(css,/\[data-presentation='mobile'\][^{]+> \.optional-account-setup\s*\{[^}]+background: var\(--optional-setup-fill, var\(--optional-setup-material/);
  assert.match(css,/\[data-presentation='mobile'\][^{]+> :is\(header, \.optional-setup-content, \.optional-setup-actions\)\s*\{\s*background: transparent/);
  assert.match(css,/@media \(prefers-reduced-transparency: reduce\)[^}]+--optional-setup-fill: var\(--optional-setup-surface\)/);
  assert.match(css,/--text-secondary:var\(--optional-setup-foreground\)/);
  assert.match(css,/--surface-placeholder:var\(--optional-setup-selected-surface\)/);
  assert.match(css,/\.optional-setup-primary\s*\{[^}]*min-height:44px;[^}]*background:var\(--accent-primary\);[^}]*color:var\(--accent-foreground\)/);
  assert.match(css,/\[data-presentation='web'\]\s+\.optional-setup-primary\s*\{\s*min-height:40px;/);
  assert.match(css,/\[data-presentation='mobile'\][^{]+\[data-appearance-open='false'\][^{]+>p\s*\{\s*margin-bottom:20px;/);
  assert.match(css,/\[data-presentation='mobile'\][^{]+\[data-appearance-open='false'\][^{]+appearance-toggle\s*\{\s*margin-top:auto;/);
});
