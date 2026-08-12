package dev.srgoodjob.haveguide.scan;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;

import org.json.JSONObject;

import java.io.File;

@CapacitorPlugin(
    name = "GardenScan",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public class GardenScanPlugin extends Plugin {

    private JSObject buildCapabilities() {
        JSObject result = new JSObject();
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getContext());
        boolean cameraGranted = getPermissionState("camera") == PermissionState.GRANTED;

        result.put("platform", "android");
        result.put("cameraPermissionGranted", cameraGranted);
        result.put("locationPermissionGranted", getPermissionState("location") == PermissionState.GRANTED);
        result.put("arCoreAvailability", availability.name());
        result.put("arCoreSupported", availability.isSupported());
        result.put("arCoreInstalled", availability == ArCoreApk.Availability.SUPPORTED_INSTALLED);
        result.put("depthSupported", false);
        result.put("sceneSemanticsSupported", false);

        if (availability != ArCoreApk.Availability.SUPPORTED_INSTALLED || !cameraGranted) return result;

        Session session = null;
        try {
            session = new Session(getContext());
            result.put("depthSupported", session.isDepthModeSupported(Config.DepthMode.AUTOMATIC));
            result.put("sceneSemanticsSupported", session.isSemanticModeSupported(Config.SemanticMode.ENABLED));
        } catch (Exception error) {
            result.put("probeError", error.getClass().getSimpleName());
        } finally {
            if (session != null) session.close();
        }
        return result;
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        call.resolve(buildCapabilities());
    }

    @PluginMethod
    public void requestScanPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            call.resolve(buildCapabilities());
            return;
        }
        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Kameraadgang er nødvendig for Smart Garden Scan.");
            return;
        }
        call.resolve(buildCapabilities());
    }

    @PluginMethod
    public void ensureArCore(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Android-aktiviteten er ikke klar endnu.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                ArCoreApk.InstallStatus status = ArCoreApk.getInstance().requestInstall(getActivity(), true);
                JSObject result = new JSObject();
                result.put("status", status.name());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Google Play Services for AR kunne ikke klargøres.", error);
            }
        });
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Android-aktiviteten er ikke klar endnu.");
            return;
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "startCameraPermissionCallback");
            return;
        }
        requestLocationThenStart(call);
    }

    @PluginMethod
    public void reconstructLatestScan(PluginCall call) {
        try {
            File sessionDir = GardenScanReconstructor.findLatestSession(getContext().getFilesDir());
            if (sessionDir == null) {
                call.reject("Der er ingen Smart Garden Scan-session på telefonen endnu.");
                return;
            }
            JSONObject summary = GardenScanReconstructor.reconstruct(sessionDir);
            JSObject result = new JSObject();
            result.put("sessionId", summary.getString("sessionId"));
            result.put("sourceSchemaVersion", summary.getInt("sourceSchemaVersion"));
            result.put("coordinateFrame", summary.getString("coordinateFrame"));
            result.put("keyframesProcessed", summary.getLong("keyframesProcessed"));
            result.put("keyframesSkipped", summary.getLong("keyframesSkipped"));
            result.put("acceptedSamples", summary.getLong("acceptedSamples"));
            result.put("voxels", summary.getInt("voxels"));
            result.put("clusters", summary.getInt("clusters"));
            result.put("semanticSamples", summary.getJSONObject("semanticSamples"));
            result.put("reconstructionFile", summary.getString("reconstructionFile"));
            result.put("voxelFile", summary.getString("voxelFile"));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Den seneste scan kunne ikke rekonstrueres: " + error.getMessage(), error);
        }
    }

    @PermissionCallback
    private void startCameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Kameraadgang er nødvendig for Smart Garden Scan.");
            return;
        }
        requestLocationThenStart(call);
    }

    private void requestLocationThenStart(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            launchScanner(call);
            return;
        }
        requestPermissionForAlias("location", call, "locationPermissionCallback");
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        // Global location is only a rough georeference. A denied location permission must not block AR scanning.
        launchScanner(call);
    }

    private void launchScanner(PluginCall call) {
        if (ArCoreApk.getInstance().checkAvailability(getContext()) != ArCoreApk.Availability.SUPPORTED_INSTALLED) {
            call.reject("ARCore er ikke installeret eller understøttet på denne telefon.");
            return;
        }
        Intent intent = new Intent(getContext(), GardenScanActivity.class);
        startActivityForResult(call, intent, "scanFinished");
    }

    @ActivityCallback
    private void scanFinished(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        Intent data = activityResult.getData();
        if (activityResult.getResultCode() != Activity.RESULT_OK || data == null) {
            String message = data == null ? null : data.getStringExtra(GardenScanActivity.EXTRA_ERROR);
            call.reject(message == null ? "Smart Garden Scan blev afbrudt." : message);
            return;
        }

        String sessionPath = data.getStringExtra(GardenScanActivity.EXTRA_SESSION_PATH);
        long durationMs = data.getLongExtra(GardenScanActivity.EXTRA_DURATION_MS, 0L);
        long frames = data.getLongExtra(GardenScanActivity.EXTRA_FRAMES, 0L);
        int keyframes = data.getIntExtra(GardenScanActivity.EXTRA_KEYFRAMES, 0);
        boolean depthEnabled = data.getBooleanExtra(GardenScanActivity.EXTRA_DEPTH_ENABLED, false);
        boolean semanticsEnabled = data.getBooleanExtra(GardenScanActivity.EXTRA_SEMANTICS_ENABLED, false);
        boolean locationCaptured = data.getBooleanExtra(GardenScanActivity.EXTRA_LOCATION_CAPTURED, false);

        // GardenScanActivity and its GL thread can race on the final manifest write. Repair it after the Activity result,
        // when capture has stopped, so a terminal completed state can no longer be overwritten by "scanning".
        if (sessionPath != null) {
            GardenScanReconstructor.markCompleted(
                new File(sessionPath), durationMs, frames, keyframes, depthEnabled, semanticsEnabled, locationCaptured);
        }

        JSObject result = new JSObject();
        result.put("sessionId", data.getStringExtra(GardenScanActivity.EXTRA_SESSION_ID));
        result.put("sessionPath", sessionPath);
        result.put("keyframes", keyframes);
        result.put("frames", frames);
        result.put("durationMs", durationMs);
        result.put("depthEnabled", depthEnabled);
        result.put("sceneSemanticsEnabled", semanticsEnabled);
        result.put("locationCaptured", locationCaptured);
        result.put("completed", true);
        call.resolve(result);
    }
}
