"use client";
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { categories,type DocumentCategory } from '@/domain/documents';
import { categoryLabels } from '@/domain/presentation';
export function ReviewForm({document}:{document:{id:string;category:DocumentCategory;tags:string[];version:number;identityPending:boolean}}) {
  const [category,setCategory]=useState(document.category);
  const [tags,setTags]=useState(document.tags.join(', '));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await fetch(`/api/v1/documents/${document.id}/review`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({category,tags:tags.split(',').map(tag=>tag.trim()).filter(Boolean),version:document.version})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'No se pudo guardar.');
      setMessage(result.identity_pending ? 'Categoría guardada. La identidad sigue pendiente de resolución (fase 3).' : 'Revisión guardada.');
      router.refresh();
    } catch(error) {setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');}
    finally {setBusy(false);}
  }
  return <form onSubmit={submit}><fieldset disabled={busy}><label htmlFor={`category-${document.id}`}>Categoría</label><select id={`category-${document.id}`} value={category} onChange={event=>setCategory(event.target.value as DocumentCategory)}>{categories.map(category=><option key={category} value={category}>{categoryLabels[category]}</option>)}</select>
    <label htmlFor={`tags-${document.id}`}>Etiquetas separadas por coma</label><input id={`tags-${document.id}`} value={tags} onChange={event=>setTags(event.target.value)} maxLength={328}/>
    {document.identityPending && <p className="notice">Este documento tiene una identidad pendiente. Corregir la categoría no asignará un cliente automáticamente.</p>}
    <button type="submit">{busy ? 'Guardando…' : 'Confirmar revisión'}</button></fieldset>{message && <p role="status">{message}</p>}</form>;
}
