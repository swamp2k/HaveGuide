package dev.srgoodjob.haveguide.scan;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Config;
import com.google.ar.core.Session;

@CapacitorPlugin(name = "GardenScan")
public class GardenScanPlugin extends Plugin {

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getContext());

        result.put("platform", "android");
        result.put("arCoreAvailability", availability.name());
        result.put("arCoreSupported", availability.isSupported());
        result.put("arCoreInstalled", availability == ArCoreApk.Availability.SUPPORTED_INSTALLED);
        result.put("depthSupported", false);
        result.put("sceneSemanticsSupported", false);

        if (availability != ArCoreApk.Availability.SUPPORTED_INSTALLED) {
            call.resolve(result);
            return;
        }

        Session session = null;
        try {
            session = new Session(getContext());
            result.put(
                "depthSupported",
                session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
            );
            result.put(
                "sceneSemanticsSupported",
                session.isSemanticModeSupported(Config.SemanticMode.ENABLED)
            );
        } catch (Exception error) {
            result.put("probeError", error.getClass().getSimpleName());
        } finally {
            if (session != null) {
                session.close();
            }
        }

        call.resolve(result);
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
