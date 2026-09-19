package com.appblocker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fired by AlarmManager 5 minutes after a long-password disable. Turns protection back on. */
class AutoReEnableReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        SecurePrefs.setTempDisabledUntil(context, 0L)
        BlockerForegroundService.refreshNotification(context)
    }
}
