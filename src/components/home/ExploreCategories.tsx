import React, { useState } from 'react';
import { ArrowLeftIcon, SearchIcon, PaletteIcon, Building2Icon, CameraIcon, TypeIcon, MusicIcon, FilmIcon, PenToolIcon, FlaskConicalIcon, Code2Icon, ShapesIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import './exploreCategories.css';

// Display-only previews. These do not classify, query or filter actual projects.
const previews = [
  { label:'Design', icon:PaletteIcon }, { label:'Engineering', icon:Building2Icon },
  { label:'Photography', icon:CameraIcon }, { label:'Typography', icon:TypeIcon },
  { label:'Music', icon:MusicIcon }, { label:'Film', icon:FilmIcon },
  { label:'Writing', icon:PenToolIcon }, { label:'Research', icon:FlaskConicalIcon },
  { label:'Technology', icon:Code2Icon }, { label:'Art', icon:ShapesIcon },
];
export function ExploreCategories({ onBack }: { onBack:()=>void }) {
  const [query,setQuery]=useState('');
  const [notice,setNotice]=useState('');
  const visible=previews.filter(item=>item.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="explore-categories" data-explore-categories="" aria-label="Explore categories">
    <ScreenBack action={onBack}>{null}</ScreenBack>
    <header><div className="explore-categories-heading"><button type="button" onClick={onBack} aria-label="Back to Explore"><InterfaceIcon icon={ArrowLeftIcon}/></button><h1>Categories</h1></div>
      <label className="explore-categories-search"><InterfaceIcon icon={SearchIcon}/><span className="sr-only">Search categories</span><input value={query} onChange={event=>{setQuery(event.target.value);setNotice('');}} placeholder="Search categories" type="search" /></label>
      <p role="status" className="explore-categories-notice">{notice}</p>
    </header>
    <div className="explore-categories-scroll"><p className="explore-categories-intro">Browse ideas</p><div className="explore-categories-grid">{visible.map((item,index)=><button type="button" key={item.label} className="explore-category-card" data-card-size={index%3} onClick={()=>setNotice(`${item.label}: Not available yet.`)}><span>{item.label}</span><div className="explore-category-art" aria-hidden="true"><InterfaceIcon icon={item.icon}/></div></button>)}</div>{!visible.length&&<p className="explore-categories-empty">No matching categories.</p>}</div>
  </section>;
}
