begin;

create or replace function public.search_documents(p_client_id uuid,p_category text,p_source text,p_date_from date,p_date_to date,p_terms text[])
returns table(document_id uuid,original_filename text,category text,summary text,tags text[],classification_status text,occurred_at timestamptz,source text,message_text text,subject text,client_id uuid,client_name text,rank_score integer)
language sql stable security invoker set search_path = '' as $$
  select * from (
  select d.id as document_id,d.original_filename,d.category,d.summary,d.tags,d.classification_status,i.occurred_at,i.source,i.message_text,i.subject,c.id as client_id,c.display_name as client_name,
    (case when p_client_id is not null then 100 else 0 end)+(case when p_category is not null then 40 else 0 end)+(case when p_date_from is not null or p_date_to is not null then 20 else 0 end)+
    coalesce((select sum((case when d.original_filename ilike '%'||term||'%' then 8 else 0 end)+(case when d.category ilike term then 8 else 0 end)+(case when c.display_name ilike '%'||term||'%' then 8 else 0 end)+(case when term=any(d.tags) then 6 else 0 end)+(case when coalesce(d.summary,'') ilike '%'||term||'%' then 4 else 0 end)+(case when coalesce(d.extracted_text,'') ilike '%'||term||'%' then 3 else 0 end)+(case when i.message_text ilike '%'||term||'%' or coalesce(i.subject,'') ilike '%'||term||'%' then 2 else 0 end)) from unnest(coalesce(p_terms,'{}'::text[])) term),0)::integer as rank_score
  from public.documents d join public.interactions i on i.id=d.interaction_id left join public.clients c on c.id=i.client_id
  where (p_client_id is null or i.client_id=p_client_id) and (p_category is null or d.category=p_category) and (p_source is null or i.source=p_source)
    and (p_date_from is null or i.occurred_at >= p_date_from::timestamptz) and (p_date_to is null or i.occurred_at < (p_date_to+1)::timestamptz)
    and (cardinality(coalesce(p_terms,'{}'::text[]))=0 or exists(select 1 from unnest(p_terms) term where d.original_filename ilike '%'||term||'%' or d.category ilike term or c.display_name ilike '%'||term||'%' or coalesce(d.summary,'') ilike '%'||term||'%' or coalesce(d.extracted_text,'') ilike '%'||term||'%' or term=any(d.tags) or i.message_text ilike '%'||term||'%' or coalesce(i.subject,'') ilike '%'||term||'%'))
  ) ranked order by ranked.rank_score desc,ranked.occurred_at desc,ranked.document_id limit 100;
$$;

commit;