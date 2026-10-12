import React,{useEffect,useRef} from 'react';
import {MobileProjectDescriptionSheet} from '../../components/media/MobileProjectDescriptionSheet';
import {useProfileBioEditor} from '../profile/useProfileBioEditor';
import {usePresentation} from '../../presentation/usePresentation';
/** Main-only exact-field entry; the public Bio sheet stays byte-identical. */
export function RecordBioSheet({profileId,bio,onClose}:{profileId:string;bio?:string;onClose:()=>void}){
 const editor=useProfileBioEditor(profileId,true),mobile=usePresentation()==='mobile',entered=useRef('');
 useEffect(()=>{if(entered.current!==profileId){entered.current=profileId;void editor.open();}},[profileId,editor]);
 return <MobileProjectDescriptionSheet projectId={profileId} description={editor.savedValue??bio} contentLabel="Bio" fullScreenEditor={mobile} directEditAction={mobile} emptyMessage="No bio yet." textEditor={editor} onClose={onClose}/>;
}
