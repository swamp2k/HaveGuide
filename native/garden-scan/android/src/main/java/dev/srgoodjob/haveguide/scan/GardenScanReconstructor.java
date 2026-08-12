package dev.srgoodjob.haveguide.scan;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class GardenScanReconstructor {
    private static final double VOXEL_SIZE_METERS = 0.35;
    private static final int SAMPLE_STEP = 4;
    private static final int MIN_DEPTH_MM = 400;
    private static final int MAX_DEPTH_MM = 12000;
    private static final int MIN_SEMANTIC_CONFIDENCE = 100;
    private static final int MIN_VOXEL_SAMPLES = 2;
    private static final int MIN_CLUSTER_SAMPLES = 20;

    // ARCore ArSemanticLabel numeric values. Dynamic classes and sky are intentionally excluded.
    private static final String[] LABEL_NAMES = {
        "UNLABELED", "SKY", "BUILDING", "TREE", "ROAD", "SIDEWALK",
        "TERRAIN", "STRUCTURE", "OBJECT", "VEHICLE", "PERSON", "WATER"
    };
    private static final Set<Integer> SPATIAL_LABELS = new HashSet<>(Arrays.asList(2, 3, 4, 5, 6, 7, 8, 11));

    private GardenScanReconstructor() {}

    static File findLatestSession(File appFilesDir) {
        File root = new File(appFilesDir, "garden-scans");
        File[] sessions = root.listFiles(File::isDirectory);
        if (sessions == null || sessions.length == 0) return null;
        Arrays.sort(sessions, Comparator.comparingLong(File::lastModified).reversed());
        return sessions[0];
    }

    static void markCompleted(File sessionDir, long durationMs, long frames, int keyframes,
                              boolean depthEnabled, boolean semanticsEnabled, boolean locationCaptured) {
        if (sessionDir == null) return;
        try {
            File manifestFile = new File(sessionDir, "session.json");
            JSONObject manifest = manifestFile.isFile() ? readJson(manifestFile) : new JSONObject();
            if (!manifest.has("schemaVersion")) manifest.put("schemaVersion", 1);
            manifest.put("sessionId", sessionDir.getName());
            manifest.put("state", "completed");
            manifest.put("completed", true);
            manifest.put("updatedAtMs", System.currentTimeMillis());
            manifest.put("durationMs", durationMs);
            manifest.put("frames", frames);
            manifest.put("keyframes", keyframes);
            manifest.put("depthEnabled", depthEnabled);
            manifest.put("sceneSemanticsEnabled", semanticsEnabled);
            manifest.put("locationCaptured", locationCaptured);
            if (!manifest.has("trackingFile")) manifest.put("trackingFile", "tracking.jsonl");
            if (!manifest.has("keyframeDirectory")) manifest.put("keyframeDirectory", "keyframes");
            writeJson(manifestFile, manifest);
        } catch (Exception ignored) {
            // The scan result still returns even if metadata repair fails. Reconstruction will report the missing manifest later.
        }
    }

    static JSONObject reconstruct(File sessionDir) throws Exception {
        if (sessionDir == null || !sessionDir.isDirectory()) throw new IllegalArgumentException("Scan-sessionen findes ikke.");
        File manifestFile = new File(sessionDir, "session.json");
        File keyframeDir = new File(sessionDir, "keyframes");
        if (!manifestFile.isFile() || !keyframeDir.isDirectory()) throw new IllegalArgumentException("Scan-sessionen mangler metadata eller keyframes.");

        JSONObject manifest = readJson(manifestFile);
        int sourceSchemaVersion = manifest.optInt("schemaVersion", 1);
        File[] metadataFiles = keyframeDir.listFiles(file -> file.isFile() && file.getName().startsWith("kf-") && file.getName().endsWith(".json"));
        if (metadataFiles == null || metadataFiles.length == 0) throw new IllegalArgumentException("Scan-sessionen indeholder ingen keyframes.");
        Arrays.sort(metadataFiles, Comparator.comparing(File::getName));

        Map<VoxelKey, VoxelAccumulator> voxels = new HashMap<>();
        Map<Integer, Long> semanticSampleCounts = new HashMap<>();
        ReconstructionStats stats = new ReconstructionStats();
        Bounds bounds = new Bounds();
        boolean usedScanOriginPose = false;

        for (File metadataFile : metadataFiles) {
            JSONObject metadata = readJson(metadataFile);
            JSONObject depth = metadata.optJSONObject("depth");
            JSONObject semantics = metadata.optJSONObject("semantics");
            if (depth == null || semantics == null || !depth.optBoolean("captured") || !semantics.optBoolean("captured")) {
                stats.keyframesSkipped++;
                continue;
            }

            File depthFile = new File(keyframeDir, depth.optString("file"));
            File semanticFile = new File(keyframeDir, semantics.optString("file"));
            if (!depthFile.isFile() || !semanticFile.isFile()) {
                stats.keyframesSkipped++;
                continue;
            }

            int depthWidth = depth.optInt("width");
            int depthHeight = depth.optInt("height");
            int semanticWidth = semantics.optInt("width");
            int semanticHeight = semantics.optInt("height");
            if (depthWidth <= 0 || depthHeight <= 0 || semanticWidth <= 0 || semanticHeight <= 0) {
                stats.keyframesSkipped++;
                continue;
            }

            byte[] depthBytes = readBytes(depthFile);
            byte[] semanticBytes = readBytes(semanticFile);
            if (depthBytes.length < depthWidth * depthHeight * 2 || semanticBytes.length < semanticWidth * semanticHeight) {
                stats.keyframesSkipped++;
                continue;
            }

            byte[] confidenceBytes = null;
            String confidenceName = semantics.optString("confidenceFile", "");
            if (!confidenceName.isEmpty()) {
                File confidenceFile = new File(keyframeDir, confidenceName);
                if (confidenceFile.isFile()) confidenceBytes = readBytes(confidenceFile);
            }

            JSONObject intrinsics = metadata.getJSONObject("intrinsics");
            double[] focalLength = array2(intrinsics.getJSONArray("focalLength"));
            double[] principalPoint = array2(intrinsics.getJSONArray("principalPoint"));
            JSONArray imageDimensions = intrinsics.getJSONArray("imageDimensions");
            int imageWidth = imageDimensions.getInt(0);
            int imageHeight = imageDimensions.getInt(1);
            if (imageWidth <= 0 || imageHeight <= 0 || focalLength[0] <= 0 || focalLength[1] <= 0) {
                stats.keyframesSkipped++;
                continue;
            }

            JSONObject poseJson = metadata.optJSONObject("scanPose");
            if (poseJson != null) usedScanOriginPose = true;
            else poseJson = metadata.getJSONObject("pose");
            PoseData pose = PoseData.fromJson(poseJson);
            String keyframeId = metadata.optString("id", metadataFile.getName().replace(".json", ""));

            for (int y = 0; y < depthHeight; y += SAMPLE_STEP) {
                int semanticY = clamp((int) (((y + 0.5) * semanticHeight) / depthHeight), 0, semanticHeight - 1);
                for (int x = 0; x < depthWidth; x += SAMPLE_STEP) {
                    stats.depthSamples++;
                    int depthIndex = 2 * (y * depthWidth + x);
                    int depthMm = (depthBytes[depthIndex] & 0xff) | ((depthBytes[depthIndex + 1] & 0xff) << 8);
                    if (depthMm < MIN_DEPTH_MM || depthMm > MAX_DEPTH_MM) {
                        stats.depthRejected++;
                        continue;
                    }

                    int semanticX = clamp((int) (((x + 0.5) * semanticWidth) / depthWidth), 0, semanticWidth - 1);
                    int semanticIndex = semanticY * semanticWidth + semanticX;
                    int label = semanticBytes[semanticIndex] & 0xff;
                    if (!SPATIAL_LABELS.contains(label)) {
                        stats.semanticRejected++;
                        continue;
                    }

                    int confidence = 255;
                    if (confidenceBytes != null && confidenceBytes.length > semanticIndex) confidence = confidenceBytes[semanticIndex] & 0xff;
                    if (confidence < MIN_SEMANTIC_CONFIDENCE) {
                        stats.confidenceRejected++;
                        continue;
                    }

                    double[] imagePoint = mapDepthToImage(x, y, depthWidth, depthHeight, imageWidth, imageHeight);
                    double z = depthMm / 1000.0;
                    // ARCore physical camera pose follows OpenGL camera axes: +X right, +Y up, -Z forward.
                    double localX = ((imagePoint[0] - principalPoint[0]) / focalLength[0]) * z;
                    double localY = -((imagePoint[1] - principalPoint[1]) / focalLength[1]) * z;
                    double localZ = -z;
                    double[] world = pose.transform(localX, localY, localZ);
                    if (!finite(world[0]) || !finite(world[1]) || !finite(world[2])) continue;

                    int ix = (int) Math.floor(world[0] / VOXEL_SIZE_METERS);
                    int iy = (int) Math.floor(world[1] / VOXEL_SIZE_METERS);
                    int iz = (int) Math.floor(world[2] / VOXEL_SIZE_METERS);
                    VoxelKey key = new VoxelKey(label, ix, iy, iz);
                    VoxelAccumulator accumulator = voxels.get(key);
                    if (accumulator == null) {
                        accumulator = new VoxelAccumulator();
                        voxels.put(key, accumulator);
                    }
                    accumulator.add(world, confidence / 255.0, keyframeId);
                    semanticSampleCounts.put(label, semanticSampleCounts.getOrDefault(label, 0L) + 1L);
                    bounds.include(world);
                    stats.acceptedSamples++;
                }
            }
            stats.keyframesProcessed++;
        }

        Map<VoxelKey, VoxelAccumulator> eligible = new HashMap<>();
        for (Map.Entry<VoxelKey, VoxelAccumulator> entry : voxels.entrySet()) {
            if (entry.getValue().count >= MIN_VOXEL_SAMPLES) eligible.put(entry.getKey(), entry.getValue());
        }

        List<ClusterData> clusters = cluster(eligible);
        clusters.sort((left, right) -> Long.compare(right.sampleCount, left.sampleCount));

        File voxelFile = new File(sessionDir, "reconstruction-voxels.jsonl");
        writeVoxels(voxelFile, eligible);

        JSONObject result = new JSONObject();
        result.put("schemaVersion", 1);
        result.put("sourceSessionId", manifest.optString("sessionId", sessionDir.getName()));
        result.put("sourceSchemaVersion", sourceSchemaVersion);
        result.put("generatedAtMs", System.currentTimeMillis());
        result.put("coordinateFrame", usedScanOriginPose ? "scan-origin" : "legacy-arcore-world");
        result.put("pixelMapping", "center-crop-fallback");
        result.put("voxelSizeMeters", VOXEL_SIZE_METERS);
        result.put("sampleStepPixels", SAMPLE_STEP);
        result.put("depthRangeMeters", new JSONArray().put(MIN_DEPTH_MM / 1000.0).put(MAX_DEPTH_MM / 1000.0));
        result.put("minimumSemanticConfidence", MIN_SEMANTIC_CONFIDENCE / 255.0);
        result.put("stats", stats.toJson(eligible.size(), clusters.size()));
        result.put("bounds", bounds.toJson());
        result.put("semanticSamples", semanticCountsJson(semanticSampleCounts));

        JSONArray clusterArray = new JSONArray();
        int index = 1;
        for (ClusterData clusterData : clusters) clusterArray.put(clusterData.toJson(index++));
        result.put("clusters", clusterArray);
        result.put("voxelFile", voxelFile.getName());

        File resultFile = new File(sessionDir, "reconstruction.json");
        writeJson(resultFile, result);

        JSONObject summary = new JSONObject();
        summary.put("sessionId", result.getString("sourceSessionId"));
        summary.put("sourceSchemaVersion", sourceSchemaVersion);
        summary.put("coordinateFrame", result.getString("coordinateFrame"));
        summary.put("keyframesProcessed", stats.keyframesProcessed);
        summary.put("keyframesSkipped", stats.keyframesSkipped);
        summary.put("acceptedSamples", stats.acceptedSamples);
        summary.put("voxels", eligible.size());
        summary.put("clusters", clusters.size());
        summary.put("semanticSamples", result.getJSONObject("semanticSamples"));
        summary.put("reconstructionFile", resultFile.getAbsolutePath());
        summary.put("voxelFile", voxelFile.getAbsolutePath());
        return summary;
    }

    private static List<ClusterData> cluster(Map<VoxelKey, VoxelAccumulator> voxels) {
        List<ClusterData> result = new ArrayList<>();
        Set<VoxelKey> visited = new HashSet<>();
        int[][] neighbors = {{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{0,0,1},{0,0,-1}};

        for (VoxelKey start : voxels.keySet()) {
            if (visited.contains(start)) continue;
            ArrayDeque<VoxelKey> queue = new ArrayDeque<>();
            queue.add(start);
            visited.add(start);
            ClusterData cluster = new ClusterData(start.label);

            while (!queue.isEmpty()) {
                VoxelKey key = queue.removeFirst();
                VoxelAccumulator accumulator = voxels.get(key);
                cluster.add(key, accumulator);
                for (int[] offset : neighbors) {
                    VoxelKey next = new VoxelKey(key.label, key.x + offset[0], key.y + offset[1], key.z + offset[2]);
                    if (voxels.containsKey(next) && visited.add(next)) queue.addLast(next);
                }
            }
            if (cluster.sampleCount >= MIN_CLUSTER_SAMPLES) result.add(cluster);
        }
        return result;
    }

    private static JSONObject semanticCountsJson(Map<Integer, Long> counts) throws Exception {
        JSONObject result = new JSONObject();
        List<Map.Entry<Integer, Long>> entries = new ArrayList<>(counts.entrySet());
        entries.sort((left, right) -> Long.compare(right.getValue(), left.getValue()));
        for (Map.Entry<Integer, Long> entry : entries) result.put(labelName(entry.getKey()), entry.getValue());
        return result;
    }

    private static void writeVoxels(File file, Map<VoxelKey, VoxelAccumulator> voxels) throws Exception {
        List<Map.Entry<VoxelKey, VoxelAccumulator>> entries = new ArrayList<>(voxels.entrySet());
        entries.sort(Comparator.comparingInt((Map.Entry<VoxelKey, VoxelAccumulator> entry) -> entry.getKey().label)
            .thenComparingInt(entry -> entry.getKey().x)
            .thenComparingInt(entry -> entry.getKey().y)
            .thenComparingInt(entry -> entry.getKey().z));
        try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8))) {
            for (Map.Entry<VoxelKey, VoxelAccumulator> entry : entries) {
                VoxelKey key = entry.getKey();
                VoxelAccumulator value = entry.getValue();
                JSONObject voxel = new JSONObject();
                voxel.put("label", labelName(key.label));
                voxel.put("center", new JSONArray()
                    .put((key.x + 0.5) * VOXEL_SIZE_METERS)
                    .put((key.y + 0.5) * VOXEL_SIZE_METERS)
                    .put((key.z + 0.5) * VOXEL_SIZE_METERS));
                voxel.put("samples", value.count);
                voxel.put("confidence", value.confidenceSum / value.count);
                voxel.put("keyframes", value.keyframes.size());
                writer.write(voxel.toString());
                writer.newLine();
            }
        }
    }

    private static double[] mapDepthToImage(int x, int y, int depthWidth, int depthHeight, int imageWidth, int imageHeight) {
        double depthAspect = depthWidth / (double) depthHeight;
        double imageAspect = imageWidth / (double) imageHeight;
        double cropX = 0;
        double cropY = 0;
        double cropWidth;
        double cropHeight;
        if (imageAspect > depthAspect) {
            cropHeight = imageHeight;
            cropWidth = imageHeight * depthAspect;
            cropX = (imageWidth - cropWidth) / 2.0;
        } else {
            cropWidth = imageWidth;
            cropHeight = imageWidth / depthAspect;
            cropY = (imageHeight - cropHeight) / 2.0;
        }
        return new double[] {
            cropX + ((x + 0.5) / depthWidth) * cropWidth,
            cropY + ((y + 0.5) / depthHeight) * cropHeight
        };
    }

    private static double[] array2(JSONArray value) throws Exception {
        return new double[] { value.getDouble(0), value.getDouble(1) };
    }

    private static JSONObject readJson(File file) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line).append('\n');
        }
        return new JSONObject(builder.toString());
    }

    private static byte[] readBytes(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
            return output.toByteArray();
        }
    }

    private static void writeJson(File file, JSONObject value) throws Exception {
        try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            writer.write(value.toString(2));
        }
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static boolean finite(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value);
    }

    private static String labelName(int label) {
        return label >= 0 && label < LABEL_NAMES.length ? LABEL_NAMES[label] : "UNKNOWN_" + label;
    }

    private static final class ReconstructionStats {
        long keyframesProcessed;
        long keyframesSkipped;
        long depthSamples;
        long acceptedSamples;
        long depthRejected;
        long semanticRejected;
        long confidenceRejected;

        JSONObject toJson(int voxelCount, int clusterCount) throws Exception {
            return new JSONObject()
                .put("keyframesProcessed", keyframesProcessed)
                .put("keyframesSkipped", keyframesSkipped)
                .put("depthSamples", depthSamples)
                .put("acceptedSamples", acceptedSamples)
                .put("depthRejected", depthRejected)
                .put("semanticRejected", semanticRejected)
                .put("confidenceRejected", confidenceRejected)
                .put("voxels", voxelCount)
                .put("clusters", clusterCount);
        }
    }

    private static final class Bounds {
        double minX = Double.POSITIVE_INFINITY;
        double minY = Double.POSITIVE_INFINITY;
        double minZ = Double.POSITIVE_INFINITY;
        double maxX = Double.NEGATIVE_INFINITY;
        double maxY = Double.NEGATIVE_INFINITY;
        double maxZ = Double.NEGATIVE_INFINITY;

        void include(double[] point) {
            minX = Math.min(minX, point[0]);
            minY = Math.min(minY, point[1]);
            minZ = Math.min(minZ, point[2]);
            maxX = Math.max(maxX, point[0]);
            maxY = Math.max(maxY, point[1]);
            maxZ = Math.max(maxZ, point[2]);
        }

        JSONObject toJson() throws Exception {
            if (!finite(minX)) return new JSONObject().put("available", false);
            return new JSONObject()
                .put("available", true)
                .put("min", new JSONArray().put(minX).put(minY).put(minZ))
                .put("max", new JSONArray().put(maxX).put(maxY).put(maxZ))
                .put("sizeMeters", new JSONArray().put(maxX - minX).put(maxY - minY).put(maxZ - minZ));
        }
    }

    private static final class VoxelKey {
        final int label;
        final int x;
        final int y;
        final int z;

        VoxelKey(int label, int x, int y, int z) {
            this.label = label;
            this.x = x;
            this.y = y;
            this.z = z;
        }

        @Override public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof VoxelKey)) return false;
            VoxelKey key = (VoxelKey) other;
            return label == key.label && x == key.x && y == key.y && z == key.z;
        }

        @Override public int hashCode() {
            int result = label;
            result = 31 * result + x;
            result = 31 * result + y;
            result = 31 * result + z;
            return result;
        }
    }

    private static final class VoxelAccumulator {
        long count;
        double sumX;
        double sumY;
        double sumZ;
        double confidenceSum;
        final LinkedHashSet<String> keyframes = new LinkedHashSet<>();

        void add(double[] point, double confidence, String keyframeId) {
            count++;
            sumX += point[0];
            sumY += point[1];
            sumZ += point[2];
            confidenceSum += confidence;
            if (keyframes.size() < 32) keyframes.add(keyframeId);
        }
    }

    private static final class ClusterData {
        final int label;
        long sampleCount;
        int voxelCount;
        double sumX;
        double sumY;
        double sumZ;
        double confidenceWeightedSum;
        double minX = Double.POSITIVE_INFINITY;
        double minY = Double.POSITIVE_INFINITY;
        double minZ = Double.POSITIVE_INFINITY;
        double maxX = Double.NEGATIVE_INFINITY;
        double maxY = Double.NEGATIVE_INFINITY;
        double maxZ = Double.NEGATIVE_INFINITY;
        final LinkedHashSet<String> keyframes = new LinkedHashSet<>();

        ClusterData(int label) { this.label = label; }

        void add(VoxelKey key, VoxelAccumulator value) {
            sampleCount += value.count;
            voxelCount++;
            sumX += value.sumX;
            sumY += value.sumY;
            sumZ += value.sumZ;
            confidenceWeightedSum += value.confidenceSum;
            double vx = key.x * VOXEL_SIZE_METERS;
            double vy = key.y * VOXEL_SIZE_METERS;
            double vz = key.z * VOXEL_SIZE_METERS;
            minX = Math.min(minX, vx);
            minY = Math.min(minY, vy);
            minZ = Math.min(minZ, vz);
            maxX = Math.max(maxX, vx + VOXEL_SIZE_METERS);
            maxY = Math.max(maxY, vy + VOXEL_SIZE_METERS);
            maxZ = Math.max(maxZ, vz + VOXEL_SIZE_METERS);
            if (keyframes.size() < 24) keyframes.addAll(value.keyframes);
            while (keyframes.size() > 24) {
                String last = null;
                for (String item : keyframes) last = item;
                if (last != null) keyframes.remove(last);
            }
        }

        JSONObject toJson(int index) throws Exception {
            JSONArray evidence = new JSONArray();
            for (String keyframe : keyframes) evidence.put(keyframe);
            return new JSONObject()
                .put("id", String.format(Locale.US, "c-%04d", index))
                .put("semanticLabel", labelName(label))
                .put("samples", sampleCount)
                .put("voxels", voxelCount)
                .put("confidence", sampleCount == 0 ? 0 : confidenceWeightedSum / sampleCount)
                .put("centroid", new JSONArray().put(sumX / sampleCount).put(sumY / sampleCount).put(sumZ / sampleCount))
                .put("bounds", new JSONObject()
                    .put("min", new JSONArray().put(minX).put(minY).put(minZ))
                    .put("max", new JSONArray().put(maxX).put(maxY).put(maxZ))
                    .put("sizeMeters", new JSONArray().put(maxX - minX).put(maxY - minY).put(maxZ - minZ)))
                .put("evidenceKeyframes", evidence);
        }
    }

    private static final class PoseData {
        final double tx;
        final double ty;
        final double tz;
        final double qx;
        final double qy;
        final double qz;
        final double qw;

        PoseData(double tx, double ty, double tz, double qx, double qy, double qz, double qw) {
            this.tx = tx;
            this.ty = ty;
            this.tz = tz;
            double norm = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
            if (norm == 0) norm = 1;
            this.qx = qx / norm;
            this.qy = qy / norm;
            this.qz = qz / norm;
            this.qw = qw / norm;
        }

        static PoseData fromJson(JSONObject value) throws Exception {
            JSONArray translation = value.getJSONArray("translation");
            JSONArray rotation = value.getJSONArray("rotationQuaternion");
            return new PoseData(
                translation.getDouble(0), translation.getDouble(1), translation.getDouble(2),
                rotation.getDouble(0), rotation.getDouble(1), rotation.getDouble(2), rotation.getDouble(3));
        }

        double[] transform(double x, double y, double z) {
            // Quaternion-vector rotation, then translation. Hamilton quaternion order is x,y,z,w.
            double tx2 = 2.0 * (qy * z - qz * y);
            double ty2 = 2.0 * (qz * x - qx * z);
            double tz2 = 2.0 * (qx * y - qy * x);
            double rx = x + qw * tx2 + (qy * tz2 - qz * ty2);
            double ry = y + qw * ty2 + (qz * tx2 - qx * tz2);
            double rz = z + qw * tz2 + (qx * ty2 - qy * tx2);
            return new double[] { tx + rx, ty + ry, tz + rz };
        }
    }
}
