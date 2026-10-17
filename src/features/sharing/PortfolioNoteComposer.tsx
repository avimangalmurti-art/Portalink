import { SendIcon } from 'lucide-react';
import type { Profile } from '../../types/domain';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { Button } from '../../components/ui/Button';
export function PortfolioNoteComposer({profile, counts, note, url, heading, disabled, onChange, onContinue}: {profile: Profile; counts?: {followers: string | null; following: string | null}; note: string; url: string; heading: string; disabled: boolean; onChange: (value: string) => void; onContinue: () => void}) {
  const stats = <div className="share-preview-stats"><span><b>{profile.projects.length}</b> projects</span><span><b>{profile.categories.length}</b> portals</span>{counts?.followers != null && <span><b>{counts.followers}</b> followers</span>}{counts?.following != null && <span><b>{counts.following}</b> following</span>}</div>;
  return <>
    <div className="share-introduction"><h2 id={heading}>Write a personal note</h2><p>Add a short message to include with your catalogue link when you send it to someone.</p></div>
    <section className="share-profile-preview" aria-label="Public catalogue preview">
      <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="share-profile-avatar" priority />
      <strong>{profile.name}</strong>{profile.location && <p>{profile.location}</p>}
      <div className="share-preview-tabs"><span>Catalogue</span>{profile.showJourney && <span>Timeline</span>}</div>{stats}
    </section>
    <div className="share-note-field"><div><label htmlFor={`${heading}-message`}>Your message</label><span id={`${heading}-counter`}>{note.length}/3000</span></div><textarea id={`${heading}-message`} value={note} onChange={event=>onChange(event.target.value)} maxLength={3000} rows={4} placeholder="Write a message (optional)…" aria-describedby={`${heading}-counter`} /></div>
    <section className="share-note-preview" aria-labelledby={`${heading}-preview`}><h3 id={`${heading}-preview`}>Preview</h3><div className="share-note-bubble">
      {note.trim() && <p className="share-note-text">{note}</p>}<p className="share-note-url">{url}</p>
      <div className="share-note-link-card"><CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="share-note-link-avatar" /><div><strong>{profile.name}</strong>{profile.location && <p>{profile.location}</p>}{stats}</div></div>
    </div></section>
    <Button variant="primary" className="share-note-continue" disabled={disabled} onClick={onContinue}><SendIcon size={22}/>Send to someone</Button>
  </>;
}
