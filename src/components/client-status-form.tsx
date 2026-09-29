"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
type Status='provisional'|'active'|'archived';
export function ClientStatusForm({clientId,status}:{clientId:string;status:Status}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const router=useRouter();
  const next=status==='active'?'archived':status==='archived'?'active':'active';
  const label=status==='provisional'?'Confirmar cliente':status==='active'?'Archivar cliente':'Restaurar cliente';
  async function update(){setBusy(true);setError('');try{const response=await fetch(`/api/v1/clients/${clientId}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(result?.error?.message||'No se pudo actualizar el cliente.');router.refresh();}catch(error){setError(error instanceof Error?error.message:'No se pudo actualizar el cliente.');}finally{setBusy(false);}}
  return <div className="client-status-action"><button className={status==='active'?'secondary':'button'} type="button" onClick={update} disabled={busy}>{busy?'Guardando…':label}</button>{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}