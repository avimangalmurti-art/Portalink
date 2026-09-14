import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import type { FeatureCardApp } from './FeatureCard';
import { accountPlaceholderColours } from './navigation';
import { SectionLoopRow } from './SectionLoopRow';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { usePresentation } from '../presentation/usePresentation';
type HomePageProps = {
  onView: (item: FeatureCardApp) => void;
  hideHeading?: boolean;
  sections?: Array<'top-picks' | 'latest-drops' | '2010s'>;
};
type ListeningItem = FeatureCardApp & {
  artwork: string;
  title: string;
  artist: string;
  caption?: string;
  price: string;
  swatches: string[];
};
const productImages = {
  boxerPack: "/22fd3a31-7ee1-4091-a2a3-4e6d10ead21e.jpg",
  overshirt: "/7f496c2a-d0bb-4968-89eb-edb2e862ce57.jpg",
  trousers: "/46b5ea98-4408-455b-b2b1-5676122027a3.jpg",
  tee: "/052e9a28-2aa2-4f1b-8639-c936964a404c.jpg",
  jacket: "/06e22117-18b6-4186-990d-0a5e7876727d.jpg"
};
function product(name: string, tagline: string, artwork: string, price: string, swatches: string[]): ListeningItem {
  return {
    name,
    title: name,
    tagline,
    artist: tagline,
    artwork,
    price,
    swatches,
    icon: ''
  };
}
const neutralColours = ['#f5f5f5', '#b8b8b8', '#777777', '#353535', '#111111'];
const deepNeutrals = ['#1c1c1c', '#555555', '#8d8d8d', '#d4d4d4'];
const softNeutrals = ['#f8f8f8', '#d7d7d7', '#9a9a9a', '#4a4a4a'];
const topPicks: ListeningItem[] = [product('Always In Motion Boxer Brief 5\" 3 Pack', 'Everyday performance underwear', productImages.boxerPack, '$88', neutralColours), product('Lightweight Overshirt', 'Structured recycled nylon', productImages.overshirt, '$148', deepNeutrals), product('Relaxed Utility Trouser', 'Cotton canvas', productImages.trousers, '$128', ['#e1e1e1', '#8a8a8a', '#3b3b3b']), product('Heavyweight Pocket Tee', 'Organic cotton jersey', productImages.tee, '$58', softNeutrals), product('Studio Zip Hoodie', 'Brushed loopback fleece', productImages.overshirt, '$132', deepNeutrals), product('Long-Sleeve Base Layer', 'Fine ribbed cotton', productImages.tee, '$64', softNeutrals), product('Packable Field Short', 'Lightweight technical twill', productImages.trousers, '$86', neutralColours), product('Canvas Market Tote', 'Heavy cotton canvas', productImages.jacket, '$48', ['#d0d0d0', '#737373', '#242424'])];
const recentlyPlayed: ListeningItem[] = [product('Canvas Work Jacket', 'Washed cotton canvas', productImages.jacket, '$168', ['#242424', '#5f5f5f', '#c9c9c9']), product('Boxy Oxford Shirt', 'Crisp cotton poplin', productImages.overshirt, '$98', ['#fafafa', '#bdbdbd', '#494949']), product('Pull-On Studio Pant', 'Soft stretch twill', productImages.trousers, '$118', ['#787878', '#2e2e2e', '#d3d3d3']), product('Classic Crew T-Shirt', 'Heavyweight organic cotton', productImages.tee, '$48', softNeutrals), product('Everyday Boxer Brief 3 Pack', 'Breathable modal blend', productImages.boxerPack, '$72', neutralColours.slice(1)), product('Relaxed Popover Shirt', 'Crisp washed poplin', productImages.overshirt, '$112', ['#eeeeee', '#8d8d8d', '#343434']), product('Reversible Liner Vest', 'Quilted recycled nylon', productImages.jacket, '$154', deepNeutrals), product('Studio Sock Three Pack', 'Cushioned organic cotton', productImages.boxerPack, '$28', softNeutrals), product('Pleated Easy Pant', 'Soft Italian twill', productImages.trousers, '$142', ['#686868', '#b2b2b2', '#202020'])];
const decadePicks: ListeningItem[] = [product('Chore Coat', 'Textured cotton canvas', productImages.jacket, '$188', ['#202020', '#6b6b6b', '#e2e2e2']), product('Wide-Leg Field Pant', 'Garment-dyed twill', productImages.trousers, '$138', ['#717171', '#343434', '#cdcdcd']), product('Fine Jersey Tee', 'Soft pima cotton', productImages.tee, '$52', softNeutrals), product('Structured Overshirt', 'Brushed Japanese cotton', productImages.overshirt, '$158', deepNeutrals), product('Training Boxer Brief 5\"', 'Four-way stretch fabric', productImages.boxerPack, '$38', neutralColours), product('Double-Knee Workshop Pant', 'Reinforced cotton duck', productImages.trousers, '$148', ['#484848', '#838383', '#d1d1d1']), product('Gusseted Pocket Tee', 'Dense open-end jersey', productImages.tee, '$62', softNeutrals), product('Belted Travel Short', 'Crisp compact cotton', productImages.trousers, '$92', neutralColours), product('Cord Collar Jacket', 'Brushed cotton canvas', productImages.jacket, '$178', deepNeutrals)];
export function HomePage({
  onView,
  hideHeading = false,
  sections = ['top-picks', 'latest-drops', '2010s']
}: HomePageProps) {
  return <div className={`${hideHeading ? '' : 'min-h-full w-full bg-[var(--surface-canvas)] px-[var(--content-gutter)] py-6 text-[var(--text-primary)] sm:py-7'}`}>
      <main className={hideHeading ? '' : 'w-full max-w-none'}>
        {!hideHeading && <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">Home</h1>}
        {sections.map((section, index) => <HomeContentSection key={section} section={section} onView={onView} isFirst={index === 0 && !hideHeading} />)}
      </main>
    </div>;
}
function HomeContentSection({
  section,
  onView,
  isFirst




}: {section: 'top-picks' | 'latest-drops' | '2010s';onView: (item: FeatureCardApp) => void;isFirst: boolean;}) {
  if (section === 'top-picks') {
    return <SectionLoopRow id="top-picks-title" title="Top Picks for You" ariaLabel="Top Picks for You" className={isFirst ? 'mt-5' : 'mt-8'} trackClassName="gap-3">
        {topPicks.map((item) => <FeaturedPick key={item.name} item={item} onView={onView} />)}
      </SectionLoopRow>;
  }
  return <ListeningRow title={section === 'latest-drops' ? 'Latest Drops' : '2010s'} items={section === 'latest-drops' ? recentlyPlayed : decadePicks} onView={onView} />;
}
function FeaturedPick({
  item,
  onView



}: {item: ListeningItem;onView: (item: FeatureCardApp) => void;}) {
  return <ProductCard item={item} onView={onView} featured className="w-full" />;
}
function ListeningRow({
  title,
  items,
  onView




}: {title: string;items: ListeningItem[];onView: (item: FeatureCardApp) => void;}) {
  return <SectionLoopRow id={`${title.toLowerCase().replace(/\s/g, '-')}-title`} title={title} ariaLabel={title} className="mt-8" trackClassName="gap-3">
      {items.map((item) => <ProductCard key={item.name} item={item} onView={onView} className="w-full" />)}
    </SectionLoopRow>;
}
function ProductCard({
  item,
  onView,
  featured = false,
  className = ''





}: {item: ListeningItem;onView: (item: FeatureCardApp) => void;featured?: boolean;className?: string;}) {
  const [selectedColour, setSelectedColour] = useState(() => getPlaceholderColour(item.name));
  const [isColourPickerOpen, setIsColourPickerOpen] = useState(false);
  return <article className={`card-hover-outline shape-container group relative min-w-0 overflow-hidden ${className} ${isColourPickerOpen ? 'z-50' : 'z-0'}`} role="listitem">
      <div className="shape-container bg-[var(--surface-raised)] shadow-sm ring-1 ring-[var(--hairline)]">
        <div style={{
        backgroundColor: selectedColour
      }} className={`relative overflow-hidden transition-colors duration-200 ${featured ? 'aspect-[1.03] rounded-t-[22px]' : 'aspect-square rounded-t-[22px]'}`}>
          <button type="button" onClick={() => onView(item)} className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]" aria-label={`Open ${item.title}`} />
        </div>
        <div className="relative rounded-b-[inherit] border-t border-[var(--hairline)] bg-[var(--surface-raised)] px-3 py-2">
          <ColourPicker swatches={item.swatches} productName={item.title} selectedColour={selectedColour} onColourChange={setSelectedColour} onOpenChange={setIsColourPickerOpen} />
          <div className="mt-2 flex items-start gap-2">
            <button type="button" onClick={() => onView(item)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">{item.artist}</span>
            </button>
            <button type="button" onClick={() => onView(item)} aria-label={`Open ${item.title} for ${item.price}`} style={{
            color: 'var(--accent-text)',
            backgroundColor: 'var(--accent-soft)'
          }} className="shape-capsule shrink-0 px-3 py-1 text-[12px] font-semibold transition-[transform,background-color] duration-180 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {item.price}
            </button>
          </div>
        </div>
      </div>
    </article>;
}
function getPlaceholderColour(name: string): string {
  const characterTotal = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);
  return accountPlaceholderColours[characterTotal % accountPlaceholderColours.length];
}
function ColourPicker({
  swatches,
  productName,
  selectedColour,
  onColourChange,
  onOpenChange






}: {swatches: string[];productName: string;selectedColour: string;onColourChange: (colour: string) => void;onOpenChange: (isOpen: boolean) => void;}) {
  const presentation = usePresentation();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    left: 0,
    top: 0
  });
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const colourNames = ['White', 'Light Grey', 'Grey', 'Charcoal', 'Black'];
  function setPickerOpen(nextIsOpen: boolean) {
    if (nextIsOpen && triggerRef.current) {
      const triggerBounds = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        left: triggerBounds.left,
        top: triggerBounds.bottom + 8
      });
    }
    setIsOpen(nextIsOpen);
    onOpenChange(nextIsOpen);
  }
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function closeOnOutsidePress(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [isOpen, onOpenChange]);
  return <div ref={pickerRef} className="relative mt-3">
      <button ref={triggerRef} type="button" onClick={() => setPickerOpen(!isOpen)} aria-expanded={isOpen} aria-haspopup="listbox" aria-label={`Choose colour for ${productName}`} className="flex items-center gap-2 rounded-md px-1 py-1 text-[13px] font-medium text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <span aria-hidden="true" className="h-4 w-4 rounded-full ring-1 ring-[var(--hairline-strong)]" style={{
        backgroundColor: selectedColour
      }} />
        <span>Colour</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {isOpen && createPortal(<div data-presentation={presentation} role="listbox" aria-label={`Colour options for ${productName}`} className="fixed z-[100] w-52 overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface-raised)] p-1 text-[var(--text-primary)] shadow-[var(--shadow-pop)]" style={{
      left: menuPosition.left,
      top: menuPosition.top
    }}>
          {swatches.map((swatch, index) => {
        const name = colourNames[index] ?? `Colour ${index + 1}`;
        const isSelected = selectedColour === swatch;
        return <button key={swatch} type="button" role="option" aria-selected={isSelected} onClick={() => {
          onColourChange(swatch);
          setPickerOpen(false);
        }} className={`flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSelected ? 'bg-[var(--surface-selected)]' : 'hover:bg-[var(--surface-hover)]'}`}>
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{
            backgroundColor: swatch
          }} />
              <span className="flex-1">{name}</span>
              {isSelected && <InterfaceIcon icon={CheckIcon} weight="semibold" />}
            </button>;
      })}
        </div>, document.body)}
    </div>;
}
