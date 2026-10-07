import type { PortfolioCard } from './shareModel';
export function PortfolioPreview({ card, url }: { card: PortfolioCard; url: string }) {
  return <div className="link-preview-card">{card.image && <img src={card.image} width={card.width ?? 800} height={card.height ?? 800} alt="Creator profile picture" />}<div><strong>{card.title}</strong><p>{card.description}</p><small>{new URL(url).host}</small></div></div>;
}
