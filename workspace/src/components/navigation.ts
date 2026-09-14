export const recordLabels = [
'Keinemusik',
'Afterlife',
'Innervisions',
'Experts Only',
'Black Book Records',
'Anjunadeep',
'MoBlack Records',
'Diynamic',
'Drumcode',
'Steel City Dance Discs',
'Soulistic Music',
'Watergate Records',
'Kunye',
'Rose Avenue',
'Crosstown Rebels'] as
const;

export const accountPlaceholderColours = ['#ff4245', '#ff9230', '#ffd600', '#30d158', '#00dac3', '#00d2e0', '#3cd3ef', '#0091ff', '#6678f5', '#d02fe8', '#ff375f', '#b88d69'] as const;

export function getAccountPlaceholderColour(accountName: string): string {
  const accountIndex = recordLabels.indexOf(accountName as (typeof recordLabels)[number]);
  return accountIndex >= 0 ? accountPlaceholderColours[accountIndex % accountPlaceholderColours.length] : '#a3a3a3';
}

export const portfolioCategories = [
'Soundcloud',
'User Interface Design',
'Typography',
'Product Design',
'Graphic Design',
'Structural Engineering',
'Photography',
'Architecture',
'Logo Design'] as
const;

export const navigationDestinations = [
'Today',
'Games',
'Apps',
'Arcade',
...recordLabels,
...portfolioCategories] as
const;

export type RecordLabel = (typeof recordLabels)[number];
export type PortfolioCategory = (typeof portfolioCategories)[number];
export type NavigationDestination = (typeof navigationDestinations)[number];