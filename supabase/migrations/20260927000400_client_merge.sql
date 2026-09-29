begin;

create function public.merge_clients(p_survivor_id uuid,p_merged_id uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_survivor public.clients%rowtype;
  v_merged public.clients%rowtype;
  v_identity public.client_identities%rowtype;
begin
  if p_survivor_id=p_merged_id then raise exception 'Survivor and merged client must differ' using errcode='22023'; end if;
  select * into strict v_survivor from public.clients where id=p_survivor_id for update;
  select * into strict v_merged from public.clients where id=p_merged_id for update;
  for v_identity in select * from public.client_identities where client_id=p_merged_id loop
    if exists(select 1 from public.client_identities where client_id=p_survivor_id and kind=v_identity.kind and value_normalized=v_identity.value_normalized) then
      delete from public.client_identities where id=v_identity.id;
    else
      update public.client_identities set client_id=p_survivor_id,verification_source='manual',verified_at=now() where id=v_identity.id;
    end if;
  end loop;
  update public.interactions set client_id=p_survivor_id,identity_status='resolved',identity_resolution=identity_resolution || jsonb_build_object('resolution','merged','merged_from',p_merged_id,'merged_by',p_actor,'merged_at',now()) where client_id=p_merged_id;
  update public.requests set client_id=p_survivor_id where client_id=p_merged_id;
  update public.orders set client_id=p_survivor_id where client_id=p_merged_id;
  update public.documents set desired_folder_key=replace(desired_folder_key,'clientes/'||v_merged.folder_name,'clientes/'||v_survivor.folder_name),stored_folder_key=replace(stored_folder_key,'clientes/'||v_merged.folder_name,'clientes/'||v_survivor.folder_name) where interaction_id in (select id from public.interactions where client_id=p_survivor_id) and (desired_folder_key like 'clientes/'||v_merged.folder_name||'/%' or stored_folder_key like 'clientes/'||v_merged.folder_name||'/%');
  delete from public.clients where id=p_merged_id;
  return jsonb_build_object('survivor_id',p_survivor_id,'merged_id',p_merged_id,'survivor_name',v_survivor.display_name);
exception when no_data_found then
  raise exception 'Client not found' using errcode='P0002';
end;
$$;

revoke all on function public.merge_clients(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.merge_clients(uuid,uuid,uuid) to service_role;

commit;