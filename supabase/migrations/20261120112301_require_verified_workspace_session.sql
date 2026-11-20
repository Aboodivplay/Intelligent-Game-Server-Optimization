create schema if not exists igso_private;
revoke all on schema igso_private from public, anon;
grant usage on schema igso_private to authenticated;

-- Use the signed-in user's identity only. The browser cannot choose whose factors to check.
create function igso_private.workspace_session_ready()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1 from auth.sessions s
      where s.id = (auth.jwt()->>'session_id')::uuid and s.user_id = auth.uid()
    )
    and (
      coalesce(auth.jwt()->>'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
    );
$$;
revoke all on function igso_private.workspace_session_ready() from public, anon;
grant execute on function igso_private.workspace_session_ready() to authenticated;

-- The Edge Function checks the same rule before making changes on behalf of a user.
create function public.igso_workspace_session_ready()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select igso_private.workspace_session_ready(); $$;
revoke all on function public.igso_workspace_session_ready() from public, anon;
grant execute on function public.igso_workspace_session_ready() to authenticated;

-- Restrictive policies add this check to the existing owner policies for each table.
create policy "Require verified workspace session" on public.igso_servers
  as restrictive for all to authenticated
  using ((select igso_private.workspace_session_ready()))
  with check ((select igso_private.workspace_session_ready()));

create policy "Require verified workspace session" on public.igso_telemetry
  as restrictive for all to authenticated
  using ((select igso_private.workspace_session_ready()))
  with check ((select igso_private.workspace_session_ready()));

create policy "Require verified workspace session" on public.igso_audit
  as restrictive for all to authenticated
  using ((select igso_private.workspace_session_ready()))
  with check ((select igso_private.workspace_session_ready()));

create policy "Require verified workspace session" on public.igso_incidents
  as restrictive for all to authenticated
  using ((select igso_private.workspace_session_ready()))
  with check ((select igso_private.workspace_session_ready()));

create policy "Require verified workspace session" on public.igso_commands
  as restrictive for all to authenticated
  using ((select igso_private.workspace_session_ready()))
  with check ((select igso_private.workspace_session_ready()));
