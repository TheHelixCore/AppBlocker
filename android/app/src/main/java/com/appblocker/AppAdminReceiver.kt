package com.appblocker

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * Makes AppBlocker a Device Administrator. This doesn't let the app veto an uninstall outright
 * (that needs full Device Owner/MDM enrollment, not achievable for a normal sideloaded app) but
 * it forces the user through Settings > Security > Device admin apps to deactivate admin *before*
 * Android will let them uninstall at all - a real speed bump, not a cryptographic guarantee. The
 * accessibility service's uninstall-guard (see AppBlockAccessibilityService) is what actually
 * tries to intercept that Settings screen behind the same passwords.
 */
class AppAdminReceiver : DeviceAdminReceiver() {
    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        return "Removing admin rights will make it possible to uninstall AppBlocker."
    }
}
