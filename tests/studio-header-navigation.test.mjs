import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
const nodes = n => React.isValidElement(n) ? [n, ...React.Children.toArray(n.props.children).flatMap(nodes)] : [];
test('Studio header exposes Bookmarks without New project or Insights', () => {
 const { StudioWorkbenchHeader } = sourceModule('src/features/studio/StudioWorkbenchView.tsx', {
 'react': React, '../../presentation/mobile/MobileContextActions': { MobileContextButton: 'actions' },
 'lucide-react': {}, '../../components/media/ProjectCover': {}, './StudioRow': {}, './StudioActionSheet': {},
 './workbenchModel': {}, './studio-workbench.css': {},
 });
 let opened = false;
 const tree = StudioWorkbenchHeader({ onBookmarks: () => { opened = true; }, onReads() {}, workspace: { onContinue() {} } });
 assert.deepEqual(nodes(tree).filter(n => n.type === 'strong').map(n => n.props.children), ['Bookmarks']);
 nodes(tree).find(n => n.type === 'button').props.onClick();
 assert.equal(opened, true);
});
