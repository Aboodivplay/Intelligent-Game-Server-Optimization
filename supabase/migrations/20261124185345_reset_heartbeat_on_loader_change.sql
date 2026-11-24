-- A newly selected loader must report its own heartbeat and optional capabilities.
create function igso_private.reset_loader_status()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.last_seen := null;
  new.sample_interval := null;
  new.player_snapshot := '[]'::jsonb;
  new.tracking_enabled := false;
  new.console_enabled := false;
  return new;
end;
$$;
revoke all on function igso_private.reset_loader_status() from public, anon, authenticated;
create trigger igso_reset_loader_status before update of loader on public.igso_servers
  for each row when (old.loader is distinct from new.loader)
  execute function igso_private.reset_loader_status();
