package com.appblocker

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Settings
import android.text.TextUtils
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.ByteArrayOutputStream

/** The JS <-> native bridge. All the real state lives in SecurePrefs; this just validates input
 * and translates between React Native types and the native APIs. */
class AppBlockerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AppBlockerModule"

    private val appContext: Context
        get() = reactApplicationContext.applicationContext

    /**
     * Some system screens (Samsung's device-admin activation screen among them - confirmed via
     * "SecDeviceAdminAdd: Cannot start ADD_DEVICE_ADMIN as a new task" in logcat on a real
     * device) refuse to launch with FLAG_ACTIVITY_NEW_TASK, which is otherwise mandatory when
     * starting an Activity from a non-Activity Context. Route through the current Activity when
     * one is available so we never need that flag; only fall back to the app context (which
     * does need it) if there genuinely isn't a foreground Activity to launch from.
     */
    private fun startActivityPreferringCurrentActivity(intent: Intent) {
        val activity = reactApplicationContext.currentActivity
        if (activity != null) {
            activity.startActivity(intent)
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            appContext.startActivity(intent)
        }
    }

    // ---- Passwords ----

    @ReactMethod
    fun hasPasswordsSet(promise: Promise) {
        promise.resolve(SecurePrefs.hasPasswordsSet(appContext))
    }

    @ReactMethod
    fun setupPasswords(longPw: String, masterPw: String, promise: Promise) {
        if (SecurePrefs.hasPasswordsSet(appContext)) {
            promise.reject("ALREADY_SET", "Passwords are already configured")
            return
        }
        if (longPw.length < 8 || masterPw.length < 8) {
            promise.reject("TOO_SHORT", "Passwords must be at least 8 characters")
            return
        }
        if (longPw == masterPw) {
            promise.reject("SAME_PASSWORD", "The two passwords must be different")
            return
        }
        SecurePrefs.setPasswords(appContext, longPw, masterPw)
        BlockerForegroundService.start(appContext)
        promise.resolve(true)
    }

    @ReactMethod
    fun verifyLongPassword(pw: String, promise: Promise) {
        promise.resolve(SecurePrefs.verifyLongPassword(appContext, pw))
    }

    @ReactMethod
    fun verifyMasterPassword(pw: String, promise: Promise) {
        promise.resolve(SecurePrefs.verifyMasterPassword(appContext, pw))
    }

    @ReactMethod
    fun changeLongPassword(masterPw: String, newLongPw: String, promise: Promise) {
        if (!SecurePrefs.verifyMasterPassword(appContext, masterPw)) {
            promise.reject("BAD_MASTER", "Master password incorrect")
            return
        }
        if (newLongPw.length < 8) {
            promise.reject("TOO_SHORT", "Password must be at least 8 characters")
            return
        }
        SecurePrefs.setLongPassword(appContext, newLongPw)
        promise.resolve(true)
    }

    @ReactMethod
    fun changeMasterPassword(currentMasterPw: String, newMasterPw: String, promise: Promise) {
        if (!SecurePrefs.verifyMasterPassword(appContext, currentMasterPw)) {
            promise.reject("BAD_MASTER", "Master password incorrect")
            return
        }
        if (newMasterPw.length < 8) {
            promise.reject("TOO_SHORT", "Password must be at least 8 characters")
            return
        }
        SecurePrefs.setMasterPassword(appContext, newMasterPw)
        promise.resolve(true)
    }

    // ---- Blocked app list ----

    @ReactMethod
    fun getInstalledApps(promise: Promise) {
        try {
            val pm = appContext.packageManager
            val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            val resolveInfos = pm.queryIntentActivities(mainIntent, 0)
            val result: WritableArray = Arguments.createArray()
            val seen = HashSet<String>()

            for (info in resolveInfos) {
                val packageName = info.activityInfo.packageName
                if (packageName == appContext.packageName) continue
                if (!seen.add(packageName)) continue

                val appInfo: ApplicationInfo = info.activityInfo.applicationInfo
                val label = pm.getApplicationLabel(appInfo).toString()
                val iconBase64 = try {
                    drawableToBase64(pm.getApplicationIcon(appInfo))
                } catch (e: Exception) {
                    null
                }

                val map: WritableMap = Arguments.createMap()
                map.putString("packageName", packageName)
                map.putString("appName", label)
                if (iconBase64 != null) {
                    map.putString("icon", iconBase64)
                }
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIST_FAILED", e)
        }
    }

    private fun drawableToBase64(drawable: Drawable): String {
        val bitmap = if (drawable is BitmapDrawable && drawable.bitmap != null) {
            drawable.bitmap
        } else {
            val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
            val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
            val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            drawable.setBounds(0, 0, canvas.width, canvas.height)
            drawable.draw(canvas)
            bmp
        }
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    @ReactMethod
    fun getBlockedApps(promise: Promise) {
        val result: WritableArray = Arguments.createArray()
        SecurePrefs.getBlockedPackages(appContext).forEach { result.pushString(it) }
        promise.resolve(result)
    }

    @ReactMethod
    fun setBlockedApps(packages: ReadableArray, promise: Promise) {
        val set = HashSet<String>()
        for (i in 0 until packages.size()) {
            packages.getString(i)?.let { set.add(it) }
        }
        SecurePrefs.setBlockedPackages(appContext, set)
        promise.resolve(true)
    }

    // ---- Blocking state ----

    @ReactMethod
    fun getBlockingState(promise: Promise) {
        val map: WritableMap = Arguments.createMap()
        map.putBoolean("active", SecurePrefs.isBlockingActive(appContext))
        map.putBoolean("indefinitelyDisabled", SecurePrefs.isIndefinitelyDisabled(appContext))
        val until = SecurePrefs.getTempDisabledUntil(appContext)
        map.putDouble(
            "tempDisabledUntil",
            if (until > System.currentTimeMillis()) until.toDouble() else 0.0
        )
        promise.resolve(map)
    }

    @ReactMethod
    fun disableBlockingTemporarily(longPw: String, promise: Promise) {
        if (!SecurePrefs.verifyLongPassword(appContext, longPw)) {
            promise.reject("BAD_PASSWORD", "Password incorrect")
            return
        }
        val until = System.currentTimeMillis() + SecurePrefs.TEMP_DISABLE_DURATION_MS
        SecurePrefs.setIndefinitelyDisabled(appContext, false)
        SecurePrefs.setTempDisabledUntil(appContext, until)
        BlockerForegroundService.scheduleReEnable(appContext, until)
        BlockerForegroundService.refreshNotification(appContext)
        promise.resolve(until.toDouble())
    }

    @ReactMethod
    fun disableBlockingWithMasterPassword(masterPw: String, promise: Promise) {
        if (!SecurePrefs.verifyMasterPassword(appContext, masterPw)) {
            promise.reject("BAD_PASSWORD", "Master password incorrect")
            return
        }
        BlockerForegroundService.cancelReEnable(appContext)
        SecurePrefs.setTempDisabledUntil(appContext, 0L)
        SecurePrefs.setIndefinitelyDisabled(appContext, true)
        BlockerForegroundService.refreshNotification(appContext)
        promise.resolve(true)
    }

    @ReactMethod
    fun enableBlocking(promise: Promise) {
        BlockerForegroundService.cancelReEnable(appContext)
        SecurePrefs.setIndefinitelyDisabled(appContext, false)
        SecurePrefs.setTempDisabledUntil(appContext, 0L)
        BlockerForegroundService.refreshNotification(appContext)
        promise.resolve(true)
    }

    // ---- Accessibility service ----

    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        val expectedComponent = ComponentName(appContext, AppBlockAccessibilityService::class.java)
        val enabledServicesSetting = Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        val splitter = TextUtils.SimpleStringSplitter(':')
        splitter.setString(enabledServicesSetting)
        var found = false
        while (splitter.hasNext()) {
            val enabledComponent = ComponentName.unflattenFromString(splitter.next())
            if (enabledComponent != null && enabledComponent == expectedComponent) {
                found = true
                break
            }
        }
        promise.resolve(found)
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        startActivityPreferringCurrentActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    // ---- Device admin ----

    @ReactMethod
    fun isDeviceAdminActive(promise: Promise) {
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(appContext, AppAdminReceiver::class.java)
        promise.resolve(dpm.isAdminActive(adminComponent))
    }

    @ReactMethod
    fun requestDeviceAdmin() {
        val adminComponent = ComponentName(appContext, AppAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "AppBlocker uses device admin so uninstalling it takes deliberate effort."
            )
        }
        startActivityPreferringCurrentActivity(intent)
    }

    // ---- Shizuku (optional: lets a blocked app actually be force-stopped, not just redirected) ----

    @ReactMethod
    fun isShizukuInstalled(promise: Promise) {
        promise.resolve(ShizukuBridge.isShizukuInstalled())
    }

    @ReactMethod
    fun isShizukuPermissionGranted(promise: Promise) {
        promise.resolve(ShizukuBridge.isPermissionGranted())
    }

    @ReactMethod
    fun requestShizukuPermission() {
        ShizukuBridge.requestPermission()
    }

    // ---- Misc ----

    @ReactMethod
    fun startProtectionService() {
        BlockerForegroundService.start(appContext)
    }

    @ReactMethod
    fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:" + appContext.packageName)
        }
        startActivityPreferringCurrentActivity(intent)
    }
}
