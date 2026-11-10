import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const densityControls = tree => nodes(tree).filter(node => node.type === 'density-control');
const wall = tree => nodes(tree).find(node => node.type === 'image-wall');

function fixture(initial = {}) {
  const state = { presentation: 'mobile', active: true, view: 'portfolio', search: '', categoryId: null, ...initial };
  const profile = { id: 'creator', name: 'Creator', location: 'London', showJourney: true, projectGridColumns: 3,
    categories: [{ id: 'work', label: 'Work' }],
    projects: [{ id: 'project-a', title: 'Project A', categoryId: 'work' }],
    links: [{ action: 'bio', label: 'Information' }], socialLinks: [],
  };
  const calls = [], changes = [];
  let columns = profile.projectGridColumns;
  const density = {
    setColumns(value) { changes.push(['commit', value]); columns = value; },
    previewColumns(value) { changes.push(['preview', value]); columns = value; },
  };
  const react = { ...React, useEffect() {}, useLayoutEffect() {}, useMemo: create => create(),
    useRef: value => ({ current: value }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
  };
  const { VisitorProfileGrid } = sourceModule('src/visitor/VisitorProfileGrid.tsx', {
    react,
    'react-router-dom': { useSearchParams: () => [new URLSearchParams(state.search), () => {}] },
    '../components/ui/StateViews': { LoadingSkeleton: 'loading' },
    '../components/ui/DensitySeparator': { DensitySeparator: 'density-control' },
    '../features/employer/EmployerOverview': { EmployerOverview: 'employer-overview' },
    '../features/journey/JourneyToggle': { JourneyToggle: 'journey-toggle' },
    '../features/journey/useJourneySelection': { useJourneySelection: () => ({ view: state.view, select(value) { state.view = value; } }) },
    '../components/profile/ProfileAvatar': { ProfileAvatar: 'profile-avatar' },
    '../components/ui/AppearanceSwitch': { AppearanceSwitch: 'appearance-switch' },
    '../components/profile/PlatformGrid': { PlatformGrid: 'profile-links' },
    '../components/profile/JustifiedImageWall': { JustifiedImageWall: 'image-wall' },
    '../components/profile/ProjectPreviewCard': { ProjectPreviewCard: 'project-card' },
    '../utils/projectPresentation': { getProjectAspectRatio: () => 1 },
    '../features/profile/profileLinks': { resolveProfileLinks: links => links },
    '../features/profile/useProjectGridDensity': { useProjectGridDensity: (...args) => { calls.push(args); return { columns, ...density }; } },
    '../app/routes': { buildPath: (_kind, params) => `/share/${params.profileId}` },
    '../contexts/AuthContext': { useAuth: () => ({ viewerProfileId: state.viewerProfileId ?? null }) },
    '../presentation/usePresentation': { usePresentation: () => state.presentation },
    '../components/profile/mobileCatalogueScroll': { repairMobileCatalogueScroll: () => false, observeMobileCatalogueScroll: () => () => {} },
    '../components/profile/profile-header.css': {},
  });
  return { state, profile, calls, changes, density,
    render: () => VisitorProfileGrid({ profile, categoryId: state.categoryId, active: state.active, onOpen() {}, onCollaboration() {}, onMessage() {}, onBack() {} }),
  };
}

test('active MOBILE and WEB public images expose one named density control directly after the profile links', () => {
 for (const presentation of ['mobile', 'web']) for (const viewerProfileId of [null, 'creator']) {
  const h = fixture({ presentation, viewerProfileId }), tree = h.render();
  const controls = densityControls(tree);
  assert.equal(controls.length, 1);
  const header = nodes(tree).find(node => node.props['data-profile-header'] !== undefined);
  const children = React.Children.toArray(header.props.children);
  const controlIndex = children.findIndex(node => node.type === 'density-control');
  const linksIndex = children.findIndex(node => node.props.id === 'profile-navigation-tools');
  assert.ok(linksIndex >= 0 && controlIndex > linksIndex, 'The control follows the existing links inside the pinned header');
  assert.equal(controlIndex, children.length - 1, 'The density control remains a direct child of the header region');
  assert.equal(controls[0].props.label, 'Projects per row');
  assert.equal(controls[0].props.columns, 3);
  assert.equal(controls[0].props.onChange, h.density.setColumns);
  assert.equal(controls[0].props.onPreview, h.density.previewColumns);
  assert.equal(wall(tree).props.columns, controls[0].props.columns);
  assert.equal(wall(tree).props.allowLayoutControls, false, 'The gallery does not add a duplicate density control');
  assert.equal(nodes(tree).find(node => node.type === 'profile-links').props.isSharedView, true);
  assert.equal(h.calls[0][0], h.profile);
  assert.equal(h.calls[0][1], false, 'A public slider never enables profile writes');
  assert.equal(h.calls[0][2], 'public-catalogue', 'The public wall uses its own density preference.');
  assert.equal(tree.props['data-public-image-catalogue'], presentation === 'mobile' ? '' : undefined, 'MOBILE flow and scroll repair retain their existing scope');
 }
});

test('public density previews, cancellation and commits feed the same local wall state', () => {
 for (const presentation of ['mobile', 'web']) for (const viewerProfileId of [null, 'creator']) {
  const h = fixture({ presentation, viewerProfileId });
  let tree = h.render();
  densityControls(tree)[0].props.onPreview(5);
  tree = h.render();
  assert.equal(wall(tree).props.columns, 5);
  assert.equal(densityControls(tree)[0].props.columns, 5);
  densityControls(tree)[0].props.onPreview(3);
  tree = h.render();
  assert.equal(wall(tree).props.columns, 3, 'Cancel can restore the original preview through the existing slider callback');
  assert.deepEqual(h.changes, [['preview', 5], ['preview', 3]]);
  for (const value of [1, 13]) {
    densityControls(tree)[0].props.onChange(value);
    tree = h.render();
    assert.equal(wall(tree).props.columns, value);
    assert.equal(densityControls(tree)[0].props.columns, value);
  }
  assert.deepEqual(h.changes.slice(2), [['commit', 1], ['commit', 13]]);
  h.state.active = false;
  assert.equal(densityControls(h.render()).length, 0);
  h.state.active = true;
  assert.equal(densityControls(h.render())[0].props.columns, 13, 'A retained catalogue returns to its current local density');
  assert.ok(h.calls.every(([receivedProfile, canSave]) => receivedProfile === h.profile && canSave === false), 'Even the signed-in owner remains a read-only public viewer');
  assert.equal(h.profile.projectGridColumns, 3, 'Local choices never mutate the published profile');
 }
});

test('Timeline, Portals and inactive public catalogues omit density controls on both presentations', () => {
  for (const [name, options] of [
    ['WEB Timeline', { presentation: 'web', view: 'journey' }],
    ['WEB Portals', { presentation: 'web', search: 'view=portals' }],
    ['inactive WEB images', { presentation: 'web', active: false }],
    ['MOBILE Timeline', { view: 'journey' }],
    ['MOBILE Portals', { search: 'view=portals' }],
    ['inactive MOBILE images', { active: false }],
  ]) {
    const h = fixture(options), tree = h.render();
    assert.equal(densityControls(tree).length, 0, name);
    assert.equal(tree.props['data-public-image-catalogue'], undefined, name);
    assert.ok(h.calls.every(([, canSave]) => canSave === false), name);
  }
});

test('returning from Timeline or Portals restores one image-catalogue slider with the current local value', () => {
 for (const presentation of ['mobile', 'web']) {
  const h = fixture({ presentation });
  densityControls(h.render())[0].props.onChange(4);
  h.state.view = 'journey';
  assert.equal(densityControls(h.render()).length, 0);
  h.state.view = 'portfolio';
  assert.equal(densityControls(h.render())[0].props.columns, 4);
  h.state.search = 'view=portals';
  assert.equal(densityControls(h.render()).length, 0);
  h.state.search = '';
  const tree = h.render();
  assert.equal(densityControls(tree).length, 1);
  assert.equal(densityControls(tree)[0].props.columns, wall(tree).props.columns);
 }
});

test('WEB category images expose the same local control without enabling owner actions', () => {
  const h = fixture({ presentation: 'web', categoryId: 'work', view: 'journey', viewerProfileId: 'creator' });
  let tree = h.render();
  assert.equal(densityControls(tree).length, 1, 'The visible category wall owns its density even if Timeline was selected on the profile');
  assert.equal(nodes(tree).some(node => node.type === 'journey-toggle'), false, 'Existing WEB category tabs stay unchanged');
  densityControls(tree)[0].props.onPreview(6);
  tree = h.render();
  assert.equal(wall(tree).props.columns, 6);
  assert.equal(wall(tree).props.allowLayoutControls, false);
  densityControls(tree)[0].props.onChange(6);
  assert.deepEqual(h.changes, [['preview', 6], ['commit', 6]]);
  assert.ok(h.calls.every(([, canSave]) => canSave === false));
  assert.equal(h.profile.projectGridColumns, 3);
});
