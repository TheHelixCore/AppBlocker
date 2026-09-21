# AppBlocker

A personal Android app-blocker: pick apps to block, and it kicks you back to the home screen
the instant one of them tries to open. Two passwords gate it:

- **Unlock Password** — pauses blocking for exactly 5 minutes (it re-enables itself
  automatically), is also asked for before AppBlocker's own Settings/uninstall screens will let
  you through, and gates the app's own UI: opening AppBlocker (or switching back to it after
  backgrounding it) always shows a lock screen demanding this password before showing any
  settings at all. Without this, anyone with the phone unlocked could freely edit the
  blocked-apps list with no friction whatsoever - a real gap found by using the app, not
  something caught by building it.
- **Master Password** — disables blocking indefinitely, until you open the app and switch it
  back on yourself (no password needed for that direction, only to turn it off), and is also
  required to remove any app from the blocked list. Adding an app needs nothing extra - only
  restricting further is free; un-blocking something already blocked is exactly as
  security-sensitive as the master override, so it's gated the same way.

## How it actually works (read this before relying on it)

Android gives no app the ability to prevent another app's process from starting, or to kill an
arbitrary foreground app, without root. What every non-root "app blocker"/parental-control app
(this one included) actually does is react the instant the blocked app's window appears:

- **`AppBlockAccessibilityService`** (`android/app/src/main/java/com/appblocker/`) is an
  `AccessibilityService` that gets a callback on every foreground window change, system-wide.
  If the new foreground package is on your blocked list (and blocking is currently active), it
  immediately calls `performGlobalAction(GLOBAL_ACTION_HOME)` — so the blocked app is visible
  for a frame at most, not truly prevented from ever starting. It listens for both
  `TYPE_WINDOW_STATE_CHANGED` and `TYPE_WINDOWS_CHANGED` — the first alone misses a real case,
  confirmed on a Samsung/OneUI device: resuming an already-running blocked app from the
  Recents/app-switcher doesn't always fire it, which would let the app back in unblocked.
- **Optional: force-stopping the blocked app via [Shizuku](https://shizuku.rikka.app/).**
  `GLOBAL_ACTION_HOME` only backgrounds the app — its process survives, and killing it via the
  public `ActivityManager.killBackgroundProcesses()` API is unreliable (confirmed: it silently
  no-ops on a still-recently-used process in practice). The only way to genuinely force-stop
  another app without root is to run with adb-shell privilege, which
  [Shizuku](https://github.com/RikkaApps/Shizuku) provides to a normal app once the user installs
  it and starts its privileged server. `ShizukuBridge.kt` binds a tiny `AppBlockerUserService`
  (see the AIDL interface `IAppBlockerUserService`) that shells out to `am force-stop <pkg>` with
  that privilege. This is entirely optional — if Shizuku isn't installed or hasn't been granted,
  blocking still works via the accessibility service alone, just without the force-stop.
  **Known limitation, confirmed by testing, not fixable from here**: even a genuine, verified
  force-stop (confirmed via the process actually dying, and independently via WorkManager's own
  "Application was force-stopped, rescheduling" log) does **not** clear the app's card from the
  Recents/app-switcher list on this Android version — Recents entries are decoupled from process
  liveness at the OS level, and there is no supported (or even `adb shell`-accessible) API to
  remove one; `ActivityManager.removeTask()` is signature-permission-gated and `am help` has no
  public subcommand for it (only whole-*stack* removal, which is the wrong tool). The card sitting
  there is inert, though: tapping it forces a genuine cold start of a dead task, which the
  accessibility service catches immediately, confirmed live — no crash, just an instant re-block.
  A first attempt at clearing the card a different way — driving the Recents UI itself via
  accessibility APIs to find the card and dispatch a swipe-to-dismiss gesture — was tried and
  removed: the gesture dispatched without error but didn't actually remove the card, and caused a
  visible flash of the Recents screen on every block for no benefit.
  **Setup, and a real ongoing cost**: install Shizuku, then start its privileged server (Settings
  in the Shizuku app shows the exact one-line `adb shell <path-to-libshizuku.so>` command, or use
  Android 11+'s on-device Wireless Debugging pairing screen), then grant it from AppBlocker's Home
  screen ("Force-stop via Shizuku" under Optional). On a non-rooted device this server **does not
  survive a reboot** — it must be manually restarted (reopen Shizuku, or rerun the adb command)
  after every restart, or AppBlocker silently falls back to accessibility-only blocking (still
  fully effective at preventing use, just without the force-stop/no lingering-card attempt).
- Android will **not** let you enable this from code — the user has to flip it on once in
  Settings > Accessibility (the Home screen has an "Enable" shortcut that deep-links there).
  There is no way around this; it's an intentional Android security boundary.
- **Uninstall protection is friction, not a hard block.** `AppAdminReceiver` makes the app a
  Device Administrator, which forces the OS to require deactivating admin (Settings > Security
  > Device admin apps) before an uninstall is even offered. The same accessibility service also
  tries to detect when Settings/the package installer is showing a screen that mentions
  AppBlocker and bounces back to the home screen — this is a best-effort heuristic (it matches
  on visible text), not a guarantee. A determined user with ADB, Safe Mode, or a factory reset
  can always remove it; nothing on unrooted Android can fully prevent that.
- The 5-minute auto re-enable is scheduled with `AlarmManager` (survives the app being closed)
  and re-armed on boot by `BootReceiver`, so it doesn't depend on the app process staying alive.
- Both passwords are salted+hashed (PBKDF2-HMAC-SHA256) and stored in
  `EncryptedSharedPreferences` (Android Keystore-backed) — see `SecurePrefs.kt`. Nothing reads
  or stores a raw password anywhere.

## First run checklist

1. Open `android/` in Android Studio (or `npx react-native run-android` with a device/emulator
   connected) and install the app.
2. On first launch you'll set both passwords (min 8 characters, must be different from each
   other — there is no recovery flow if you forget them, by design).
3. From the Home screen, tap **Enable** next to "Accessibility service" and turn AppBlocker on
   in the system screen that opens. Blocking does nothing until this is on.
4. Tap **Activate** next to "Device admin" to add the uninstall friction.
5. Tap **Blocked apps** and pick which apps to block.
6. Optional: install [Shizuku](https://shizuku.rikka.app/), start its privileged server (see the
   Shizuku section above — it needs restarting after every reboot on a non-rooted device), then
   tap **Enable** next to "Force-stop via Shizuku" under Optional. Skip this and blocking still
   works fine, just without the force-stop.

## Project layout

- `App.tsx`, `src/` — the React Native UI (setup, home dashboard, app picker, change-password
  screen). No third-party UI/navigation libraries — screens are switched with plain `useState`
  to keep the native build surface as small as possible.
- `android/app/src/main/java/com/appblocker/` — all the native logic: the accessibility
  service, the foreground service + notification, the boot receiver, the device-admin receiver,
  the encrypted password/state store, `ShizukuBridge.kt` + `AppBlockerUserService.kt` (the
  optional force-stop path, see above), and `AppBlockerModule.kt` (the React Native bridge that
  exposes all of the above to `src/native/AppBlockerModule.ts`).
- iOS has none of this — Apple's platform doesn't expose the APIs this relies on (no
  accessibility-service-style foreground-app callback, no device-admin-style uninstall friction)
  — the `ios/` folder is just the unused React Native template.
- `App.tsx` re-locks (shows `src/screens/LockScreen.tsx`) on cold start and on every genuine
  return from the background - deliberately debounced (`SPURIOUS_BACKGROUND_THRESHOLD_MS` in
  `App.tsx`) against a real false-positive found live: React Native's Android `AppState`
  briefly reports non-'active' when a native `Modal` (e.g. the master-password confirmation
  dialog) opens, even though the app never actually left the foreground - without the debounce,
  confirming a master password re-locked the app out from under itself mid-confirmation.
  Separately, on a memory-constrained device under heavy load, Android can outright kill and
  restart the app's process in the background; when that happens a fresh cold start correctly
  shows the lock screen again too (confirmed via logcat: `Running "AppBlocker"` firing a second
  time) - that one isn't a bug to fix, re-locking after a real process restart is the exact
  behavior you'd want.

## Note on this being React Native

The blocking/uninstall-guard mechanism itself is 100% native Android code (Kotlin) — there is
no JavaScript-only way to watch foreground app changes or hook Device Admin. React Native here
only supplies the UI layer on top of that native module. This also means Expo Go **will not
work** for this project (it only supports Expo's fixed set of built-in native modules); this is
a plain React Native CLI ("bare") project specifically so the custom native module can live
directly in `android/`.

---

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
