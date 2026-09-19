package com.appblocker

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Single source of truth for everything that has to survive process death and be trusted by
 * the accessibility service even when no JS/React Native code is running. Backed by
 * EncryptedSharedPreferences (Android Keystore) so the password hashes and salts aren't sitting
 * in a plain XML file under /data/data.
 */
object SecurePrefs {
    private const val PREFS_NAME = "appblocker_secure_prefs"

    private const val KEY_LONG_PW_HASH = "long_pw_hash"
    private const val KEY_LONG_PW_SALT = "long_pw_salt"
    private const val KEY_MASTER_PW_HASH = "master_pw_hash"
    private const val KEY_MASTER_PW_SALT = "master_pw_salt"
    private const val KEY_BLOCKED_PACKAGES = "blocked_packages"
    private const val KEY_TEMP_DISABLED_UNTIL = "temp_disabled_until"
    private const val KEY_INDEFINITELY_DISABLED = "indefinitely_disabled"

    const val TEMP_DISABLE_DURATION_MS = 5 * 60 * 1000L

    @Volatile private var prefs: SharedPreferences? = null

    private fun get(context: Context): SharedPreferences {
        return prefs ?: synchronized(this) {
            prefs ?: run {
                val masterKey = MasterKey.Builder(context.applicationContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context.applicationContext,
                    PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                ).also { prefs = it }
            }
        }
    }

    fun hasPasswordsSet(context: Context): Boolean {
        val p = get(context)
        return p.contains(KEY_LONG_PW_HASH) && p.contains(KEY_MASTER_PW_HASH)
    }

    fun setPasswords(context: Context, longPw: String, masterPw: String) {
        val longSalt = PasswordHasher.randomSaltBase64()
        val masterSalt = PasswordHasher.randomSaltBase64()
        get(context).edit()
            .putString(KEY_LONG_PW_HASH, PasswordHasher.hash(longPw, longSalt))
            .putString(KEY_LONG_PW_SALT, longSalt)
            .putString(KEY_MASTER_PW_HASH, PasswordHasher.hash(masterPw, masterSalt))
            .putString(KEY_MASTER_PW_SALT, masterSalt)
            .apply()
    }

    fun verifyLongPassword(context: Context, pw: String): Boolean {
        val p = get(context)
        val hash = p.getString(KEY_LONG_PW_HASH, null) ?: return false
        val salt = p.getString(KEY_LONG_PW_SALT, null) ?: return false
        return PasswordHasher.verify(pw, salt, hash)
    }

    fun verifyMasterPassword(context: Context, pw: String): Boolean {
        val p = get(context)
        val hash = p.getString(KEY_MASTER_PW_HASH, null) ?: return false
        val salt = p.getString(KEY_MASTER_PW_SALT, null) ?: return false
        return PasswordHasher.verify(pw, salt, hash)
    }

    fun setLongPassword(context: Context, newPw: String) {
        val salt = PasswordHasher.randomSaltBase64()
        get(context).edit()
            .putString(KEY_LONG_PW_HASH, PasswordHasher.hash(newPw, salt))
            .putString(KEY_LONG_PW_SALT, salt)
            .apply()
    }

    fun setMasterPassword(context: Context, newPw: String) {
        val salt = PasswordHasher.randomSaltBase64()
        get(context).edit()
            .putString(KEY_MASTER_PW_HASH, PasswordHasher.hash(newPw, salt))
            .putString(KEY_MASTER_PW_SALT, salt)
            .apply()
    }

    fun getBlockedPackages(context: Context): Set<String> {
        return get(context).getStringSet(KEY_BLOCKED_PACKAGES, emptySet()) ?: emptySet()
    }

    fun setBlockedPackages(context: Context, packages: Set<String>) {
        get(context).edit().putStringSet(KEY_BLOCKED_PACKAGES, packages).apply()
    }

    fun getTempDisabledUntil(context: Context): Long {
        return get(context).getLong(KEY_TEMP_DISABLED_UNTIL, 0L)
    }

    fun setTempDisabledUntil(context: Context, untilMillis: Long) {
        get(context).edit().putLong(KEY_TEMP_DISABLED_UNTIL, untilMillis).apply()
    }

    fun isIndefinitelyDisabled(context: Context): Boolean {
        return get(context).getBoolean(KEY_INDEFINITELY_DISABLED, false)
    }

    fun setIndefinitelyDisabled(context: Context, disabled: Boolean) {
        get(context).edit().putBoolean(KEY_INDEFINITELY_DISABLED, disabled).apply()
    }

    /**
     * Whether blocking should actually run right now. Self-heals an expired temporary disable
     * (the AlarmManager callback is the normal path back to active; this is a fallback for
     * whenever it's checked, in case the alarm was missed/delayed by Doze).
     */
    fun isBlockingActive(context: Context): Boolean {
        if (isIndefinitelyDisabled(context)) return false
        val until = getTempDisabledUntil(context)
        if (until != 0L) {
            if (System.currentTimeMillis() >= until) {
                setTempDisabledUntil(context, 0L)
                return true
            }
            return false
        }
        return true
    }
}
