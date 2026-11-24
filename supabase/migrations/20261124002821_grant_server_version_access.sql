-- The dashboard reads the selected release and Settings lets the owner change it.
-- The existing owner and verified-session policies still apply to each row.
grant select (minecraft_version), update (minecraft_version)
  on public.igso_servers to authenticated;
