package com.appblocker

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast

/**
 * The actual enforcement point. Fires on every foreground-window change system-wide; if the
 * window belongs to a blocked package (and blocking is currently active), it immediately sends
 * the user home before the app finishes drawing. This is the same primitive every non-root
 * Android "app blocker"/parental-control app uses — there is no API to pre-empt another app's
 * process from starting at all, only to react the instant its window appears.
 *
 * Also does best-effort "uninstall guard": if Settings/the package installer surfaces a screen
 * that looks like it's trying to remove this app (its Device Admin deactivation confirmation,
 * the Device Admin apps list, an uninstall dialog), it backs out to the home screen the same
 * way. This only runs once Device Admin is actually active, and only for screens that mention
 * both this app AND an actual removal-flavored word - not just any Settings screen that happens
 * to mention "AppBlocker". The first version of this matched on the app's name alone, which
 * meant it fired on the Device Admin *activation* screen too (the one this app itself opens to
 * ask you to turn admin on) and bounced you home before you could tap "Activate" - caught by
 * testing on a real device, not something a build or a unit test would ever catch.
 */
class AppBlockAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = AccessibilityServiceInfo().apply {
            // TYPE_WINDOW_STATE_CHANGED alone misses a real case, confirmed live on a Samsung/
            // OneUI device: resuming an already-running blocked app from the Recents/app-switcher
            // doesn't always fire it, letting the app back in without a fresh block check.
            // TYPE_WINDOWS_CHANGED fires for that case too, so both are needed.
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        ShizukuBridge.ensureBound()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        // TYPE_WINDOWS_CHANGED doesn't reliably carry a packageName on the event itself (it's
        // reporting a change to the set of windows, not one window's state) - resolve the
        // foreground package from the currently active window instead in that case.
        val packageName = event.packageName?.toString() ?: activeWindowPackageName() ?: return
        if (packageName == applicationContext.packageName) return
        if (!SecurePrefs.isBlockingActive(applicationContext)) return

        val blocked = SecurePrefs.getBlockedPackages(applicationContext)
        if (blocked.contains(packageName)) {
            handleBlockedAppLaunch(packageName)
            return
        }

        if (isSystemUninstallSurface(packageName) && isDeviceAdminActive() && looksLikeRemovalAttempt()) {
            performGlobalAction(GLOBAL_ACTION_HOME)
        }
    }

    private fun activeWindowPackageName(): String? {
        return windows.firstOrNull { it.isActive }?.root?.packageName?.toString()
    }

    private fun handleBlockedAppLaunch(packageName: String) {
        performGlobalAction(GLOBAL_ACTION_HOME)
        val label = try {
            val pm = applicationContext.packageManager
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
        } catch (e: Exception) {
            packageName
        }
        Toast.makeText(applicationContext, "$label is blocked", Toast.LENGTH_SHORT).show()

        // Best-effort fallback for when Shizuku isn't set up: GLOBAL_ACTION_HOME alone leaves
        // the process running, so at least try to reap it as a background process.
        val am = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        am.killBackgroundProcesses(packageName)

        // The real fix, when available: force-stop via Shizuku (adb-shell privilege). Unlike
        // killBackgroundProcesses, a genuine force-stop also clears the app's Recents/
        // app-switcher entry, same as tapping "Force stop" in Settings would. A first attempt
        // at clearing that entry by driving the Recents UI itself (open it, find the card,
        // dispatch a swipe-to-dismiss gesture) dispatched without error but didn't actually
        // remove the card on a real device - launcher-specific and not reliable enough to keep.
        ShizukuBridge.forceStopPackage(packageName)
    }

    private fun isSystemUninstallSurface(packageName: String): Boolean {
        return packageName == "com.android.settings" ||
            packageName == "com.google.android.packageinstaller" ||
            packageName == "com.android.packageinstaller"
    }

    private fun isDeviceAdminActive(): Boolean {
        val dpm = applicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(applicationContext, AppAdminReceiver::class.java)
        return dpm.isAdminActive(adminComponent)
    }

    /** True only when the visible screen mentions this app AND uses removal-flavored wording. */
    private fun looksLikeRemovalAttempt(): Boolean {
        val ownLabel = try {
            applicationContext.applicationInfo.loadLabel(applicationContext.packageManager).toString()
        } catch (e: Exception) {
            "AppBlocker"
        }
        val ownPackage = applicationContext.packageName

        val root = rootInActiveWindow ?: return false
        val collected = StringBuilder()
        try {
            collectText(root, collected, depth = 0)
        } finally {
            root.recycle()
        }

        val text = collected.toString().lowercase()
        val mentionsSelf = text.contains(ownLabel.lowercase()) || text.contains(ownPackage)
        val mentionsRemoval = REMOVAL_KEYWORDS.any { text.contains(it) }
        return mentionsSelf && mentionsRemoval
    }

    private fun collectText(node: AccessibilityNodeInfo, out: StringBuilder, depth: Int) {
        if (depth > 8) return
        node.text?.let { out.append(it).append(' ') }
        node.contentDescription?.let { out.append(it).append(' ') }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectText(child, out, depth + 1)
            child.recycle()
        }
    }

    override fun onInterrupt() {}

    companion object {
        private val REMOVAL_KEYWORDS = listOf("uninstall", "deactivate", "device admin apps")
    }
}
