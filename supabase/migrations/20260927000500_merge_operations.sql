begin;

create table public.client_merge_operations (
  id uuid primary key default gen_random_uuid(),
  survivor_client_id uuid not null,
  merged_client_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','drive_completed','completed','failed')),
  error_code text,
  error_summary text,
  started_at timestamptz not null default now(),
  drive_completed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (survivor_client_id <> merged_client_id),
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'drive_completed' or drive_completed_at is not null)
);
create index client_merge_operations_status_idx on public.client_merge_operations(status,created_at);
alter table public.client_merge_operations enable row level security;
revoke all on public.client_merge_operations from anon,authenticated,public;
grant all on public.client_merge_operations to service_role;
create trigger set_updated_at before update on public.client_merge_operations for each row execute function public.set_updated_at();

commit;