/** Default sizes describe each panel's job; resize limits remain independent. */
export const panelLayoutDefaults = {
  navigation: 280,
  projectIndex: 280,
  engagement: 304,
  sharedDetails: 240,
} as const;

export const PANEL_LAYOUT_RESET_EVENT = 'portalink:reset-panel-widths';
