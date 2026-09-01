package com.juliashtal.scriptoriumwriter;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // registerPlugin MUST run BEFORE super.onCreate: that is where BridgeActivity builds
        // the Bridge and snapshots the plugin list. Registering afterwards compiles, runs, and
        // silently produces a bridge that has never heard of AllFilesAccess — the JS call then
        // rejects with "not implemented", which hasAllFilesAccess() (by design) reads as
        // "not granted", so the app would gate itself out of its own library forever.
        registerPlugin(AllFilesAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
