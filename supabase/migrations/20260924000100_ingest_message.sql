begin;
-- Una transacción corta asegura que un evento repetido no genere clientes ni interacciones extra.
-- No contiene llamadas externas, leases ni recuperación concurrente.
create function public.begin_ingestion(p_event jsonb, p_sha256 text, p_email text, p_phone text, p_files jsonb, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_event_id uuid;
  v_existing public.processed_events%rowtype;
  v_clients uuid[];
  v_client uuid;
  v_interaction uuid;
  v_resolution text;
  v_identity_status text;
  v_file jsonb;
begin
  insert into public.processed_events(source,source_account_id,external_message_id,payload_sha256,envelope,status,attempt_count)
  values(p_event->>'source',p_event->>'source_account_id',p_event->>'external_message_id',p_sha256,
    p_event || jsonb_build_object('origin','simulator','operator_id',p_actor),'processing',1)
  on conflict(source,source_account_id,external_message_id) do nothing returning id into v_event_id;
  if v_event_id is null then
    select * into strict v_existing from public.processed_events
    where source=p_event->>'source' and source_account_id=p_event->>'source_account_id' and external_message_id=p_event->>'external_message_id';
    return jsonb_build_object('event_id',v_existing.id,'created',false,'conflict',v_existing.payload_sha256<>p_sha256);
  end if;

  select array_agg(distinct client_id) into v_clients from public.client_identities
  where (kind='email' and value_normalized=p_email) or (kind='phone' and value_normalized=p_phone);
  if coalesce(cardinality(v_clients),0)>1 then
    v_resolution := 'conflict';
    v_identity_status := 'conflict';
  elsif cardinality(v_clients)=1 then
    v_client := v_clients[1];
    v_resolution := 'existing';
    v_identity_status := 'resolved';
  else
    insert into public.clients(display_name,status)
    values(coalesce(nullif(p_event->'sender'->>'display_name',''),p_email,p_phone,'Cliente sin identificar'),'provisional')
    returning id into v_client;
    v_resolution := 'created';
    v_identity_status := 'provisional';
  end if;

  -- Los contactos de este endpoint provienen de la operadora autenticada del simulador.
  -- Un adaptador de canal futuro deberá aportar su política de verificación explícita.
  if v_client is not null then
    if p_email is not null then
      insert into public.client_identities(client_id,kind,value_raw,value_normalized,verification_source)
      values(v_client,'email',p_event->'sender'->>'email',p_email,'manual') on conflict(kind,value_normalized) do nothing;
    end if;
    if p_phone is not null then
      insert into public.client_identities(client_id,kind,value_raw,value_normalized,verification_source)
      values(v_client,'phone',p_event->'sender'->>'phone',p_phone,'manual') on conflict(kind,value_normalized) do nothing;
    end if;
    -- Una carrera entre mensajes diferentes no puede asociar silenciosamente una identidad ajena.
    if exists(select 1 from public.client_identities where client_id<>v_client and
      ((kind='email' and value_normalized=p_email) or (kind='phone' and value_normalized=p_phone))) then
      raise exception 'Identity changed while creating interaction' using errcode='23505';
    end if;
  end if;

  insert into public.interactions(event_id,client_id,source,source_account_id,external_message_id,external_thread_id,
    sender_snapshot,subject,message_text,occurred_at,identity_status,identity_resolution)
  values(v_event_id,v_client,p_event->>'source',p_event->>'source_account_id',p_event->>'external_message_id',p_event->>'external_thread_id',
    p_event->'sender',p_event->>'subject',p_event->>'text',(p_event->>'occurred_at')::timestamptz,v_identity_status,
    jsonb_build_object('resolution',v_resolution,'candidate_client_ids',coalesce(to_jsonb(v_clients),'[]'::jsonb),
      'missing_identity',p_email is null and p_phone is null)) returning id into v_interaction;

  for v_file in select * from jsonb_array_elements(p_files) loop
    insert into public.documents(interaction_id,external_attachment_id,original_filename,safe_filename,mime_type,size_bytes,sha256)
    values(v_interaction,v_file->>'external_attachment_id',v_file->>'filename',v_file->>'safe_filename',
      v_file->>'mime_type',(v_file->>'size_bytes')::bigint,v_file->>'sha256');
  end loop;
  return jsonb_build_object('event_id',v_event_id,'created',true,'conflict',false);
end;
$$;
revoke all on function public.begin_ingestion(jsonb,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.begin_ingestion(jsonb,text,text,text,jsonb,uuid) to service_role;
commit;
