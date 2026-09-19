package com.appblocker;

// Runs inside the privileged process Shizuku spawns (adb-shell UID). Kept deliberately tiny -
// one real operation, plus the destroy method Shizuku's own server expects.
interface IAppBlockerUserService {

    void destroy() = 16777114; // Reserved transaction id Shizuku's server calls to stop the service.

    void forceStopPackage(String packageName) = 1;
}
