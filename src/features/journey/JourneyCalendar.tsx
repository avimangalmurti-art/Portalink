import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import type { Profile, Project } from '../../types/domain';
import type { JourneyTimelineEntry } from '../citations/journeyCitations';
import { calendarDay, calendarRecord, calendarWeek, localToday, moveCalendarDay } from './calendar';
import { JourneyCover } from './JourneyView';
import { learnedLine } from './journey';
import { FormattedText } from '../../components/text/FormattedText';
import './journey-calendar.css';

const formatDay = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });

export function JourneyCalendar({ profile, owner, entries, onOpen, onDetails, onAdd, children }: {
  profile: Profile; owner: boolean; entries: JourneyTimelineEntry[];
  onOpen: (project: Project) => void; onDetails: (project: Project) => void; onAdd?: (year?: number) => void; children?: React.ReactNode;
}) {
  const today = localToday();
  const [selected, setSelected] = useState(() => entries.map(entry => calendarDay(entry.date)).filter((day): day is string => Boolean(day)).sort().at(-1) ?? today);
  const [anchor, setAnchor] = useState(selected);
  const pendingScroll = useRef<string | null>(selected);
  const root = useRef<HTMLElement>(null), header = useRef<HTMLElement>(null);
  const targets = useRef(new Map<string, HTMLElement>());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const record = useMemo(() => calendarRecord(entries, anchor), [entries, anchor]);
  const week = calendarWeek(selected);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const scope = element.closest('[data-profile-page]') ?? element.closest('main');
    const identity = scope?.querySelector<HTMLElement>('.profile-header-region');
    const measure = () => {
      // Use the existing profile header's actual height, including its safe area.
      const offset = identity && getComputedStyle(identity).position === 'sticky' ? identity.getBoundingClientRect().height : 0;
      element.style.setProperty('--journey-calendar-top', `${offset}px`);
      element.style.setProperty('--journey-calendar-height', `${header.current?.getBoundingClientRect().height ?? 0}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (identity) observer.observe(identity);
    if (header.current) observer.observe(header.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const day = pendingScroll.current;
    if (!day) return;
    pendingScroll.current = null;
    targets.current.get(day)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  useLayoutEffect(() => {
    let frame = 0;
    const track = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!root.current || !header.current || root.current.closest('[aria-hidden="true"]')) return;
        const boundary = header.current.getBoundingClientRect().bottom + 20;
        let visible: string | undefined;
        for (const [day, target] of [...targets.current].sort(([a], [b]) => a.localeCompare(b))) {
          if (target.getBoundingClientRect().top <= boundary) visible = day;
          else break;
        }
        if (visible) setSelected(visible);
      });
    };
    document.addEventListener('scroll', track, { capture: true, passive: true });
    return () => { document.removeEventListener('scroll', track, true); cancelAnimationFrame(frame); };
  }, []);

  const select = (day: string) => {
    if (!calendarDay(day)) return;
    if (day === selected && day === anchor) targets.current.get(day)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    else { pendingScroll.current = day; setSelected(day); setAnchor(day); }
  };
  const renderEntry = (entry: JourneyTimelineEntry) => entry.kind === 'citation' ? <li key={`citation:${entry.event.id}`} className="journey-calendar-entry">
    {entry.event.thumbnail && <a href={entry.event.href} className="journey-calendar-cover"><img src={entry.event.thumbnail} alt="" loading="lazy" /></a>}
    <div className="journey-calendar-copy"><a href={entry.event.href}>{entry.event.label}</a></div>
  </li> : <li key={`project:${entry.project.id}`} className="journey-calendar-entry">
    <button type="button" className="journey-calendar-cover" onClick={() => onOpen(entry.project)} aria-label={`Open ${entry.project.title}`}><JourneyCover project={entry.project} sizes="64px" /></button>
    <div className="journey-calendar-copy"><button type="button" className="journey-calendar-title" onClick={() => onOpen(entry.project)}>{entry.project.title}</button>
      <span className="journey-calendar-portal">{profile.categories.find(portal => portal.id === entry.project.categoryId)?.label}</span>
      <FormattedText className="journey-calendar-summary" text={learnedLine(entry.project)} />
    </div>
    <button type="button" className="journey-calendar-options" aria-label={`Show details for ${entry.project.title}`} aria-haspopup="dialog" onClick={() => onDetails(entry.project)}><MoreHorizontalIcon size={20} aria-hidden="true" /></button>
  </li>;

  return <section ref={root} className="journey-calendar" aria-label={`${profile.name} Journey`}>
    <header ref={header} className="journey-calendar-header">
      <div className="journey-calendar-toolbar">
        <label className="journey-calendar-month"><span>{formatDay(selected, { month: 'long' })}<small>{formatDay(selected, { year: 'numeric' })}</small></span>
          <input type="date" aria-label="Go to a Journey date" value={selected} onInput={event => select(event.currentTarget.value)} onChange={event => select(event.target.value)} />
        </label>
        <button type="button" className="journey-calendar-today" onClick={() => select(today)}>Today</button>
        <button type="button" aria-label="Previous week" onClick={() => select(moveCalendarDay(selected, -7))}><ChevronLeftIcon size={22} aria-hidden="true" /></button>
        <button type="button" aria-label="Next week" onClick={() => select(moveCalendarDay(selected, 7))}><ChevronRightIcon size={22} aria-hidden="true" /></button>
      </div>
      <div className="journey-calendar-week" role="group" aria-label="Journey week" onTouchStart={event => { const touch = event.touches[0]; drag.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={event => {
        const touch = event.changedTouches[0], start = drag.current; drag.current = null;
        if (touch && start && Math.abs(touch.clientX - start.x) > 50 && Math.abs(touch.clientY - start.y) < 30) {
          if (event.cancelable) event.preventDefault();
          select(moveCalendarDay(selected, touch.clientX < start.x ? 7 : -7));
        }
      }} onTouchCancel={() => { drag.current = null; }}>
        {week.map(day => <button type="button" key={day} aria-label={formatDay(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} aria-pressed={day === selected} aria-current={day === today ? 'date' : undefined} onClick={() => select(day)}>
          <span className="journey-calendar-weekday" aria-hidden="true">{formatDay(day, { weekday: 'narrow' })}</span><span className="journey-calendar-number" aria-hidden="true">{Number(day.slice(-2))}</span>
          <span className="journey-calendar-dot" data-has-work={record.days.some(([date, items]) => date === day && items.length > 0) || undefined} aria-hidden="true" />
        </button>)}
      </div>
    </header>
    <div className="journey-calendar-agenda">
      {record.days.map(([day, items]) => <section className="journey-calendar-day" key={day} ref={element => { if (element) targets.current.set(day, element); else targets.current.delete(day); }} aria-label={formatDay(day, { dateStyle: 'full' })}>
        <h2 data-selected={day === selected || undefined}><time dateTime={day}>{formatDay(day, { month: 'short', day: 'numeric' })}</time><span>{day === today ? 'Today' : formatDay(day, { weekday: 'long' })}</span></h2>
        {items.length ? <ol>{items.map(renderEntry)}</ol> : <p className="journey-calendar-empty">No work recorded</p>}
      </section>)}
      {record.undated.length > 0 && <section className="journey-calendar-day"><h2>Date not set</h2><ol>{record.undated.map(renderEntry)}</ol></section>}
      {children}
      {owner && onAdd && <button type="button" className="journey-calendar-add" onClick={() => onAdd()}><PlusIcon size={20} aria-hidden="true" />Add work</button>}
    </div>
  </section>;
}
