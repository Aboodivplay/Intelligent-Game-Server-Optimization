package edu.petra.igso;

import com.sun.management.OperatingSystemMXBean;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.Listener;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.command.ConsoleCommandSender;
import com.google.gson.*;
import java.util.*;
import java.lang.reflect.Proxy;
import java.util.concurrent.ConcurrentLinkedQueue;
import org.bukkit.plugin.java.JavaPlugin;
import java.lang.management.ManagementFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Reads game state on the Minecraft thread and sends HTTPS requests off-thread. */
public final class IGSOAgent extends JavaPlugin implements Listener {
    private final AtomicBoolean sending = new AtomicBoolean(false);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private URI endpoint;
    private String serverId;
    private String agentKey;
    private long lastWarning;
    private final Map<UUID, Long> lastMove = new HashMap<>();
    private final Map<UUID, Long> lastFight = new HashMap<>();
    private final Queue<JsonObject> results = new ConcurrentLinkedQueue<>();
    private final Set<String> executed = new HashSet<>();
    private final Gson gson = new Gson();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        try {
            endpoint = URI.create(getConfig().getString("endpoint", ""));
            serverId = getConfig().getString("server-id", "");
            agentKey = getConfig().getString("agent-key", "");
            if (!"https".equals(endpoint.getScheme()) || endpoint.getHost() == null ||
                !serverId.matches("[a-f0-9-]{36}") || !agentKey.matches("[a-f0-9]{64}")) {
                throw new IllegalArgumentException("Missing valid HTTPS endpoint, server ID or agent key.");
            }
        } catch (IllegalArgumentException error) {
            getLogger().warning("Configure IGSOAgent/config.yml with your downloaded connection settings, then restart Paper.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }
        Bukkit.getPluginManager().registerEvents(this, this);
        int seconds = Math.max(5, Math.min(60, getConfig().getInt("interval-seconds", 5)));
        Bukkit.getScheduler().runTaskTimer(this, this::collect, 100L, seconds * 20L);
        getLogger().info("IGSO connected. Player tracking and manual console follow local config.yml permissions.");
    }

    private void collect() {
        if (!sending.compareAndSet(false, true)) return;
        try {
            // Bukkit game-state access stays on the main thread.
            int entities = 0;
            for (World world : Bukkit.getWorlds()) entities += world.getEntityCount();
            int players = Bukkit.getOnlinePlayers().size();
            double tps = Math.max(0, Math.min(20, Bukkit.getTPS()[0]));
            Runtime runtime = Runtime.getRuntime();
            long used = (runtime.totalMemory() - runtime.freeMemory()) / 1048576;
            long maximum = runtime.maxMemory() / 1048576;
            double memory = maximum == 0 ? 0 : 100.0 * used / maximum;
            OperatingSystemMXBean system = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
            double cpuLoad = system.getCpuLoad();
            // An unavailable OS reading is not a genuine zero; skip this sample.
            if (!Double.isFinite(cpuLoad) || cpuLoad < 0 || !Double.isFinite(tps)) {
                sending.set(false);
                warnOccasionally("CPU or tick-rate reading unavailable; telemetry sample skipped.");
                return;
            }
            double cpu = Math.min(100, cpuLoad * 100);
            JsonObject sample = new JsonObject();
            sample.addProperty("serverId", serverId);
            sample.addProperty("cpu", cpu); sample.addProperty("memory", memory);
            sample.addProperty("tps", tps); sample.addProperty("entities", entities);
            sample.addProperty("players", players); sample.addProperty("memoryUsedMb", used);
            sample.addProperty("memoryMaxMb", maximum); sample.addProperty("platform", "Paper");
            // Report the running game's version independently of the dashboard setting.
            sample.addProperty("minecraftVersion", Bukkit.getMinecraftVersion());
            boolean tracking = getConfig().getBoolean("player-tracking", true);
            sample.addProperty("trackingEnabled", tracking);
            sample.addProperty("consoleEnabled", getConfig().getBoolean("remote-console.enabled", false));
            JsonArray positions = new JsonArray();
            long now = System.currentTimeMillis();
            if (tracking) for (Player player : Bukkit.getOnlinePlayers()) {
                if (positions.size() >= 200) break;
                Location location = player.getLocation();
                lastMove.putIfAbsent(player.getUniqueId(), now);
                long moved = lastMove.get(player.getUniqueId());
                String activity = ActivityState.describe(now, moved, lastFight.getOrDefault(player.getUniqueId(), 0L));
                JsonObject row = new JsonObject();
                row.addProperty("uuid", player.getUniqueId().toString());
                row.addProperty("name", player.getName()); row.addProperty("world", player.getWorld().getName());
                row.addProperty("x", location.getBlockX()); row.addProperty("y", location.getBlockY()); row.addProperty("z", location.getBlockZ());
                row.addProperty("activity", activity); positions.add(row);
            }
            sample.add("playerStates", positions);
            List<JsonObject> acknowledgements = new ArrayList<>(results);
            JsonArray ack = new JsonArray(); acknowledgements.forEach(ack::add);
            sample.add("commandResults", ack);
            String payload = gson.toJson(sample);
            Bukkit.getScheduler().runTaskAsynchronously(this, () -> send(payload, acknowledgements));
        } catch (Exception error) {
            sending.set(false);
            warnOccasionally("Could not collect telemetry. Check Paper compatibility.");
        }
    }

    private void send(String payload, List<JsonObject> acknowledgements) {
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + agentKey)
                .POST(HttpRequest.BodyPublishers.ofString(payload)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 201) {
                acknowledgements.forEach(results::remove);
                JsonObject reply = JsonParser.parseString(response.body()).getAsJsonObject();
                JsonArray commands = reply.has("commands") ? reply.getAsJsonArray("commands") : new JsonArray();
                Bukkit.getScheduler().runTask(this, () -> commands.forEach(item -> execute(item.getAsJsonObject())));
            }
            if (response.statusCode() != 201) warnOccasionally("Telemetry rejected with HTTP " + response.statusCode() + ". Check connection settings.");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } catch (Exception error) {
            warnOccasionally("Telemetry backend is unreachable. Retrying at the next sampling interval.");
        } finally {
            sending.set(false);
        }
    }


    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Location a = event.getFrom(), b = event.getTo();
        if (b != null && (!a.getWorld().equals(b.getWorld()) || a.distanceSquared(b) > 0.0001))
            lastMove.put(event.getPlayer().getUniqueId(), System.currentTimeMillis());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onFight(EntityDamageByEntityEvent event) {
        if (event.getFinalDamage() <= 0) return;
        long now = System.currentTimeMillis();
        if (event.getEntity() instanceof Player player) lastFight.put(player.getUniqueId(), now);
        Object attacker = event.getDamager();
        if (attacker instanceof Projectile projectile) attacker = projectile.getShooter();
        if (attacker instanceof Player player) lastFight.put(player.getUniqueId(), now);
    }

    @EventHandler public void onQuit(PlayerQuitEvent event) {
        lastMove.remove(event.getPlayer().getUniqueId()); lastFight.remove(event.getPlayer().getUniqueId());
    }

    // Runs exclusively on the Minecraft thread. Never retry a dispatched command.
    private void execute(JsonObject request) {
        String id = request.get("id").getAsString(), command = request.get("command").getAsString();
        if (!executed.add(id)) return;
        // This set is just a second delivery guard; the backend also claims once.
        if (executed.size() > 10000) { executed.clear(); executed.add(id); }
        String root = command.split(" ",2)[0].toLowerCase(Locale.ROOT);
        List<String> allowed = getConfig().getStringList("remote-console.allowed-commands");
        String status = "rejected", output = "Command is not allowed by this agent's local configuration.";
        if (getConfig().getBoolean("remote-console.enabled", false) && allowed.contains(root)
                && command.length() <= 256 && !command.matches("(?s).*[\\r\\n\\x00-\\x1f].*")) {
            StringBuilder captured = new StringBuilder();
            ConsoleCommandSender console = Bukkit.getConsoleSender();
            ConsoleCommandSender sender = (ConsoleCommandSender) Proxy.newProxyInstance(
                ConsoleCommandSender.class.getClassLoader(), new Class<?>[]{ConsoleCommandSender.class}, (proxy, method, args) -> {
                    if (method.getName().equals("sendMessage") && args != null) {
                        for (Object value : args) {
                            if (value instanceof String text) captured.append(text).append('\n');
                            else if (value instanceof String[] texts) for (String text : texts) captured.append(text).append('\n');
                            else if (!(value instanceof UUID)) captured.append(String.valueOf(value)).append('\n');
                        }
                        if (captured.length() > 4000) captured.setLength(4000);
                        return null;
                    }
                    return method.invoke(console, args);
                });
            try {
                boolean accepted = Bukkit.dispatchCommand(sender, command);
                status = accepted ? "completed" : "rejected";
                output = captured.length() > 0 ? captured.toString() : accepted
                    ? "Dispatched on the server. This command returned no text; inspect the server log for additional output."
                    : "The server did not recognize this command.";
            } catch (Exception error) { output = "Command failed. Inspect the Minecraft server log."; }
        }
        JsonObject result = new JsonObject(); result.addProperty("id", id);
        result.addProperty("status", status); result.addProperty("output", output.substring(0, Math.min(4000,output.length())));
        results.add(result);
        while (results.size() > 30) results.poll();
    }

    private synchronized void warnOccasionally(String message) {
        long now = System.currentTimeMillis();
        if (now - lastWarning > 60000) { lastWarning = now; getLogger().warning(message); }
    }
}
