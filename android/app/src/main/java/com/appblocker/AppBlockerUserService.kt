package com.appblocker

/**
 * Runs in the separate, privileged process Shizuku spawns (adb-shell UID) once the user grants
 * this app permission via the Shizuku app. Shelling out to `am force-stop` here runs it with
 * that same shell identity - exactly what `adb shell am force-stop <pkg>` does - which is the
 * only non-root way to genuinely kill a blocked app's process and clear its Recents entry.
 *
 * Must have a public no-arg constructor - Shizuku instantiates this by reflection.
 */
class AppBlockerUserService : IAppBlockerUserService.Stub() {

    override fun destroy() {
        System.exit(0)
    }

    override fun forceStopPackage(packageName: String) {
        try {
            Runtime.getRuntime().exec(arrayOf("am", "force-stop", packageName)).waitFor()
        } catch (e: Exception) {
            // Best-effort - nothing more to do from here if the shell command itself fails.
        }
    }
}
