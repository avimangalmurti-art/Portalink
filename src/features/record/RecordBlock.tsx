import React,{useState} from 'react';
import {useOwnerRecord} from './OwnerRecordProvider';
import {recordRows,relevantRow,type RecordRow} from './model';
import './record.css';
export function RecordRowControls({row,compact=false}:{row:RecordRow;compact?:boolean}){
 const record=useOwnerRecord(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const memory=async(event:'snooze'|'never')=>{setBusy(true);setError('');try{await record?.remember(event,row.key);}catch{setError('Could not save. Try again.');}finally{setBusy(false);}};
 return <><button disabled={busy} onClick={()=>void memory('snooze')}>Not now</button>{!compact&&<button disabled={busy} onClick={()=>void memory('never')}>Never</button>}{error&&<small role="alert">{error}</small>}</>;
}
export function RecordBlock(){
 const record=useOwnerRecord();if(!record)return null;
 if(!record.status)return <section className="owner-record"><h2>Your record</h2><p>{record.error||'Loading your record…'}</p>{record.error&&<button onClick={record.refresh}>Try again</button>}</section>;
 const steps=recordRows(record.status,'steps'),tidy=recordRows(record.status,'tidyups'),done=steps.filter(row=>row.done).length;
 if(done===steps.length&&!tidy.length&&record.status.linkChecksReady)return <section className="owner-record"><p>Your record is complete</p></section>;
 const list=(rows:typeof steps)=> <ul>{rows.map(row=><li key={row.key} className={row.done||row.memory==='snoozed'?'record-muted':''}><button className="record-target" onClick={()=>record.open(row)}><span>{row.done?'✓ ':''}{row.label}</span><span aria-hidden="true">›</span></button>{!row.done&&<div className="record-memory"><RecordRowControls row={row}/></div>}</li>)}</ul>;
 return <section className="owner-record"><h2>Your record</h2><p>This is what someone sees when they open your link.</p><p>{done} of {steps.length} done · {tidy.length} {tidy.length===1?'tidy-up':'tidy-ups'}</p><h3>Steps</h3>{list(steps)}{tidy.length>0&&<><h3>Tidy-ups</h3>{list(tidy)}</>}{record.error&&<p role="alert">{record.error}</p>}{!record.status.linkChecksReady&&<p>Profile link checks are pending.</p>}</section>;
}
export function RecordSingleLine({scope,projectId}:{scope:'home'|'publish';projectId?:string}){
 const record=useOwnerRecord();if(!record?.status||scope==='home'&&!record.away)return null;const row=relevantRow(record.status,scope,projectId);if(!row)return null;
 return <div className="owner-record-line"><span>{row.label}</span><button onClick={()=>record.open(row)}>Do it</button><RecordRowControls row={row} compact/></div>;
}
