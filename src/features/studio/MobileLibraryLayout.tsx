import React from 'react';
import './mobile-library-layout.css';
export function MobileLibraryLayout({headerRef,fallback,active,tabs,onChange,children}:{headerRef:(node:HTMLDivElement|null)=>void;fallback:React.ReactNode;active:string;tabs:readonly string[];onChange:(id:string)=>void;children:React.ReactNode}){
 return <div className="studio-citation-shell mobile-library-layout" data-library-layout="">
  <div data-library-safe-area="" aria-hidden="true"/>
  <header className="studio-mobile-shell-header" data-library-header=""><div className="studio-mobile-header-controls" ref={headerRef}/><div className="library-header-fallback">{fallback}</div></header>
  <nav className="studio-citation-pills" data-library-tabs="" aria-label="Studio collections">{tabs.map(id=><button type="button" data-studio-pill={id} key={id} aria-pressed={active===id} onClick={()=>onChange(id)} ref={node=>{if(node&&active===id){const rail=node.parentElement;if(rail)rail.scrollLeft=node.offsetLeft-(rail.clientWidth-node.clientWidth)/2;}}}>{id[0].toUpperCase()+id.slice(1)}</button>)}</nav>
  <div data-library-spacing="" aria-hidden="true"/>
  <div className="library-section-content" data-library-content="">{children}</div>
 </div>;
}
