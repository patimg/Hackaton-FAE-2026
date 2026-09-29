begin;

create function public.resolve_interaction_identity(p_interaction_id uuid,p_client_id uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_interaction public.interactions%rowtype;
  v_email text;
  v_phone text;
  v_client public.clients%rowtype;
begin
  select * into strict v_interaction from public.interactions where id=p_interaction_id for update;
  select * into strict v_client from public.clients where id=p_client_id;
  v_email := lower(nullif(trim(v_interaction.sender_snapshot->>'email'),'') );
  v_phone := nullif(trim(v_interaction.sender_snapshot->>'phone'),'');

  if v_email is not null and exists(select 1 from public.client_identities where kind='email' and value_normalized=v_email and client_id<>p_client_id) then
    raise exception 'Email already belongs to another client' using errcode='23505';
  end if;
  if v_phone is not null and exists(select 1 from public.client_identities where kind='phone' and value_normalized=v_phone and client_id<>p_client_id) then
    raise exception 'Phone already belongs to another client' using errcode='23505';
  end if;
  if v_email is not null then
    insert into public.client_identities(client_id,kind,value_raw,value_normalized,verification_source,verified_at)
    values(p_client_id,'email',v_interaction.sender_snapshot->>'email',v_email,'manual',now()) on conflict(kind,value_normalized) do nothing;
  end if;
  if v_phone is not null then
    insert into public.client_identities(client_id,kind,value_raw,value_normalized,verification_source,verified_at)
    values(p_client_id,'phone',v_interaction.sender_snapshot->>'phone',v_phone,'manual',now()) on conflict(kind,value_normalized) do nothing;
  end if;
  update public.interactions set client_id=p_client_id,identity_status='resolved',identity_resolution=identity_resolution || jsonb_build_object('resolution','manual','missing_identity',v_email is null and v_phone is null,'resolved_by',p_actor,'resolved_at',now()) where id=p_interaction_id;
  update public.documents set review_reasons=array_remove(array_remove(review_reasons,'IDENTITY_CONFLICT'),'MISSING_IDENTITY'),classification_status=case when classification_status='needs_review' and cardinality(array_remove(array_remove(review_reasons,'IDENTITY_CONFLICT'),'MISSING_IDENTITY'))=0 then 'classified' else classification_status end where interaction_id=p_interaction_id;
  return jsonb_build_object('interaction_id',p_interaction_id,'client_id',p_client_id,'client_name',v_client.display_name);
exception when no_data_found then
  raise exception 'Interaction or client not found' using errcode='P0002';
end;
$$;

revoke all on function public.resolve_interaction_identity(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_interaction_identity(uuid,uuid,uuid) to service_role;

commit;