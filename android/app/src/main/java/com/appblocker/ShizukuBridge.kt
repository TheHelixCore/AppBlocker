package com.appblocker

import android.content.ComponentName
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.IBinder
import android.util.Log
import rikka.shizuku.Shizuku

/**
 * Thin wrapper around the Shizuku API for the one thing this app uses it for: running
 * `am force-stop <package>` with adb-shell-level privilege. That's the only non-root way (short
 * of full Device Owner/MDM enrollment, which needs a factory reset) for a normal Android app to
 * actually force-stop another app's process and have its task disappear from the Recents/
 * app-switcher list - killBackgroundProcesses() alone does neither reliably, and a synthetic
 * swipe-to-dismiss gesture on the Recents UI (tried first) proved unreliable on a real device.
 *
 * Entirely optional: if Shizuku isn't installed or hasn't been granted permission, every call
 * here is a safe no-op and blocking still works via the accessibility service alone, just
 * without the extra force-stop.
 */
object ShizukuBridge {

    private const val TAG = "ShizukuBridge"
    private const val PERMISSION_REQUEST_CODE = 411

    @Volatile private var userService: IAppBlockerUserService? = null
    @Volatile private var binding = false
    @Volatile private var initialized = false

    private val userServiceArgs by lazy {
        Shizuku.UserServiceArgs(ComponentName("com.appblocker", AppBlockerUserService::class.java.name))
            .daemon(false)
            .processNameSuffix("shizuku_service")
            .debuggable(false)
            .version(1)
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            userService = if (binder.pingBinder()) IAppBlockerUserService.Stub.asInterface(binder) else null
            binding = false
        }

        override fun onServiceDisconnected(name: ComponentName) {
            userService = null
            binding = false
        }
    }

    /** Call once, early in the process (MainApplication.onCreate is fine). Safe to call more than once. */
    fun initialize() {
        if (initialized) return
        initialized = true
        try {
            Shizuku.addBinderReceivedListenerSticky { ensureBound() }
            Shizuku.addBinderDeadListener { userService = null }
        } catch (e: Throwable) {
            Log.d(TAG, "initialize: Shizuku not available", e)
        }
    }

    fun isShizukuInstalled(): Boolean {
        return try {
            Shizuku.pingBinder()
        } catch (e: Throwable) {
            false
        }
    }

    fun isPermissionGranted(): Boolean {
        return try {
            Shizuku.pingBinder() && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
        } catch (e: Throwable) {
            false
        }
    }

    fun requestPermission() {
        try {
            if (Shizuku.pingBinder() && Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) {
                Shizuku.requestPermission(PERMISSION_REQUEST_CODE)
            }
        } catch (e: Throwable) {
            Log.d(TAG, "requestPermission: Shizuku not available", e)
        }
    }

    fun ensureBound() {
        if (binding || userService != null) return
        if (!isPermissionGranted()) return
        binding = true
        try {
            Shizuku.bindUserService(userServiceArgs, connection)
        } catch (e: Throwable) {
            binding = false
            Log.d(TAG, "ensureBound: bindUserService failed", e)
        }
    }

    /** Best-effort: silently does nothing if Shizuku isn't installed, not granted, or not yet bound. */
    fun forceStopPackage(packageName: String) {
        val service = userService
        if (service == null) {
            ensureBound()
            return
        }
        try {
            service.forceStopPackage(packageName)
        } catch (e: Throwable) {
            Log.d(TAG, "forceStopPackage: call failed, will rebind next time", e)
            userService = null
        }
    }
}
