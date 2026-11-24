package edu.petra.igso.mods;

import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.server.ServerStoppedEvent;
import net.minecraftforge.fml.common.Mod;

@Mod("igso_monitor")
public final class ForgeMonitor {
    private final Monitor monitor = new Monitor("Forge");

    public ForgeMonitor() {
        MinecraftForge.EVENT_BUS.addListener(this::onTick);
        MinecraftForge.EVENT_BUS.addListener(this::onStop);
    }

    private void onTick(TickEvent.ServerTickEvent event) {
        if (event.phase == TickEvent.Phase.END) monitor.tick(event.getServer());
    }

    private void onStop(ServerStoppedEvent event) {
        monitor.stop();
    }
}
