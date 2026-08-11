package dev.srgoodjob.haveguide.scan;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;

@CapacitorPlugin(
    name = "GardenScan",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class GardenScanPlugin extends Plugin {

    private JSObject buildCapabilities() {
        JSObject result = new JSObject();
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getContext());
        boolean cameraGranted = getPermissionState("camera") == PermissionState.GRANTED;

        result.put("platform", "android");
        result.put("cameraPermissionGranted", cameraGranted);
        result.put("arCoreAvailability", availability.name());
        result.put("arCoreSupported", availability.isSupported());
        result.put("arCoreInstalled", availability == ArCoreApk.Availability.SUPPORTED_INSTALLED);
        result.put("depthSupported", false);
        result.put("sceneSemanticsSupported", false);

        if (availability != ArCoreApk.Availability.SUPPORTED_INSTALLED || !cameraGranted) {
            return result;
        }

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
}
