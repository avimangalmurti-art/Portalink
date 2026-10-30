import React, { useId, useRef, useState } from 'react';
import { ArrowLeftIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, Clock3Icon, HeartIcon, LockKeyholeIcon, MessageCircleIcon, ShieldCheckIcon, SparklesIcon, UsersIcon } from 'lucide-react';
import type { Profile } from '../../types/domain';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../../presentation/usePresentation';
import { calendarMonth, localToday, moveCalendarMonth } from '../journey/calendar';
import './socal.css';

export type SoCalPageProps = {
  profile: Profile;
  isOwner: boolean;
  onBack: () => void;
  backLabel?: string;
  onMessage?: () => void;
};

const tabs = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDaysIcon },
  { id: 'ai', label: 'Your AI', icon: SparklesIcon },
  { id: 'rules', label: 'Rules', icon: ShieldCheckIcon },
] as const;
type SoCalTab = typeof tabs[number]['id'];

/** Date-only arithmetic and formatting stay in UTC; today comes from local time. */
function formatDate(day: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

const weekdays = Array.from({ length: 7 }, (_, index) => {
  const day = `2024-01-${String(7 + index).padStart(2, '0')}`;
  return { label: formatDate(day, { weekday: 'short' }), name: formatDate(day, { weekday: 'long' }) };
});

/** SoCal's first release exposes the section without inventing connected data. */
export function SoCalPage({ profile, isOwner, onBack, onMessage, backLabel = 'Back to profile' }: SoCalPageProps) {
  const presentation = usePresentation();
  const id = useId();
  const [tab, setTab] = useState<SoCalTab>('calendar');
  const [today, setToday] = useState(localToday);
  const [month, setMonth] = useState(() => moveCalendarMonth(today, 0));
  const [selected, setSelected] = useState(today);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const monthLabel = formatDate(month, { month: 'long', year: 'numeric' });

  const changeMonth = (offset: number) => {
    const next = moveCalendarMonth(month, offset);
    setMonth(next);
    setSelected(next);
  };
  const goToday = () => {
    const day = localToday();
    setToday(day);
    setMonth(moveCalendarMonth(day, 0));
    setSelected(day);
  };

  return <section className="socal-page" data-socal-section="" data-socal-owner={isOwner ? 'true' : 'false'} data-presentation={presentation} aria-labelledby={`${id}-title`}>
    <header className="socal-header" data-mobile-safe-header={presentation === 'mobile' ? '' : undefined}>
      <ScreenBack action={onBack} visibleOnMobile>
        <Button variant="ghost" className="socal-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
          <InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl />
        </Button>
      </ScreenBack>
      <div className="socal-heading">
        <h1 id={`${id}-title`}>SoCal</h1>
        <p>{isOwner ? 'Your social calendar' : profile.name}</p>
      </div>
      {isOwner && <span className="socal-private"><InterfaceIcon icon={LockKeyholeIcon} size="sm" /><span>Private</span></span>}
    </header>

    {isOwner ? <>
      <div className="socal-tabs" role="tablist" aria-label="SoCal sections">
        {tabs.map((item, index) => <button key={item.id} ref={node => { tabButtons.current[index] = node; }} type="button" role="tab" id={`${id}-${item.id}-tab`} aria-selected={tab === item.id} aria-controls={`${id}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
          let next: number;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault();
          setTab(tabs[next].id);
          tabButtons.current[next]?.focus();
        }}><InterfaceIcon icon={item.icon} size="sm" /><span>{item.label}</span></button>)}
      </div>
      <div className="socal-body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`}>
        {tab === 'calendar' && <>
          <div className="socal-intro"><h2>Time for the people you enjoy</h2><p>Browse your dates. Saving plans and connecting your calendars aren’t available yet.</p></div>
          <section className="socal-calendar" aria-label="Calendar date browser">
            <div className="socal-month-controls">
              <Button variant="ghost" className="socal-calendar-arrow" onClick={() => changeMonth(-1)} aria-label="Previous month"><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /></Button>
              <h3 id={`${id}-month`} aria-live="polite" aria-atomic="true">{monthLabel}</h3>
              <Button variant="ghost" className="socal-calendar-arrow" onClick={() => changeMonth(1)} aria-label="Next month"><InterfaceIcon icon={ChevronRightIcon} mirroredInRtl /></Button>
            </div>
            <div className="socal-calendar-caption"><span>Choose a date</span><Button variant="ghost" size="sm" onClick={goToday}>Today</Button></div>
            <div className="socal-calendar-dates">
              <table className="socal-calendar-grid" aria-labelledby={`${id}-month`}>
                <thead><tr>{weekdays.map(day => <th scope="col" key={day.name}><abbr title={day.name}>{day.label}</abbr></th>)}</tr></thead>
                <tbody>{calendarMonth(month).map((week, row) => <tr key={row}>{week.map((day, column) => <td key={day || `blank-${column}`}>
                  {day && <button type="button" data-socal-date={day} aria-label={formatDate(day, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} aria-pressed={selected === day} aria-current={day === today ? 'date' : undefined} onClick={() => setSelected(day)}>{Number(day.slice(-2))}</button>}
                </td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="socal-setup" aria-labelledby={`${id}-date`}>
            <span className="socal-section-icon"><InterfaceIcon icon={CalendarDaysIcon} size="lg" /></span>
            <div><h3 id={`${id}-date`} aria-live="polite"><time dateTime={selected}>{formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</time></h3><p className="socal-setup-label">Calendar isn’t connected yet</p><p>Saved plans aren’t connected here yet. Selecting a date doesn’t create a plan or reserve time.</p></div>
          </section>
          <p className="socal-privacy"><InterfaceIcon icon={LockKeyholeIcon} size="sm" /><span>Your calendar is private. This date browser doesn’t share your availability.</span></p>
        </>}

        {tab === 'ai' && <>
          <div className="socal-intro"><h2>Your private planning AI</h2><p>A place for help making social plans, with you in control.</p></div>
          <section className="socal-setup socal-setup-roomy">
            <span className="socal-section-icon"><InterfaceIcon icon={SparklesIcon} size="lg" /></span>
            <div><h3>AI planning isn’t connected yet</h3><p>Background matching, AI updates, and automatic scheduling aren’t running. Your assistant hasn’t read your calendar or contacted anyone.</p></div>
          </section>
          <section className="socal-explanation"><h3>When planning is connected</h3><p>Your AI will use the people, interests, and times you allow to suggest plans. A proposal will need your approval unless both people have already allowed that kind of scheduling.</p></section>
          <p className="socal-privacy"><InterfaceIcon icon={LockKeyholeIcon} size="sm" /><span>This is your private space. Visitors can’t open your AI view or planning rules.</span></p>
        </>}

        {tab === 'rules' && <>
          <div className="socal-intro"><h2>Plans on your terms</h2><p>Planning rules aren’t active yet. When setup is available, you’ll choose what your AI is allowed to do.</p></div>
          <dl className="socal-rule-list">
            <div><dt><InterfaceIcon icon={UsersIcon} /><span>People you trust</span></dt><dd>Choose who your AI can coordinate with.</dd></div>
            <div><dt><InterfaceIcon icon={HeartIcon} /><span>Activities and budget</span></dt><dd>Set the kinds of social plans you enjoy and what you’re comfortable spending.</dd></div>
            <div><dt><InterfaceIcon icon={Clock3Icon} /><span>Time and frequency</span></dt><dd>Protect downtime and travel time, and limit how often plans are suggested.</dd></div>
            <div><dt><InterfaceIcon icon={ShieldCheckIcon} /><span>Your approval</span></dt><dd>Review each plan, or explicitly allow specific plans with trusted people.</dd></div>
          </dl>
          <p className="socal-privacy"><InterfaceIcon icon={LockKeyholeIcon} size="sm" /><span>No planning permissions have been granted here. Rules can’t be saved or activated yet.</span></p>
        </>}
      </div>
    </> : <div className="socal-body">
      <div className="socal-intro"><h2>Make a plan together</h2><p>Social plans start with what each person chooses to share.</p></div>
      <section className="socal-visitor-section"><h3>Shared activities</h3><p>Shared activities aren’t connected yet. No activity preferences are available here.</p></section>
      <section className="socal-visitor-section"><h3>Shared availability</h3><p>Shared times aren’t connected yet. This page doesn’t show {profile.name}’s calendar or imply they’re free.</p></section>
      {onMessage && <section className="socal-message-section"><h3>Start with a message</h3><p>You can discuss a plan through Portalink Messages.</p><Button variant="primary" icon={MessageCircleIcon} fullWidth onClick={onMessage}>Message {profile.name}</Button></section>}
      <p className="socal-privacy"><InterfaceIcon icon={LockKeyholeIcon} size="sm" /><span>Personal calendars, AI conversations, and planning rules stay private.</span></p>
    </div>}
  </section>;
}
