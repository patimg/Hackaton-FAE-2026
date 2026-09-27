"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
type ClientOption={id:string;display_name:string};
export function IdentityResolutionForm({interactionId,clients}:{interactionId:string;clients:ClientOption[]}) {
  const [clientId,setClientId]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const router=useRouter();
  async function submit(event:React.FormEvent<HTMLFormElement>) { event.preventDefault();setBusy(true);setMessage('');try{const response=await fetch(`/api/v1/interactions/${interactionId}/identity`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId})});const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'No se pudo resolver la identidad.');setMessage('Identidad asignada. Los archivos existentes conservan su ubicación original.');router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'No se pudo resolver la identidad.');}finally{setBusy(false);}}
  return <form onSubmit={submit}><label htmlFor={`identity-${interactionId}`}>Asignar a cliente existente</label><select id={`identity-${interactionId}`} value={clientId} onChange={event=>setClientId(event.target.value)} required disabled={busy}><option value="">Selecciona un cliente</option>{clients.map(client=><option key={client.id} value={client.id}>{client.display_name}</option>)}</select><button type="submit" disabled={busy}>{busy?'Guardando…':'Asignar identidad'}</button>{message&&<p role="status">{message}</p>}</form>;
}