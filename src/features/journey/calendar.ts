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
export function calendarRecord(entries: JourneyTimelineEntry[], selected: string) {
  const dated = new Map<string, JourneyTimelineEntry[]>();
  const undated: JourneyTimelineEntry[] = [];
  for (const entry of entries) {
    const day = calendarDay(entry.date);
    if (!day) undated.push(entry);
    else dated.set(day, [...(dated.get(day) ?? []), entry]);
  }
  // Render real record dates plus seven navigable days, never thousands of empty days.
  for (const day of calendarWeek(selected)) if (!dated.has(day)) dated.set(day, []);
  return { days: [...dated].sort(([a], [b]) => a.localeCompare(b)), undated };
}
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
