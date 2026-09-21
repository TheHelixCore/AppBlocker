package com.appblocker

import android.content.ComponentName
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.IBinder
import android.util.Log
import rikka.shizuku.Shizuku
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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
 *
 * IMPORTANT (found 2026-09-21 after a real on-device freeze): Shizuku.pingBinder() and
 * Shizuku.checkSelfPermission() are synchronous Binder IPC calls into Shizuku's own process.
 * React Native dispatches every @ReactMethod on ReactContextBaseJavaModule (which is all of our
 * native modules) onto one shared "native modules" thread - so if Shizuku's process is stuck
 * (e.g. mid-ANR), a plain blocking call to pingBinder()/checkSelfPermission() can hang that
 * shared thread, which then freezes every OTHER unrelated native call queued behind it,
 * including totally unrelated ones like verifyMasterPassword(). This is exactly what happened:
 * a Shizuku ANR froze the Change Password screen, which never touches Shizuku at all. Every
 * call here that can reach Shizuku's Binder is therefore run on a dedicated background executor
 * with a hard timeout, so the shared RN thread is blocked for at most [CALL_TIMEOUT_MS], never
 * indefinitely - and forceStopPackage() (called from the accessibility service's hot path) is
 * fire-and-forget and never waits at all.
 */
object ShizukuBridge {

    private const val TAG = "ShizukuBridge"
    private const val PERMISSION_REQUEST_CODE = 411
    private const val CALL_TIMEOUT_MS = 800L

    // Cached pool, not a single thread: if one call genuinely hangs forever on a dead Binder,
    // it just leaks that one thread - it must never block later calls from getting a fresh one.
    private val ioExecutor = Executors.newCachedThreadPool()

    private fun <T> withTimeout(default: T, block: () -> T): T {
        return try {
            ioExecutor.submit(Callable { block() }).get(CALL_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (e: Throwable) {
            Log.d(TAG, "withTimeout: Shizuku call timed out or failed, using default", e)
            default
        }
    }

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

    /** Bounded by [CALL_TIMEOUT_MS] - never blocks the caller indefinitely even if Shizuku is hung. */
    fun isShizukuInstalled(): Boolean = withTimeout(false) {
        try {
            Shizuku.pingBinder()
        } catch (e: Throwable) {
            false
        }
    }

    /** Bounded by [CALL_TIMEOUT_MS] - never blocks the caller indefinitely even if Shizuku is hung. */
    fun isPermissionGranted(): Boolean = withTimeout(false) {
        try {
            Shizuku.pingBinder() && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
        } catch (e: Throwable) {
            false
        }
    }

    fun requestPermission() {
        ioExecutor.execute {
            try {
                if (Shizuku.pingBinder() && Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) {
                    Shizuku.requestPermission(PERMISSION_REQUEST_CODE)
                }
            } catch (e: Throwable) {
                Log.d(TAG, "requestPermission: Shizuku not available", e)
            }
        }
    }

    fun ensureBound() {
        if (binding || userService != null) return
        binding = true
        ioExecutor.execute {
            try {
                if (!isPermissionGrantedBlocking()) {
                    binding = false
                    return@execute
                }
                Shizuku.bindUserService(userServiceArgs, connection)
            } catch (e: Throwable) {
                binding = false
                Log.d(TAG, "ensureBound: bindUserService failed", e)
            }
        }
    }

    /** Raw, unbounded check - only ever called from inside an already-backgrounded task. */
    private fun isPermissionGrantedBlocking(): Boolean = try {
        Shizuku.pingBinder() && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    } catch (e: Throwable) {
        false
    }

    /**
     * Best-effort, fire-and-forget: silently does nothing if Shizuku isn't installed, not
     * granted, or not yet bound. Never waits for a result - this is called from the
     * accessibility service's event-handling hot path, and a hang here must never delay or
     * drop other accessibility events.
     */
    fun forceStopPackage(packageName: String) {
        val service = userService
        if (service == null) {
            ensureBound()
            return
        }
        ioExecutor.execute {
            try {
                service.forceStopPackage(packageName)
            } catch (e: Throwable) {
                Log.d(TAG, "forceStopPackage: call failed, will rebind next time", e)
                userService = null
            }
        }
    }
}
