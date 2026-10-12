import {RecordRowControls} from './RecordBlock';
import React from 'react';
import {useLocation} from 'react-router-dom';
import {PencilIcon} from 'lucide-react';
import {MobileActionSheet} from '../../components/messages/MobileActionSheet';
import {useOwnerRecord} from './OwnerRecordProvider';
import {relevantRow} from './model';
/** Only the main shell supplies this decorator; shared shells retain their sheet. */
export function RecordActionSheet(props:React.ComponentProps<typeof MobileActionSheet>){
 const record=useOwnerRecord(),location=useLocation(),match=/^\/p\/([^/]+)(?:\/c\/([^/]+))?(?:\/([^/]+))?$/.exec(location.pathname);
 const scope=match?.[3]?'project':match?.[2]?'portal':'profile';
 const row=record?.status&&props.model.viewer?.owner&&match?.[1]===record.status.profileId&&!new URLSearchParams(location.search).get('view')?.includes('journey')?relevantRow(record.status,scope,match[3]??match[2]):undefined;
 const added=row?{id:'record:'+row.key,label:row.label,icon:PencilIcon,run:()=>record?.open(row)}:null;
 return <MobileActionSheet {...props} children={row?<><div className="record-memory" role="group" aria-label={'Options for '+row.label}><RecordRowControls row={row}/></div>{props.children}</>:props.children} model={added?{...props.model,primary:[added,...props.model.primary]}:props.model} onAction={action=>{if(added&&row&&action.id===added.id){props.onClose();record?.open(row);}else props.onAction(action);}}/>;
}
