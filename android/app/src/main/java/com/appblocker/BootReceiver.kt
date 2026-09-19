package com.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the foreground service after a reboot, and re-arms any pending auto-re-enable alarm. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!SecurePrefs.hasPasswordsSet(context)) return

        BlockerForegroundService.start(context)

        val tempUntil = SecurePrefs.getTempDisabledUntil(context)
        if (tempUntil > System.currentTimeMillis()) {
            BlockerForegroundService.scheduleReEnable(context, tempUntil)
        }
    }
}
