const itemPrices: Record<string, string> = {
  'Studio Luma': '$2,400',
  'Maison Atelier': '$180',
  'Common Ground': '$320',
  'North Star Works': '$280',
  'Field Notes Supply': '$24',
  'Orbit House': '$145',
  'Side Street Radio': '$290',
  'Good Company': '$72',
  'Form Practice': '$285',
  'Morrow Workshop': '$48',
  'Clay Assembly': '$68',
  'Wide Margin': '$55',
  'Day Shift Objects': '$195',
  'Still Form': '$120',
  'Tide & Form': '$185',
  'Paper Index': '$72'
};

export function getItemPrice(itemName: string): string {
  return itemPrices[itemName] ?? '$65';
}