import type { JourneyTimelineEntry } from '../citations/journeyCitations';

const DAY = 86400000;
export function calendarDay(value: string): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day ? day : null;
}
export function moveCalendarDay(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
}
export function calendarWeek(day: string): string[] {
  const start = moveCalendarDay(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, index) => moveCalendarDay(start, index));
}
export function calendarRecord(entries: JourneyTimelineEntry[]) {
  const dated = new Map<string, JourneyTimelineEntry[]>();
  const undated: JourneyTimelineEntry[] = [];
  for (const entry of entries) {
    const day = calendarDay(entry.date);
    if (!day) undated.push(entry);
    else dated.set(day, [...(dated.get(day) ?? []), entry]);
  }
  return { days: [...dated].sort(([a], [b]) => a.localeCompare(b)), undated };
}
/** Empty calendar dates move forward to posted work, or the last available date. */
export function workCalendarDay(days: readonly string[], requested: string): string | null {
  if (!calendarDay(requested)) return null;
  return days.find(day => day >= requested) ?? days.at(-1) ?? null;
}
export function adjacentWorkDay(days: readonly string[], selected: string, direction: -1 | 1): string | null {
  return direction > 0 ? days.find(day => day > selected) ?? null : [...days].reverse().find(day => day < selected) ?? null;
}
export function moveCalendarMonth(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}
/** Sunday-first month rows, with blanks outside the requested month. */
export function calendarMonth(day: string): string[][] {
  const first = `${day.slice(0, 7)}-01`;
  const date = new Date(`${first}T00:00:00Z`);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const slots = Math.ceil((date.getUTCDay() + last.getUTCDate()) / 7) * 7;
  const start = calendarWeek(first)[0];
  return Array.from({ length: slots / 7 }, (_, week) => Array.from({ length: 7 }, (_, index) => {
    const value = moveCalendarDay(start, week * 7 + index);
    return value.slice(0, 7) === first.slice(0, 7) ? value : '';
  }));
}
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
