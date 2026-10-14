import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { MobileBackScope, ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../../presentation/usePresentation';
import type { JourneyTimelineEntry } from '../citations/journeyCitations';
import { calendarDay, calendarMonth, calendarWeek, localToday, moveCalendarMonth } from './calendar';
import './journey-month-calendar.css';

const formatDay = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
/** A read-only month view of the same authorized entries shown in the Journey agenda. */
export function JourneyMonthCalendar({ days, onSelect, onClose }: {
  days: readonly [string, JourneyTimelineEntry[]][];
  onSelect: (day: string) => void;
  onClose: () => void;
}) {
  const presentation = usePresentation();
  const isMobile = presentation === 'mobile';
  const viewport = useDialogViewport<HTMLDivElement>();
  const dialog = useRef<HTMLElement>(null);
  const [today] = useState(localToday);
  const [month, setMonth] = useState(() => moveCalendarMonth(today, 0));
  const monthTargets = useRef(new Map<string, HTMLElement>());
  const dayTargets = useRef(new Map<string, HTMLButtonElement>());
  const pendingScroll = useRef<{ month: string; day?: string } | null>(null);
  useModalFocus(true, dialog, onClose, true);
  const work = useMemo(() => {
    const record = new Map<string, JourneyTimelineEntry[]>();
    for (const [day, entries] of days) {
      if (!calendarDay(day)) continue;
      if (!entries.length) continue;
      record.set(day, [...new Map([...(record.get(day) ?? []), ...entries].map(entry => [entry.kind === 'project' ? `project:${entry.project.id}` : `citation:${entry.event.id}`, entry])).values()]);
    }
    return record;
  }, [days]);
  const months = [month, moveCalendarMonth(month, 1)];
  const weekdays = calendarWeek(today).map(day => ({ name: formatDay(day, { weekday: 'long' }), label: formatDay(day, { weekday: 'narrow' }) }));
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    pendingScroll.current = null;
    (target.day ? dayTargets.current.get(target.day) : monthTargets.current.get(target.month))?.scrollIntoView({ block: target.day ? 'center' : 'start', behavior: 'instant' });
  });
  const moveMonth = (offset: number) => {
    const next = moveCalendarMonth(month, offset);
    pendingScroll.current = { month: next };
    setMonth(next);
  };
  const goToday = () => {
    const current = moveCalendarMonth(today, 0);
    if (month === current) dayTargets.current.get(today)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    else { pendingScroll.current = { month: current, day: today }; setMonth(current); }
  };

  return <MobileBackScope active enabled><ModalPortal><div ref={viewport} data-presentation={presentation} className="journey-month-calendar-overlay" onPointerDown={event => { if (!isMobile && event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="journey-month-calendar-screen" role="dialog" aria-modal="true" aria-labelledby={`journey-month-calendar-title journey-month-${month}`} tabIndex={-1}>
      <h1 id="journey-month-calendar-title" className="sr-only">Timeline calendar</h1>
      <header className="journey-month-calendar-toolbar">
        <ScreenBack action={onClose} visibleOnMobile><button type="button" className="journey-month-calendar-close" aria-label={isMobile ? 'Back to Timeline' : 'Close calendar'} onClick={onClose}>
          {isMobile ? <ArrowLeftIcon size={22} aria-hidden="true" /> : <XIcon size={22} aria-hidden="true" />}
        </button></ScreenBack>
        <div className="journey-month-calendar-navigation" role="group" aria-label="Browse Timeline months">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeftIcon size={22} aria-hidden="true" /></button>
          <span aria-live="polite" aria-atomic="true">{formatDay(month, { month: 'short', year: 'numeric' })}</span>
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRightIcon size={22} aria-hidden="true" /></button>
        </div>
        <button type="button" className="journey-month-calendar-today" onClick={goToday}>Today</button>
      </header>
      <div className="journey-month-calendar-scroll">
        {months.map(first => <section key={first} ref={element => { if (element) monthTargets.current.set(first, element); else monthTargets.current.delete(first); }} className="journey-month-calendar-month">
          <h2 id={`journey-month-${first}`}><span>{formatDay(first, { month: 'long' })}</span><small>{formatDay(first, { year: 'numeric' })}</small></h2>
          <table aria-labelledby={`journey-month-${first}`}>
            <thead><tr>{weekdays.map(day => <th key={day.name} scope="col" aria-label={day.name}>{day.label}</th>)}</tr></thead>
            <tbody>{calendarMonth(first).map((week, row) => <tr key={row}>{week.map((day, column) => {
              if (!day) return <td key={`blank-${column}`} className="journey-month-calendar-blank" aria-hidden="true" />;
              const entries = work.get(day) ?? [];
              const categories = [...new Set(entries.map(entry => entry.kind === 'project' ? entry.project.categoryId : 'citation'))].slice(0, 3);
              const count = entries.length;
              const projects = entries.filter(entry => entry.kind === 'project').length, citations = count - projects;
              const details = [projects ? `${projects} posted ${projects === 1 ? 'project' : 'projects'}` : '', citations ? `${citations} ${citations === 1 ? 'citation' : 'citations'}` : ''].filter(Boolean).join(', ');
              return <td key={day} data-weekend={column === 0 || column === 6 || undefined}>
                <button type="button" ref={element => { if (element) dayTargets.current.set(day, element); else dayTargets.current.delete(day); }}
                  data-journey-month-day={day} data-has-work={count > 0 || undefined} aria-current={day === today ? 'date' : undefined}
                  aria-label={`${formatDay(day, { dateStyle: 'full' })}${day === today ? ', Today' : ''}${count ? `: ${details}` : ''}`}
                  disabled={!count} onClick={() => { if (count) onSelect(day); }}>
                  <span className="journey-month-calendar-number" aria-hidden="true">{Number(day.slice(-2))}</span>
                  <span className="journey-month-calendar-dots" aria-hidden="true">{categories.map(category => <span key={category} data-work-category={category} />)}</span>
                </button>
              </td>;
            })}</tr>)}</tbody>
          </table>
        </section>)}
      </div>
    </section>
  </div></ModalPortal></MobileBackScope>;
}
