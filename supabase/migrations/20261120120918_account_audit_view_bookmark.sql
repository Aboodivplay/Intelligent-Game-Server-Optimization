-- Store one bookmark per account. Clearing the screen never rewrites action records.
create table public.igso_audit_views (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  through_id bigint not null check (through_id > 0)
);
alter table public.igso_audit_views enable row level security;
revoke all on public.igso_audit_views from public, anon, authenticated;
grant select, insert, update on public.igso_audit_views to service_role;

-- The API supplies the verified owner and the newest row seen in the confirmation dialog.
create function public.igso_clear_audit_view(target_owner uuid, last_entry bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.igso_audit_views (owner_id, through_id)
  select owner_id, id from public.igso_audit where owner_id = target_owner and id = last_entry
  on conflict (owner_id) do update
    set through_id = greatest(igso_audit_views.through_id, excluded.through_id);
  return found;
end;
$$;
revoke all on function public.igso_clear_audit_view(uuid, bigint) from public, anon, authenticated;
grant execute on function public.igso_clear_audit_view(uuid, bigint) to service_role;
