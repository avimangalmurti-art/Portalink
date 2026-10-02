export function shouldWelcomePublicVisitor(presentation: string, routeKind: string, hasProfile: boolean, completed: boolean, accountFlowOpen: boolean): boolean {
  return presentation === 'mobile' && routeKind === 'sharedProfile' && hasProfile && !completed && !accountFlowOpen;
}
