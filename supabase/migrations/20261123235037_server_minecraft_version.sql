-- Existing connections keep their current agent until their owner chooses a release.
alter table public.igso_servers
  add column minecraft_version text
  check (minecraft_version in ('1.20.1', '26.3'));
