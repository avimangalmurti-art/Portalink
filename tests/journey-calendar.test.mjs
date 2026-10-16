import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/journey/calendar.ts', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Map});
const plain = value => JSON.parse(JSON.stringify(value));
test('weeks span month/year boundaries with Sunday first and exactly seven dates', () => {
  assert.deepEqual(plain(exports.calendarWeek('2027-01-01')),['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
  assert.equal(exports.moveCalendarDay('2024-02-28',1),'2024-02-29');
  assert.equal(exports.moveCalendarDay('2024-02-29',1),'2024-03-01');
  assert.equal(exports.moveCalendarDay('2026-03-08',7),'2026-03-15');
});
test('date-only work does not shift timezone and invalid dates stay undated', () => {
  assert.equal(exports.calendarDay('2026-10-13'),'2026-10-13');
  assert.equal(exports.calendarDay('2026-10-13T23:59:00Z'),'2026-10-13');
  for (const value of ['', 'invalid', '2026-02-30','2026-13-01']) assert.equal(exports.calendarDay(value),null);
});
test('sparse multi-decade record keeps every real entry without generating years of empty days', () => {
  const a={kind:'project',project:{id:'a'},date:'1990-01-01'}, b={kind:'project',project:{id:'b'},date:'2026-10-13'}, c={kind:'citation',event:{id:'c'},date:'2026-10-13'}, d={kind:'project',project:{id:'d'},date:'invalid'};
  const record=exports.calendarRecord([a,b,c,d]);
  assert.equal(record.days.length,2);
  assert.deepEqual(plain(record.days.find(([date])=>date==='2026-10-13')[1]),[b,c]);
  assert.deepEqual(plain(record.undated),[d]);
  assert.equal(record.days[0][0],'1990-01-01');
  assert.equal(exports.calendarRecord([]).days.length,0);
});
test('empty dates skip to posted work and previous/next navigation crosses gaps without an empty target', () => {
  const days=['1990-01-01','2024-02-29','2026-10-13'];
  assert.equal(exports.workCalendarDay(days,'2020-01-01'),'2024-02-29');
  assert.equal(exports.workCalendarDay(days,'2024-02-29'),'2024-02-29');
  assert.equal(exports.workCalendarDay(days,'2027-01-01'),'2026-10-13');
  assert.equal(exports.workCalendarDay([], '2026-10-13'),null);
  assert.equal(exports.workCalendarDay(days,'invalid'),null);
  assert.equal(exports.adjacentWorkDay(days,'2024-02-29',-1),'1990-01-01');
  assert.equal(exports.adjacentWorkDay(days,'2024-02-29',1),'2026-10-13');
  assert.equal(exports.adjacentWorkDay(days,'1990-01-01',-1),null);
  assert.equal(exports.adjacentWorkDay(days,'2026-10-13',1),null);
});
test('month grids show only their month with Sunday alignment, leap days and year navigation', () => {
  const feb=plain(exports.calendarMonth('2024-02-20'));
  assert.equal(feb[0][4],'2024-02-01');
  assert.equal(feb.flat().filter(Boolean).length,29);
  assert.equal(feb.at(-1)[4],'2024-02-29');
  assert.equal(exports.moveCalendarMonth('2026-12-31',1),'2027-01-01');
  assert.equal(exports.moveCalendarMonth('2026-01-31',1),'2026-02-01');
  assert.equal(exports.moveCalendarMonth('2026-01-01',-1),'2025-12-01');
});
