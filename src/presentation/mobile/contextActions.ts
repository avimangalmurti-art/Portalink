import { BookmarkIcon, ChartNoAxesColumnIcon, CheckIcon, CopyIcon, EyeIcon, Globe2Icon, Grid2X2Icon, ImageIcon, ListIcon, MapPinIcon, MessageCircleIcon, PencilIcon, PlusIcon, RefreshCwIcon, SearchIcon, SettingsIcon, ShareIcon, QuoteIcon, Trash2Icon, UserIcon, UserPlusIcon, VolumeXIcon, BanIcon, FlagIcon, HeartIcon } from 'lucide-react';
import type { InterfaceIconSource } from '../../components/ui/InterfaceIcon';

export type ContextKind = 'home' | 'profile' | 'project' | 'studio' | 'messages' | 'conversation' | 'explore' | 'shared' | 'message' | 'settings';
const icons = { viewAsVisitor: EyeIcon, projectInfo: ListIcon, cite: QuoteIcon, search: SearchIcon, explore: Globe2Icon, newProject: PlusIcon, refresh: RefreshCwIcon, settings: SettingsIcon,
  editProfile: PencilIcon, share: ShareIcon, reorder: Grid2X2Icon, insights: ChartNoAxesColumnIcon, copy: CopyIcon,
  follow: UserPlusIcon, message: MessageCircleIcon, saveCreator: BookmarkIcon, report: FlagIcon,
  saveProject: BookmarkIcon, savePage: MapPinIcon, comment: MessageCircleIcon, pageIndex: ListIcon,
  reads: ChartNoAxesColumnIcon, startHere: MapPinIcon, thenNow: Grid2X2Icon, edit: PencilIcon, cover: ImageIcon, visibility: EyeIcon, delete: Trash2Icon, select: CheckIcon, list: ListIcon,
  drafts: ListIcon, bookmarks: BookmarkIcon, categories: Grid2X2Icon, newMessage: PlusIcon, blocked: BanIcon, viewProfile: UserIcon, mute: VolumeXIcon,
  block: BanIcon, yourWorld: Globe2Icon, myCity: MapPinIcon, reset: RefreshCwIcon, signIn: UserIcon,
  createAccount: UserPlusIcon, deleteChat: Trash2Icon, react: HeartIcon, editMessage: PencilIcon, unsend: Trash2Icon, leaveLive: BanIcon };
export type ContextActionId = keyof typeof icons;
export type ContextAction = { id: string; label: string; icon: InterfaceIconSource; destructive?: boolean; run: () => void | Promise<unknown> };
export type ContextActions = { title: string; primary: ContextAction[]; groups: ContextAction[][]; kind?: ContextKind; viewer?: ContextViewer; target?: ContextTarget };
export type ContextViewer = { signedIn: boolean; owner?: boolean };
export type ContextTarget = { title?: string; handlers: Partial<Record<ContextActionId, ContextAction['run']>>; labels?: Partial<Record<ContextActionId, string>> };
const labels: Record<ContextActionId, string> = { viewAsVisitor:'View as visitor', projectInfo:'Project information', cite:'Cite', search:'Search', explore:'Explore', newProject:'New project', refresh:'Refresh feed', settings:'Settings', editProfile:'Edit profile', share:'Share', reorder:'Reorder projects', insights:'Insights', copy:'Copy link', follow:'Follow', message:'Message', saveCreator:'Save creator', report:'Report', saveProject:'Save project', savePage:'Save this page', comment:'Comment on this page', pageIndex:'Page index', reads:'Reads', startHere:'Use as Start here', thenNow:'Use in Then/Now', edit:'Edit', cover:'Change cover', visibility:'Visibility', delete:'Delete project', select:'Select', list:'List view', drafts:'Drafts', bookmarks:'Bookmarks', categories:'Categories view', newMessage:'New message', blocked:'Blocked people', viewProfile:'View profile', mute:'Mute', block:'Block', yourWorld:'Your world', myCity:'My city', reset:'Reset view', signIn:'Sign in', createAccount:'Create account', react:'React', editMessage:'Edit message', unsend:'Unsend message', deleteChat:'Delete chat', leaveLive:'Leave live session' };
const accountActions = new Set<ContextActionId>(['drafts','bookmarks','newProject','editProfile','reorder','insights','follow','message','saveCreator','startHere','thenNow','edit','cover','visibility','delete','select','newMessage','blocked','deleteChat','mute','block','react','editMessage','unsend']);
const ownerActions = new Set<ContextActionId>(['viewAsVisitor','projectInfo','reads','editProfile','reorder','insights','startHere','thenNow','edit','cover','visibility','delete']);
type Layout = { title: string; primary: ContextActionId[]; groups: ContextActionId[][] };
/** Route order and capability filtering live together; missing callbacks never become placeholders. */
export function contextActions(kind: ContextKind, viewer: ContextViewer, target: ContextTarget): ContextActions {
  const map: Record<ContextKind, Layout> = {
    home:{title:'Home',primary:['search','explore'],groups:[['refresh','settings'],['leaveLive']]},
    profile:viewer.owner ? {title:'Your profile',primary:['newProject','editProfile','share'],groups:[['viewAsVisitor','thenNow','reorder','insights','bookmarks','copy'],['settings']]} : {title:'Profile',primary:['follow','message','saveCreator'],groups:[['share','copy'],['report']]},
    project:viewer.owner ? {title:'Your project',primary:['edit','cover'],groups:[['list','projectInfo','viewProfile'],['startHere','thenNow',...(target.handlers.reads ? ['reads'] as ContextActionId[] : ['pageIndex'] as ContextActionId[]),...(target.handlers.reads || target.handlers.startHere && target.handlers.thenNow ? [] : ['copy'] as ContextActionId[]),'visibility'],['delete']]} : {title:'Project',primary:[target.handlers.savePage ? 'savePage' : 'saveProject','cite','share'],groups:[['comment','pageIndex','copy'],['report']]},
    studio:{title:'Studio',primary:['drafts','bookmarks'],groups:[['select']]},
    messages:{title:'Messages',primary:['newMessage','search'],groups:[['blocked']]},
    conversation:{title:'Conversation',primary:['viewProfile','share','mute'],groups:[['deleteChat','block','report']]},
    explore:{title:'Explore',primary:['search','yourWorld','myCity'],groups:[['reset']]},
    shared:{title:'Shared portfolio',primary:['savePage','cite','share'],groups:[['signIn','createAccount'],['comment','copy','categories','settings'],['report']]},
    message:{title:'Message',primary:['react'],groups:[['editMessage'],['unsend']]},
    settings:{title:'Settings',primary:[],groups:[]},
  };
  let count = 0;
  const take = (ids: ContextActionId[]) => ids.flatMap(id => {
    const run = target.handlers[id];
    if (!run || count >= (kind === 'profile' && viewer.owner ? 10 : kind === 'project' && viewer.owner ? 11 : 8) || (accountActions.has(id) && !viewer.signedIn) || (ownerActions.has(id) && !viewer.owner) || (viewer.signedIn && (id === 'signIn' || id === 'createAccount'))) return [];
    count++;
    return [{id, label:target.labels?.[id] ?? labels[id], icon:icons[id], run, destructive:['delete','deleteChat','report','block','unsend'].includes(id)}];
  });
  const layout = map[kind];
  return { kind, viewer, target, title:target.title ?? layout.title, primary:take(layout.primary.slice(0,3)), groups:layout.groups.map(take).filter(group=>group.length) };
}

/** Compose callbacks from the shell and the active screen, never across route kinds. */
export function mergeContextActions(models: ContextActions[]): ContextActions | undefined {
  const top = models[0];
  if (!top?.kind || !top.viewer) return top;
  const target: ContextTarget = { handlers: {}, labels: {} };
  for (const model of models.filter(item => item.kind === top.kind).reverse()) {
    Object.assign(target.handlers, model.target?.handlers);
    target.labels = { ...target.labels, ...model.target?.labels };
  }
  target.title = top.title;
  return contextActions(top.kind, top.viewer, target);
}
