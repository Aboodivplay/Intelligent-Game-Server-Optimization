package edu.petra.igso;

/** Pure activity rules, separate from Paper so they can be tested directly. */
final class ActivityState {
    static String describe(long now, long lastMove, long lastFight) {
        if (now - lastFight < 10000) return "Fighting";
        if (now - lastMove >= 300000) return "AFK";
        if (now - lastMove < 10000) return "Moving";
        return "Idle";
    }
}
