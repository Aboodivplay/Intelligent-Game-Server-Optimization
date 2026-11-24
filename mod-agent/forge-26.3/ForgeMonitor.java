package edu.petra.igso.mods;

import net.minecraftforge.event.TickEvent.ServerTickEvent;
import net.minecraftforge.event.server.ServerStoppedEvent;
import net.minecraftforge.fml.common.Mod;

@Mod("igso_monitor")
public final class ForgeMonitor {
    public ForgeMonitor() {
        Monitor monitor = new Monitor("Forge");
        ServerTickEvent.Post.BUS.addListener(event -> monitor.tick(event.server()));
        ServerStoppedEvent.BUS.addListener(event -> monitor.stop());
    }
}
