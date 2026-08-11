package dev.srgoodjob.haveguide.scan;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.YuvImage;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.Image;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import com.google.ar.core.Camera;
import com.google.ar.core.CameraIntrinsics;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Pose;
import com.google.ar.core.SemanticLabel;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingFailureReason;
import com.google.ar.core.TrackingState;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

public final class GardenScanActivity extends Activity implements GLSurfaceView.Renderer {
    public static final String EXTRA_SESSION_ID = "gardenScan.sessionId";
    public static final String EXTRA_SESSION_PATH = "gardenScan.sessionPath";
    public static final String EXTRA_KEYFRAMES = "gardenScan.keyframes";
    public static final String EXTRA_FRAMES = "gardenScan.frames";
    public static final String EXTRA_DURATION_MS = "gardenScan.durationMs";
    public static final String EXTRA_DEPTH_ENABLED = "gardenScan.depthEnabled";
    public static final String EXTRA_SEMANTICS_ENABLED = "gardenScan.semanticsEnabled";
    public static final String EXTRA_LOCATION_CAPTURED = "gardenScan.locationCaptured";
    public static final String EXTRA_ERROR = "gardenScan.error";

    private static final long TRACKING_INTERVAL_MS = 200L;
    private static final long MIN_KEYFRAME_INTERVAL_MS = 900L;
    private static final long TIME_KEYFRAME_INTERVAL_MS = 3000L;
    private static final long FORCED_KEYFRAME_INTERVAL_MS = 6000L;
    private static final float MOVE_METERS = 0.55f;
    private static final float ROTATION_DEGREES = 18f;
    private static final double MIN_SHARPNESS = 5.0;
    private static final double SCENE_LUMA_DELTA = 10.0;

    private final Object sessionLock = new Object();
    private Session session;
    private GLSurfaceView surface;
    private ArCameraRenderer cameraRenderer;
    private TextView statusText;
    private TextView detailText;
    private int surfaceWidth;
    private int surfaceHeight;
    private boolean resumed;
    private boolean finished;
    private boolean depthEnabled;
    private boolean semanticsEnabled;

    private String sessionId;
    private File sessionDir;
    private File keyframeDir;
    private BufferedWriter trackingWriter;
    private long startedAtMs;
    private long frameCount;
    private int keyframeCount;
    private long lastTrackingMs;
    private long lastKeyframeMs;
    private Pose lastKeyframePose;
    private double lastKeyframeMeanLuma = Double.NaN;
    private String previousKeyframeId;

    private LocationManager locationManager;
    private volatile Location latestLocation;
    private final LocationListener locationListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { latestLocation = location; }
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
        @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        createUi();

        try {
            sessionId = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date()) + "-" + UUID.randomUUID().toString().substring(0, 8);
            sessionDir = new File(new File(getFilesDir(), "garden-scans"), sessionId);
            keyframeDir = new File(sessionDir, "keyframes");
            if (!keyframeDir.mkdirs() && !keyframeDir.isDirectory()) throw new IOException("Scan-mappen kunne ikke oprettes.");
            trackingWriter = new BufferedWriter(new OutputStreamWriter(
                new FileOutputStream(new File(sessionDir, "tracking.jsonl"), true), StandardCharsets.UTF_8));

            session = new Session(this);
            Config config = new Config(session);
            config.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
            depthEnabled = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC);
            semanticsEnabled = session.isSemanticModeSupported(Config.SemanticMode.ENABLED);
            if (depthEnabled) config.setDepthMode(Config.DepthMode.AUTOMATIC);
            if (semanticsEnabled) config.setSemanticMode(Config.SemanticMode.ENABLED);
            session.configure(config);
            startedAtMs = System.currentTimeMillis();
            writeManifest(false, "starting");
            startLocation();
        } catch (Exception error) {
            finishWithError("AR-scanneren kunne ikke startes: " + error.getClass().getSimpleName());
        }
    }

    private void createUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        surface = new GLSurfaceView(this);
        surface.setEGLContextClientVersion(2);
        surface.setPreserveEGLContextOnPause(true);
        surface.setRenderer(this);
        surface.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        root.addView(surface, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(18), dp(16), dp(18), dp(16));
        panel.setBackgroundColor(0xAA102217);
        statusText = text("Klargør Smart Garden Scan…", 18, true);
        detailText = text("Hold telefonen roligt og gå langsomt rundt i haven.", 14, false);
        panel.addView(statusText);
        panel.addView(detailText);
        FrameLayout.LayoutParams top = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        top.gravity = Gravity.TOP;
        top.setMargins(dp(12), dp(12), dp(12), 0);
        root.addView(panel, top);

        Button stop = new Button(this);
        stop.setText("Afslut scan");
        stop.setTextSize(16);
        stop.setOnClickListener(view -> finishScan());
        FrameLayout.LayoutParams bottom = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(56));
        bottom.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        bottom.setMargins(0, 0, 0, dp(24));
        root.addView(stop, bottom);
        setContentView(root);
    }

    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (session == null || finished) return;
        try {
            synchronized (sessionLock) {
                session.resume();
                resumed = true;
            }
            surface.onResume();
        } catch (Exception error) {
            finishWithError("Kameraet kunne ikke åbnes: " + error.getClass().getSimpleName());
        }
    }

    @Override
    protected void onPause() {
        if (surface != null) surface.onPause();
        synchronized (sessionLock) {
            resumed = false;
            if (session != null) {
                try { session.pause(); } catch (Exception ignored) {}
            }
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        stopLocation();
        closeWriter();
        synchronized (sessionLock) {
            if (session != null) {
                session.close();
                session = null;
            }
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        finishScan();
    }

    @Override
    public void onSurfaceCreated(javax.microedition.khronos.opengles.GL10 gl, javax.microedition.khronos.egl.EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        cameraRenderer = new ArCameraRenderer();
        int textureId = cameraRenderer.createOnGlThread();
        synchronized (sessionLock) {
            if (session != null) session.setCameraTextureName(textureId);
        }
    }

    @Override
    public void onSurfaceChanged(javax.microedition.khronos.opengles.GL10 gl, int width, int height) {
        surfaceWidth = width;
        surfaceHeight = height;
        GLES20.glViewport(0, 0, width, height);
    }

    @Override
    public void onDrawFrame(javax.microedition.khronos.opengles.GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (finished || !resumed || session == null || cameraRenderer == null) return;

        try {
            Frame frame;
            synchronized (sessionLock) {
                if (!resumed || session == null) return;
                if (surfaceWidth > 0 && surfaceHeight > 0) {
                    int rotation = getWindowManager().getDefaultDisplay().getRotation();
                    session.setDisplayGeometry(rotation, surfaceWidth, surfaceHeight);
                }
                frame = session.update();
            }
            cameraRenderer.draw(frame);
            processFrame(frame);
        } catch (Exception error) {
            runOnUiThread(() -> finishWithError("AR-sessionen stoppede: " + error.getClass().getSimpleName()));
        }
    }

    private void processFrame(Frame frame) {
        frameCount++;
        Camera camera = frame.getCamera();
        TrackingState tracking = camera.getTrackingState();
        TrackingFailureReason reason = camera.getTrackingFailureReason();
        long now = System.currentTimeMillis();

        if (now - lastTrackingMs >= TRACKING_INTERVAL_MS) {
            lastTrackingMs = now;
            appendTracking(frame, camera, tracking, reason, now);
            updateStatus(tracking, reason);
        }
        if (tracking == TrackingState.TRACKING) maybeCaptureKeyframe(frame, camera, now);
    }

    private void appendTracking(Frame frame, Camera camera, TrackingState tracking, TrackingFailureReason reason, long now) {
        if (trackingWriter == null) return;
        try {
            JSONObject sample = new JSONObject();
            sample.put("timeMs", now);
            sample.put("arTimestampNs", frame.getTimestamp());
            sample.put("frameIndex", frameCount);
            sample.put("trackingState", tracking.name());
            sample.put("trackingQuality", trackingQuality(tracking, reason));
            sample.put("trackingFailureReason", reason.name());
            sample.put("pose", poseJson(camera.getPose()));
            sample.put("intrinsics", intrinsicsJson(camera.getImageIntrinsics()));
            JSONObject location = locationJson(latestLocation);
            if (location != null) sample.put("location", location);
            trackingWriter.write(sample.toString());
            trackingWriter.newLine();
            trackingWriter.flush();
        } catch (Exception ignored) {}
    }

    private void maybeCaptureKeyframe(Frame frame, Camera camera, long now) {
        if (now - lastKeyframeMs < MIN_KEYFRAME_INTERVAL_MS) return;
        Pose pose = camera.getPose();
        long elapsed = lastKeyframeMs == 0 ? Long.MAX_VALUE : now - lastKeyframeMs;
        boolean first = lastKeyframePose == null;
        boolean moved = !first && translationDistance(lastKeyframePose, pose) >= MOVE_METERS;
        boolean rotated = !first && rotationDelta(lastKeyframePose, pose) >= ROTATION_DEGREES;
        boolean forced = first || elapsed >= FORCED_KEYFRAME_INTERVAL_MS;
        boolean timeCandidate = elapsed >= TIME_KEYFRAME_INTERVAL_MS;
        if (!forced && !moved && !rotated && !timeCandidate) return;

        Image image = null;
        try {
            image = frame.acquireCameraImage();
            LumaStats luma = lumaStats(image);
            boolean sceneChanged = Double.isNaN(lastKeyframeMeanLuma) || Math.abs(luma.mean - lastKeyframeMeanLuma) >= SCENE_LUMA_DELTA;
            boolean sharpEnough = luma.sharpness >= MIN_SHARPNESS;
            if (!forced && !sharpEnough) return;
            if (!forced && timeCandidate && !moved && !rotated && !sceneChanged) return;
            captureKeyframe(frame, camera, image, pose, luma, now, moved, rotated, sceneChanged, forced);
        } catch (Exception ignored) {
            // CPU image/depth/semantics can legitimately be unavailable on individual AR frames.
        } finally {
            if (image != null) image.close();
        }
    }

    private void captureKeyframe(Frame frame, Camera camera, Image image, Pose pose, LumaStats luma, long now,
                                 boolean moved, boolean rotated, boolean sceneChanged, boolean forced) throws Exception {
        String id = String.format(Locale.US, "kf-%05d", keyframeCount + 1);
        File jpeg = new File(keyframeDir, id + ".jpg");
        writeJpeg(image, jpeg);

        JSONObject metadata = new JSONObject();
        metadata.put("id", id);
        metadata.put("previousKeyframeId", previousKeyframeId == null ? JSONObject.NULL : previousKeyframeId);
        metadata.put("timeMs", now);
        metadata.put("arTimestampNs", frame.getTimestamp());
        metadata.put("frameIndex", frameCount);
        metadata.put("rgb", jpeg.getName());
        metadata.put("rgbWidth", image.getWidth());
        metadata.put("rgbHeight", image.getHeight());
        metadata.put("pose", poseJson(pose));
        metadata.put("intrinsics", intrinsicsJson(camera.getImageIntrinsics()));
        metadata.put("trackingState", camera.getTrackingState().name());
        metadata.put("trackingQuality", trackingQuality(camera.getTrackingState(), camera.getTrackingFailureReason()));
        metadata.put("sharpness", luma.sharpness);
        metadata.put("meanLuma", luma.mean);
        JSONObject selection = new JSONObject();
        selection.put("moved", moved);
        selection.put("rotated", rotated);
        selection.put("sceneChanged", sceneChanged);
        selection.put("forced", forced);
        metadata.put("selection", selection);
        JSONObject location = locationJson(latestLocation);
        if (location != null) metadata.put("location", location);
        metadata.put("depth", captureDepth(frame, id));
        metadata.put("semantics", captureSemantics(frame, id));
        writeJson(new File(keyframeDir, id + ".json"), metadata);

        keyframeCount++;
        lastKeyframeMs = now;
        lastKeyframePose = pose;
        lastKeyframeMeanLuma = luma.mean;
        previousKeyframeId = id;
        writeManifest(false, "scanning");
    }

    private JSONObject captureDepth(Frame frame, String id) {
        JSONObject result = new JSONObject();
        try {
            if (!depthEnabled) return result.put("captured", false).put("reason", "unsupported");
            Image depth = frame.acquireDepthImage16Bits();
            try {
                File file = new File(keyframeDir, id + ".depth16");
                writePacked16(depth, file);
                return result.put("captured", true).put("file", file.getName())
                    .put("width", depth.getWidth()).put("height", depth.getHeight()).put("format", "uint16-mm-le");
            } finally { depth.close(); }
        } catch (Exception error) {
            try { return result.put("captured", false).put("reason", error.getClass().getSimpleName()); }
            catch (JSONException ignored) { return result; }
        }
    }

    private JSONObject captureSemantics(Frame frame, String id) {
        JSONObject result = new JSONObject();
        try {
            if (!semanticsEnabled) return result.put("captured", false).put("reason", "unsupported");
            Image labels = frame.acquireSemanticImage();
            Image confidence = null;
            try {
                File labelFile = new File(keyframeDir, id + ".semantic8");
                writePacked8(labels, labelFile);
                result.put("captured", true).put("file", labelFile.getName())
                    .put("width", labels.getWidth()).put("height", labels.getHeight()).put("format", "semantic-label-y8");
                try {
                    confidence = frame.acquireSemanticConfidenceImage();
                    File confidenceFile = new File(keyframeDir, id + ".semantic-confidence8");
                    writePacked8(confidence, confidenceFile);
                    result.put("confidenceFile", confidenceFile.getName());
                } catch (Exception ignored) {}
                JSONObject fractions = new JSONObject();
                for (SemanticLabel label : SemanticLabel.values()) {
                    float fraction = frame.getSemanticLabelFraction(label);
                    if (fraction >= 0.001f) fractions.put(label.name(), fraction);
                }
                result.put("labelFractions", fractions);
                return result;
            } finally {
                labels.close();
                if (confidence != null) confidence.close();
            }
        } catch (Exception error) {
            try { return result.put("captured", false).put("reason", error.getClass().getSimpleName()); }
            catch (JSONException ignored) { return result; }
        }
    }

    private void updateStatus(TrackingState state, TrackingFailureReason reason) {
        String quality = trackingQuality(state, reason);
        String reasonText = humanReason(reason);
        boolean hasLocation = latestLocation != null;
        runOnUiThread(() -> {
            if (finished) return;
            statusText.setText(state == TrackingState.TRACKING ? "Scanner haven · " + quality : "Finder position · " + quality);
            String extras = "Keyframes: " + keyframeCount + "  ·  Depth: " + (depthEnabled ? "ja" : "nej") +
                "  ·  Semantik: " + (semanticsEnabled ? "ja" : "nej") + "  ·  GPS: " + (hasLocation ? "ja" : "nej");
            detailText.setText(reasonText.isEmpty() ? extras : reasonText + "\n" + extras);
        });
    }

    private String trackingQuality(TrackingState state, TrackingFailureReason reason) {
        if (state == TrackingState.TRACKING) return "god";
        if (state == TrackingState.PAUSED && reason == TrackingFailureReason.NONE) return "kalibrerer";
        if (state == TrackingState.PAUSED) return "begrænset";
        return "stoppet";
    }

    private String humanReason(TrackingFailureReason reason) {
        switch (reason) {
            case EXCESSIVE_MOTION: return "Bevæg telefonen lidt langsommere.";
            case INSUFFICIENT_FEATURES: return "Ret kameraet mod områder med flere detaljer.";
            case INSUFFICIENT_LIGHT: return "Der er for lidt lys til stabil tracking.";
            case CAMERA_UNAVAILABLE: return "Kameraet er midlertidigt utilgængeligt.";
            case BAD_STATE: return "ARCore kan ikke tracke stabilt lige nu.";
            default: return "";
        }
    }

    private void finishScan() {
        if (finished) return;
        finished = true;
        long duration = Math.max(0L, System.currentTimeMillis() - startedAtMs);
        writeManifest(true, "completed");
        closeWriter();
        stopLocation();

        Intent result = new Intent();
        result.putExtra(EXTRA_SESSION_ID, sessionId);
        result.putExtra(EXTRA_SESSION_PATH, sessionDir == null ? null : sessionDir.getAbsolutePath());
        result.putExtra(EXTRA_KEYFRAMES, keyframeCount);
        result.putExtra(EXTRA_FRAMES, frameCount);
        result.putExtra(EXTRA_DURATION_MS, duration);
        result.putExtra(EXTRA_DEPTH_ENABLED, depthEnabled);
        result.putExtra(EXTRA_SEMANTICS_ENABLED, semanticsEnabled);
        result.putExtra(EXTRA_LOCATION_CAPTURED, latestLocation != null);
        setResult(Activity.RESULT_OK, result);
        finish();
    }

    private void finishWithError(String message) {
        if (finished) return;
        finished = true;
        try { writeManifest(false, "error"); } catch (Exception ignored) {}
        Intent result = new Intent();
        result.putExtra(EXTRA_ERROR, message);
        setResult(Activity.RESULT_CANCELED, result);
        finish();
    }

    private void writeManifest(boolean completed, String state) {
        if (sessionDir == null) return;
        try {
            JSONObject manifest = new JSONObject();
            manifest.put("schemaVersion", 1);
            manifest.put("sessionId", sessionId);
            manifest.put("state", state);
            manifest.put("completed", completed);
            manifest.put("startedAtMs", startedAtMs);
            manifest.put("updatedAtMs", System.currentTimeMillis());
            manifest.put("durationMs", startedAtMs == 0 ? 0 : Math.max(0, System.currentTimeMillis() - startedAtMs));
            manifest.put("frames", frameCount);
            manifest.put("keyframes", keyframeCount);
            manifest.put("depthEnabled", depthEnabled);
            manifest.put("sceneSemanticsEnabled", semanticsEnabled);
            manifest.put("locationCaptured", latestLocation != null);
            manifest.put("trackingFile", "tracking.jsonl");
            manifest.put("keyframeDirectory", "keyframes");
            writeJson(new File(sessionDir, "session.json"), manifest);
        } catch (Exception ignored) {}
    }

    private void startLocation() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) return;
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            if (fine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (last != null) latestLocation = last;
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 1f, locationListener);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                Location last = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (last != null && (latestLocation == null || last.getTime() > latestLocation.getTime())) latestLocation = last;
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1500L, 2f, locationListener);
            }
        } catch (SecurityException ignored) {}
    }

    private void stopLocation() {
        if (locationManager == null) return;
        try { locationManager.removeUpdates(locationListener); } catch (SecurityException ignored) {}
    }

    private JSONObject poseJson(Pose pose) throws JSONException {
        float[] t = new float[3];
        float[] q = new float[4];
        pose.getTranslation(t, 0);
        pose.getRotationQuaternion(q, 0);
        return new JSONObject().put("translation", array(t)).put("rotationQuaternion", array(q));
    }

    private JSONObject intrinsicsJson(CameraIntrinsics intrinsics) throws JSONException {
        return new JSONObject()
            .put("focalLength", array(intrinsics.getFocalLength()))
            .put("principalPoint", array(intrinsics.getPrincipalPoint()))
            .put("imageDimensions", array(intrinsics.getImageDimensions()));
    }

    private JSONObject locationJson(Location location) throws JSONException {
        if (location == null) return null;
        JSONObject result = new JSONObject();
        result.put("latitude", location.getLatitude());
        result.put("longitude", location.getLongitude());
        result.put("accuracyMeters", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
        result.put("altitudeMeters", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
        result.put("provider", location.getProvider());
        result.put("timeMs", location.getTime());
        return result;
    }

    private JSONArray array(float[] values) {
        JSONArray result = new JSONArray();
        for (float value : values) result.put(value);
        return result;
    }

    private JSONArray array(int[] values) {
        JSONArray result = new JSONArray();
        for (int value : values) result.put(value);
        return result;
    }

    private void writeJson(File file, JSONObject value) throws IOException, JSONException {
        try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            writer.write(value.toString(2));
        }
    }

    private void writeJpeg(Image image, File file) throws IOException {
        int width = image.getWidth();
        int height = image.getHeight();
        byte[] nv21 = new byte[width * height * 3 / 2];
        Image.Plane[] planes = image.getPlanes();
        copyPlane(planes[0], width, height, nv21, 0, 1);
        ByteBuffer u = planes[1].getBuffer().duplicate();
        ByteBuffer v = planes[2].getBuffer().duplicate();
        int offset = width * height;
        int chromaWidth = width / 2;
        int chromaHeight = height / 2;
        for (int y = 0; y < chromaHeight; y++) {
            for (int x = 0; x < chromaWidth; x++) {
                int vi = y * planes[2].getRowStride() + x * planes[2].getPixelStride();
                int ui = y * planes[1].getRowStride() + x * planes[1].getPixelStride();
                nv21[offset++] = v.get(vi);
                nv21[offset++] = u.get(ui);
            }
        }
        YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, width, height, null);
        try (FileOutputStream stream = new FileOutputStream(file)) {
            if (!yuv.compressToJpeg(new android.graphics.Rect(0, 0, width, height), 88, stream)) {
                throw new IOException("JPEG capture failed");
            }
        }
    }

    private void copyPlane(Image.Plane plane, int width, int height, byte[] out, int offset, int outputStride) {
        ByteBuffer buffer = plane.getBuffer().duplicate();
        for (int y = 0; y < height; y++) {
            int row = y * plane.getRowStride();
            for (int x = 0; x < width; x++) {
                out[offset + (y * width + x) * outputStride] = buffer.get(row + x * plane.getPixelStride());
            }
        }
    }

    private void writePacked16(Image image, File file) throws IOException {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer source = plane.getBuffer().duplicate();
        try (OutputStream output = new FileOutputStream(file)) {
            for (int y = 0; y < image.getHeight(); y++) {
                int row = y * plane.getRowStride();
                for (int x = 0; x < image.getWidth(); x++) {
                    int index = row + x * plane.getPixelStride();
                    output.write(source.get(index) & 0xff);
                    output.write(source.get(index + 1) & 0xff);
                }
            }
        }
    }

    private void writePacked8(Image image, File file) throws IOException {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer source = plane.getBuffer().duplicate();
        try (OutputStream output = new FileOutputStream(file)) {
            for (int y = 0; y < image.getHeight(); y++) {
                int row = y * plane.getRowStride();
                for (int x = 0; x < image.getWidth(); x++) {
                    output.write(source.get(row + x * plane.getPixelStride()) & 0xff);
                }
            }
        }
    }

    private LumaStats lumaStats(Image image) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer().duplicate();
        int step = 8;
        double total = 0;
        double edges = 0;
        int count = 0;
        int edgeCount = 0;
        for (int y = 0; y < image.getHeight(); y += step) {
            int previous = -1;
            int row = y * plane.getRowStride();
            for (int x = 0; x < image.getWidth(); x += step) {
                int value = buffer.get(row + x * plane.getPixelStride()) & 0xff;
                total += value;
                count++;
                if (previous >= 0) {
                    edges += Math.abs(value - previous);
                    edgeCount++;
                }
                previous = value;
            }
        }
        return new LumaStats(count == 0 ? 0 : total / count, edgeCount == 0 ? 0 : edges / edgeCount);
    }

    private float translationDistance(Pose a, Pose b) {
        float[] at = new float[3];
        float[] bt = new float[3];
        a.getTranslation(at, 0);
        b.getTranslation(bt, 0);
        float x = at[0] - bt[0], y = at[1] - bt[1], z = at[2] - bt[2];
        return (float) Math.sqrt(x * x + y * y + z * z);
    }

    private float rotationDelta(Pose a, Pose b) {
        float[] aq = new float[4];
        float[] bq = new float[4];
        a.getRotationQuaternion(aq, 0);
        b.getRotationQuaternion(bq, 0);
        double dot = Math.abs(aq[0] * bq[0] + aq[1] * bq[1] + aq[2] * bq[2] + aq[3] * bq[3]);
        return (float) Math.toDegrees(2.0 * Math.acos(Math.min(1.0, dot)));
    }

    private void closeWriter() {
        if (trackingWriter == null) return;
        try { trackingWriter.close(); } catch (IOException ignored) {}
        trackingWriter = null;
    }

    private static final class LumaStats {
        final double mean;
        final double sharpness;
        LumaStats(double mean, double sharpness) { this.mean = mean; this.sharpness = sharpness; }
    }
}
