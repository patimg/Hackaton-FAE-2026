begin;

alter table public.clients drop constraint clients_status_check;
alter table public.clients add constraint clients_status_check check (status in ('provisional','active','archived'));

commit;