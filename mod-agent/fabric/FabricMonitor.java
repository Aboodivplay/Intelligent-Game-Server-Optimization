package edu.petra.igso.mods;

import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;

public final class FabricMonitor implements DedicatedServerModInitializer {
    @Override public void onInitializeServer() {
        Monitor monitor = new Monitor("Fabric");
        ServerTickEvents.END_SERVER_TICK.register(monitor::tick);
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> monitor.stop());
    }
}
