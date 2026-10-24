import React, { type CSSProperties, type RefObject } from 'react';
import { Cpu, Factory, FlaskConical, Lightbulb, Palette, Rocket, Sprout, Zap } from 'lucide-react';
import { WORLD_CONNECTIONS, WORLD_FILM_MS, WORLD_INDUSTRIES, WORLD_PLACES, ideaConnections, worldArrival, worldPortalDelay, type WorldIdea } from './welcomeWorldModel';

const icons = { cultivate: Sprout, make: Factory, discover: FlaskConical, power: Zap, compute: Cpu, create: Palette, explore: Rocket };
const delay = (value: number) => ({ '--world-delay': `${value}ms` } as CSSProperties);

/** One shared moving track keeps geography, growth and visitor ideas aligned. */
export function WelcomeWorld({ trackRef, ideas }: { trackRef: RefObject<HTMLDivElement>; ideas: readonly WorldIdea[] }) {
  return <div className="catalog-welcome-map" aria-hidden="true" style={{ '--world-film-duration': `${WORLD_FILM_MS}ms` } as CSSProperties}>
    <div className="catalog-welcome-world-track" ref={trackRef}>
      {[0, 1].map(copy => <svg key={copy} className="catalog-welcome-world-copy" data-world-copy={copy}
        viewBox="0 0 1200 280" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g className="catalog-world-connections" fill="none">
          {WORLD_CONNECTIONS.map(link => <g key={link.id} style={delay(link.delay)}>{link.paths.map((path, index) => <g key={index}>
            <path className="catalog-world-link catalog-world-link-glow" d={path} pathLength={1} />
            <path className="catalog-world-link" d={path} pathLength={1} />
          </g>)}</g>)}
        </g>
        <g className="catalog-world-places">
          {WORLD_PLACES.map((place, index) => <g key={place.id} transform={`translate(${place.x} ${place.y})`}>
            <g className="catalog-world-city" style={delay(worldArrival(index, WORLD_PLACES.length, 8200))}>
              <circle className="catalog-world-city-halo" r="4.8" />
              <circle className="catalog-world-city-light" r="1.45" />
              <circle className="catalog-world-satellite" cx="-3.5" cy="-2.5" r=".55" />
              <circle className="catalog-world-satellite" cx="3.3" cy="-3.8" r=".55" />
              <circle className="catalog-world-satellite" cx="2.7" cy="3" r=".55" />
            </g>
          </g>)}
        </g>
        <g className="catalog-world-industries">
          {WORLD_INDUSTRIES.map(industry => {
            const Icon = icons[industry.id];
            return <g key={industry.id} transform={`translate(${industry.x} ${industry.y})`}>
              <g className="catalog-world-industry" data-world-portal={industry.id}
                style={{ '--world-portal-delay': `${worldPortalDelay(industry.x)}ms` } as CSSProperties}>
                <ellipse className="catalog-world-portal-ground" cy="19" rx="15" ry="2.5" />
                <g className="catalog-world-portal">
                  <ellipse className="catalog-world-portal-aura" rx="14" ry="20" />
                  <ellipse className="catalog-world-portal-window" rx="11.5" ry="17" />
                  <ellipse className="catalog-world-portal-contour" rx="9.5" ry="14.5" />
                  <path className="catalog-world-portal-horizon" d="M-7 8Q0 5 7 8M-6 11Q0 8 6 11M-4 13Q0 11 4 13" />
                  <Icon x="-5" y="-7" width="10" height="10" strokeWidth="1.5" />
                </g>
              </g>
            </g>;
          })}
        </g>
        {ideas.map(idea => <g className="catalog-world-idea" key={idea.id} data-world-idea={idea.id}>
          <g fill="none">{ideaConnections(idea).map((path, index) => <path key={index} className="catalog-world-idea-link" d={path} pathLength={1} />)}</g>
          <g transform={`translate(${idea.x} ${idea.y})`}>
            <circle className="catalog-world-idea-ring" r="3" />
            <circle className="catalog-world-idea-disc" r="4.8" />
            <Lightbulb x="-2.8" y="-2.8" width="5.6" height="5.6" strokeWidth="1.7" />
          </g>
        </g>)}
      </svg>)}
    </div>
  </div>;
}
