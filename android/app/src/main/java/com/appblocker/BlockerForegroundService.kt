package com.appblocker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Keeps a persistent low-priority notification up so the OS doesn't kill the process and the
 * user always has a visible "protection is on/paused/off" indicator. The actual blocking logic
 * lives in AppBlockAccessibilityService and reads SecurePrefs directly, so this service staying
 * alive is a reliability aid, not a hard dependency of blocking working.
 */
class BlockerForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "AppBlocker protection status",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Shows whether app blocking is currently active"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AppBlocker")
            .setContentText(statusText(applicationContext))
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "appblocker_status"
        const val NOTIFICATION_ID = 42
        private const val ALARM_REQUEST_CODE = 1001

        /**
         * Confirmed live, on a real device: Android refuses to start a foreground service from
         * a process that was cold-started purely to run MainApplication.onCreate() in the
         * background (e.g. woken up to handle another app's broadcast, or - before this fix -
         * our own BootReceiver's process creation triggering onCreate() before BootReceiver
         * itself got a chance to run), throwing ForegroundServiceStartNotAllowedException. That
         * exception is uncaught-fatal by default, which crashed the entire app on every boot.
         * BootReceiver's own call to this method (made from inside its onReceive(), which *is*
         * a legitimately exempted BOOT_COMPLETED context) is the real mechanism for getting the
         * service running after a reboot; this try/catch just stops any other, non-exempt
         * caller (chiefly MainApplication.onCreate()'s best-effort self-healing call) from
         * taking the whole process down when the OS says no.
         */
        fun start(context: Context) {
            val intent = Intent(context, BlockerForegroundService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.w("BlockerForegroundService", "start() not allowed right now, skipping", e)
            }
        }

        /** Re-posts the notification so its text reflects the latest state. */
        fun refreshNotification(context: Context) = start(context)

        fun statusText(context: Context): String {
            return when {
                SecurePrefs.isIndefinitelyDisabled(context) ->
                    "Disabled indefinitely (master override) — open the app to re-enable"
                SecurePrefs.getTempDisabledUntil(context) > System.currentTimeMillis() ->
                    "Paused — resumes automatically in a few minutes"
                else -> "Protection active"
            }
        }

        fun scheduleReEnable(context: Context, atMillis: Long) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, reEnablePendingIntent(context))
        }

        fun cancelReEnable(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(reEnablePendingIntent(context))
        }

        private fun reEnablePendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, AutoReEnableReceiver::class.java)
            return PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
    }
}
