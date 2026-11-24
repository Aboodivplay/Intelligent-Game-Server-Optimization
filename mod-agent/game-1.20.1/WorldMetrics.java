package edu.petra.igso.mods;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

final class WorldMetrics {
    static final String VERSION = "1.20.1";

    static double mspt(MinecraftServer server) {
        return server.getAverageTickTime();
    }

    static int entities(MinecraftServer server) {
        int count = 0;
        for (ServerLevel level : server.getAllLevels()) {
            for (Object ignored : level.getAllEntities()) count++;
        }
        return count;
    }
}
