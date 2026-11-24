package edu.petra.igso.mods;

import com.sun.management.OperatingSystemMXBean;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;

final class Monitor {
    private final String platform;
    private final OperatingSystemMXBean cpu = ManagementFactory.getPlatformMXBean(OperatingSystemMXBean.class);
    private Delivery delivery;
    private boolean configured;
    private long start;
    private int ticks;

    Monitor(String platform) {
        this.platform = platform;
    }

    void tick(MinecraftServer server) {
        if (!configured) {
            configured = true;
            try {
                delivery = new Delivery(Path.of("config", "igso.properties"));
                if (cpu != null) cpu.getCpuLoad();
                start = System.nanoTime();
            } catch (IOException | IllegalArgumentException badConfig) {
                System.getLogger("IGSO").log(System.Logger.Level.WARNING,
                        "Monitoring disabled. Check config/igso.properties and restart the server.");
            }
            return;
        }
        if (delivery == null) return;
        ticks++;
        long now = System.nanoTime();
        long elapsed = now - start;
        if (elapsed < delivery.interval * 1_000_000_000L) return;
        double tps = Math.min(20, ticks * 1_000_000_000.0 / elapsed);
        ticks = 0;
        start = now;
        double load = cpu == null ? -1 : cpu.getCpuLoad();
        if (load < 0) return;
        Runtime vm = Runtime.getRuntime();
        long used = vm.totalMemory() - vm.freeMemory();
        long max = vm.maxMemory();
        // Capture all world access here on the server thread. The worker handles HTTP.
        String data = String.format(Locale.ROOT,
                "{\"serverId\":\"%s\",\"sampleId\":\"%s\",\"timestamp\":\"%s\",\"intervalSeconds\":%d," +
                "\"minecraftVersion\":\"%s\",\"platform\":\"%s\",\"mspt\":%.4f,\"tps\":%.4f," +
                "\"cpu\":%.4f,\"memory\":%.4f,\"memoryUsedMb\":%d,\"memoryMaxMb\":%d,\"players\":%d,\"entities\":%d}",
                delivery.serverId, UUID.randomUUID(), Instant.now(), delivery.interval, WorldMetrics.VERSION,
                platform, WorldMetrics.mspt(server), tps, load * 100, used * 100.0 / max,
                used / 1048576, max / 1048576, server.getPlayerCount(), WorldMetrics.entities(server));
        delivery.add(data);
    }

    void stop() {
        if (delivery != null) delivery.close();
        delivery = null;
        configured = false;
        ticks = 0;
    }
}
