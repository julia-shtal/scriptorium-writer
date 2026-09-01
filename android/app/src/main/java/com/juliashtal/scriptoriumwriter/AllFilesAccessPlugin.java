package com.juliashtal.scriptoriumwriter;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reads and requests MANAGE_EXTERNAL_STORAGE ("All files access") — MC3.
 *
 * This exists because @capacitor/filesystem has no API for it. The plugin's own permission
 * handling covers the legacy READ/WRITE_EXTERNAL_STORAGE pair; MANAGE_EXTERNAL_STORAGE is a
 * "special" app-op permission that is never granted through requestPermissions(), only by the
 * user toggling it on a system Settings screen, and its state can only be read via
 * Environment.isExternalStorageManager(). That is the whole reason for these ~50 lines of Java.
 *
 * Why the app needs it at all is recorded in AndroidManifest.xml next to the <uses-permission>:
 * without it the library is visible but not durable, and — the part that makes this a
 * priority-#1 data question rather than a convenience one — an unreadable library is
 * indistinguishable from an empty one, so the app would seed a demo story over the user's work.
 *
 * NO API-LEVEL GUARDS HERE, DELIBERATELY. Environment.isExternalStorageManager() and both
 * Settings actions used below are API 30+, and android/variables.gradle pins minSdkVersion to
 * 30 for exactly this reason. If someone lowers that floor, this file must grow
 * Build.VERSION.SDK_INT checks and a legacy path — it will fail to compile against the lower
 * floor first, which is the loud failure we want.
 */
@CapacitorPlugin(name = "AllFilesAccess")
public class AllFilesAccessPlugin extends Plugin {

    /** The TS side turns this into "open Settings by hand" instructions. See all-files-access.ts. */
    private static final String ERR_NO_SETTINGS_SCREEN = "NO_SETTINGS_SCREEN";

    /**
     * Live state of the permission. Read every time rather than cached: the user can grant it
     * (or revoke it) from system Settings while this app sits in the background, so a cached
     * answer would be stale exactly when the gate re-checks after the user comes back.
     */
    @PluginMethod
    public void check(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Environment.isExternalStorageManager());
        call.resolve(result);
    }

    /**
     * Send the user to the system screen where the permission can actually be granted.
     *
     * ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION lands directly on this app's toggle and is
     * the right experience, but it is not guaranteed to resolve: heavily reskinned OEM builds
     * omit it, and Honor/EMUI — the exact family the target tablet comes from — is the usual
     * suspect. So resolve it first and fall back to the global all-files-access list, where the
     * user can find the app themselves.
     *
     * If neither resolves we reject with a code rather than starting nothing. A button that
     * looks like it worked and did nothing is the one outcome MC3 forbids: the user would be
     * left staring at a gate with no way past it and no idea why.
     */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Uri appUri = Uri.parse("package:" + getContext().getPackageName());
        Intent perApp = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, appUri);
        if (startIfResolvable(perApp)) {
            call.resolve();
            return;
        }

        Intent global = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
        if (startIfResolvable(global)) {
            call.resolve();
            return;
        }

        call.reject(
            "No system screen for all-files access resolved on this device.",
            ERR_NO_SETTINGS_SCREEN
        );
    }

    /**
     * Start `intent` only if something on the device can handle it, reporting whether it went.
     *
     * The resolveActivity check is what makes the fallback above possible at all —
     * startActivity() on an unresolvable implicit intent throws ActivityNotFoundException, and
     * catching that would conflate "this OEM lacks the screen" (recoverable, try the next one)
     * with a real failure. The catch is still kept as a belt-and-braces net because
     * resolveActivity and startActivity consult package visibility separately.
     */
    private boolean startIfResolvable(Intent intent) {
        PackageManager pm = getContext().getPackageManager();
        if (intent.resolveActivity(pm) == null) {
            return false;
        }
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
