package dev.srgoodjob.haveguide.scan;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class GardenScanUnderstanding {
    private static final int DEFAULT_CROP_SIZE = 300;
    private static final int MAX_CROP_SIZE = 420;
    private static final int JPEG_QUALITY = 82;
    private static final double MIN_VISION_CONFIDENCE = 0.50;

    private GardenScanUnderstanding() {}

    static JSONObject prepareVisionCandidates(Context context, File sessionDir, int requestedLimit) throws Exception {
        File reconstructionFile = new File(sessionDir, "reconstruction.json");
        if (!reconstructionFile.isFile()) throw new IllegalArgumentException("Kør spatial rekonstruktion først.");
        JSONObject reconstruction = readJson(reconstructionFile);
        JSONArray clusters = reconstruction.getJSONArray("clusters");
        int limit = Math.max(1, Math.min(20, requestedLimit));

        List<JSONObject> selected = selectClusters(clusters, limit);
        JSONArray candidates = new JSONArray();
        boolean portrait = context.getResources().getConfiguration().orientation == Configuration.ORIENTATION_PORTRAIT;
        for (JSONObject cluster : selected) {
            JSONObject candidate = buildVisionCandidate(sessionDir, cluster, portrait);
            if (candidate != null) candidates.put(candidate);
        }

        return new JSONObject()
            .put("sessionId", reconstruction.optString("sourceSessionId", sessionDir.getName()))
            .put("coordinateFrame", reconstruction.optString("coordinateFrame", "unknown"))
            .put("candidateCount", candidates.length())
            .put("bounds", reconstruction.optJSONObject("bounds"))
            .put("candidates", candidates);
    }

    static JSONObject applyVisionClassifications(File sessionDir, JSONArray classifications) throws Exception {
        File reconstructionFile = new File(sessionDir, "reconstruction.json");
        if (!reconstructionFile.isFile()) throw new IllegalArgumentException("Kør spatial rekonstruktion først.");
        JSONObject reconstruction = readJson(reconstructionFile);
        JSONArray clusters = reconstruction.getJSONArray("clusters");

        Map<String, JSONObject> classificationByCluster = new HashMap<>();
        for (int index = 0; index < classifications.length(); index++) {
            JSONObject classification = classifications.optJSONObject(index);
            if (classification == null) continue;
            String clusterId = classification.optString("clusterId", "");
            if (!clusterId.isEmpty()) classificationByCluster.put(clusterId, classification);
        }

        List<DraftFeature> features = new ArrayList<>();
        int visionClassified = 0;
        for (int index = 0; index < clusters.length(); index++) {
            JSONObject cluster = clusters.getJSONObject(index);
            String clusterId = cluster.getString("id");
            JSONObject classification = classificationByCluster.get(clusterId);
            DraftFeature feature = DraftFeature.fromCluster(cluster, classification);
            if (feature.visionClassified) visionClassified++;
            features.add(feature);
        }

        List<DraftFeature> fused = fuse(features);
        fused.sort((left, right) -> Long.compare(right.samples, left.samples));
        JSONArray featureArray = new JSONArray();
        Map<String, Integer> typeCounts = new HashMap<>();
        int reviewRequired = 0;
        int counter = 1;
        for (DraftFeature feature : fused) {
            feature.id = String.format(Locale.US, "df-%04d", counter++);
            featureArray.put(feature.toJson());
            typeCounts.put(feature.type, typeCounts.getOrDefault(feature.type, 0) + 1);
            if (feature.reviewRequired) reviewRequired++;
        }

        JSONObject output = new JSONObject()
            .put("schemaVersion", 1)
            .put("sourceSessionId", reconstruction.optString("sourceSessionId", sessionDir.getName()))
            .put("coordinateFrame", reconstruction.optString("coordinateFrame", "unknown"))
            .put("generatedAtMs", System.currentTimeMillis())
            .put("sourceClusters", clusters.length())
            .put("visionClassifiedClusters", visionClassified)
            .put("features", featureArray)
            .put("bounds", reconstruction.optJSONObject("bounds"))
            .put("typeCounts", mapToJson(typeCounts));
        File outputFile = new File(sessionDir, "draft-features.json");
        writeJson(outputFile, output);

        return new JSONObject()
            .put("sessionId", output.getString("sourceSessionId"))
            .put("sourceClusters", clusters.length())
            .put("visionClassifiedClusters", visionClassified)
            .put("features", featureArray.length())
            .put("reviewRequired", reviewRequired)
            .put("typeCounts", output.getJSONObject("typeCounts"))
            .put("bounds", output.optJSONObject("bounds"))
            .put("draftFeatures", featureArray)
            .put("draftFile", outputFile.getAbsolutePath());
    }

    private static List<JSONObject> selectClusters(JSONArray clusters, int limit) throws Exception {
        List<JSONObject> all = new ArrayList<>();
        for (int index = 0; index < clusters.length(); index++) all.add(clusters.getJSONObject(index));
        all.sort((left, right) -> Long.compare(right.optLong("samples"), left.optLong("samples")));

        Map<String, Integer> quotas = new HashMap<>();
        quotas.put("TREE", 7);
        quotas.put("OBJECT", 4);
        quotas.put("STRUCTURE", 4);
        quotas.put("BUILDING", 3);
        quotas.put("TERRAIN", 3);
        quotas.put("SIDEWALK", 3);
        quotas.put("ROAD", 2);
        quotas.put("WATER", 2);

        Map<String, Integer> used = new HashMap<>();
        List<JSONObject> result = new ArrayList<>();
        Set<String> selectedIds = new HashSet<>();
        for (JSONObject cluster : all) {
            if (result.size() >= limit) break;
            String label = cluster.optString("semanticLabel", "UNLABELED");
            int quota = quotas.getOrDefault(label, 1);
            if (used.getOrDefault(label, 0) >= quota) continue;
            if (cluster.optLong("samples") < 25) continue;
            result.add(cluster);
            selectedIds.add(cluster.getString("id"));
            used.put(label, used.getOrDefault(label, 0) + 1);
        }
        for (JSONObject cluster : all) {
            if (result.size() >= limit) break;
            if (cluster.optLong("samples") < 25 || selectedIds.contains(cluster.getString("id"))) continue;
            result.add(cluster);
            selectedIds.add(cluster.getString("id"));
        }
        return result;
    }

    private static JSONObject buildVisionCandidate(File sessionDir, JSONObject cluster, boolean portrait) throws Exception {
        File keyframeDir = new File(sessionDir, "keyframes");
        JSONArray evidence = cluster.optJSONArray("evidenceKeyframes");
        if (evidence == null || evidence.length() == 0) return null;
        double[] centroid = array3(cluster.getJSONArray("centroid"));

        CandidateView best = null;
        for (int index = 0; index < evidence.length(); index++) {
            String keyframeId = evidence.optString(index, "");
            if (keyframeId.isEmpty()) continue;
            File metadataFile = new File(keyframeDir, keyframeId + ".json");
            if (!metadataFile.isFile()) continue;
            JSONObject metadata = readJson(metadataFile);
            Projection projection = project(centroid, metadata);
            if (projection == null || !projection.inside()) continue;
            double centerX = projection.imageWidth / 2.0;
            double centerY = projection.imageHeight / 2.0;
            double centerPenalty = Math.pow((projection.x - centerX) / centerX, 2) + Math.pow((projection.y - centerY) / centerY, 2);
            double distancePenalty = Math.abs(projection.distance - 3.0) / 5.0;
            double score = centerPenalty + 0.18 * distancePenalty;
            if (best == null || score < best.score) best = new CandidateView(keyframeId, metadata, projection, score);
        }

        if (best == null) {
            String keyframeId = evidence.optString(0, "");
            File metadataFile = new File(keyframeDir, keyframeId + ".json");
            if (!metadataFile.isFile()) return null;
            JSONObject metadata = readJson(metadataFile);
            JSONObject intrinsics = metadata.getJSONObject("intrinsics");
            JSONArray dimensions = intrinsics.getJSONArray("imageDimensions");
            best = new CandidateView(keyframeId, metadata,
                new Projection(dimensions.getDouble(0) / 2.0, dimensions.getDouble(1) / 2.0, 3.0, dimensions.getInt(0), dimensions.getInt(1)), 999);
        }

        String rgbName = best.metadata.optString("rgb", best.keyframeId + ".jpg");
        File imageFile = new File(keyframeDir, rgbName);
        if (!imageFile.isFile()) return null;
        Bitmap source = BitmapFactory.decodeFile(imageFile.getAbsolutePath());
        if (source == null) return null;

        int cropSize = Math.min(MAX_CROP_SIZE, Math.min(source.getWidth(), source.getHeight()));
        cropSize = Math.max(Math.min(DEFAULT_CROP_SIZE, cropSize), Math.min(180, cropSize));
        double scaleX = source.getWidth() / (double) best.projection.imageWidth;
        double scaleY = source.getHeight() / (double) best.projection.imageHeight;
        int centerX = (int) Math.round(best.projection.x * scaleX);
        int centerY = (int) Math.round(best.projection.y * scaleY);
        int left = clamp(centerX - cropSize / 2, 0, Math.max(0, source.getWidth() - cropSize));
        int top = clamp(centerY - cropSize / 2, 0, Math.max(0, source.getHeight() - cropSize));
        Bitmap crop = Bitmap.createBitmap(source, left, top, cropSize, cropSize);
        source.recycle();

        Bitmap oriented = crop;
        if (portrait) {
            android.graphics.Matrix matrix = new android.graphics.Matrix();
            matrix.postRotate(90f);
            oriented = Bitmap.createBitmap(crop, 0, 0, crop.getWidth(), crop.getHeight(), matrix, true);
            if (oriented != crop) crop.recycle();
        }

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        oriented.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, bytes);
        oriented.recycle();
        String encoded = Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);

        return new JSONObject()
            .put("clusterId", cluster.getString("id"))
            .put("semanticLabel", cluster.optString("semanticLabel", "UNLABELED"))
            .put("preliminaryType", preliminaryType(cluster.optString("semanticLabel", "UNLABELED")))
            .put("samples", cluster.optLong("samples"))
            .put("spatialConfidence", cluster.optDouble("confidence", 0))
            .put("centroid", cluster.getJSONArray("centroid"))
            .put("bounds", cluster.getJSONObject("bounds"))
            .put("keyframeId", best.keyframeId)
            .put("imageBase64", encoded)
            .put("mimeType", "image/jpeg");
    }

    private static Projection project(double[] world, JSONObject metadata) throws Exception {
        JSONObject poseJson = metadata.optJSONObject("scanPose");
        if (poseJson == null) poseJson = metadata.getJSONObject("pose");
        Pose pose = Pose.fromJson(poseJson);
        double[] local = pose.inverseTransform(world);
        double distance = -local[2];
        if (distance <= 0.15) return null;
        JSONObject intrinsics = metadata.getJSONObject("intrinsics");
        JSONArray focal = intrinsics.getJSONArray("focalLength");
        JSONArray principal = intrinsics.getJSONArray("principalPoint");
        JSONArray dimensions = intrinsics.getJSONArray("imageDimensions");
        double x = focal.getDouble(0) * (local[0] / distance) + principal.getDouble(0);
        double y = principal.getDouble(1) - focal.getDouble(1) * (local[1] / distance);
        return new Projection(x, y, distance, dimensions.getInt(0), dimensions.getInt(1));
    }

    private static List<DraftFeature> fuse(List<DraftFeature> input) {
        List<DraftFeature> result = new ArrayList<>();
        boolean[] consumed = new boolean[input.size()];
        for (int index = 0; index < input.size(); index++) {
            if (consumed[index]) continue;
            DraftFeature merged = input.get(index).copy();
            consumed[index] = true;
            boolean changed;
            do {
                changed = false;
                for (int other = 0; other < input.size(); other++) {
                    if (consumed[other]) continue;
                    DraftFeature candidate = input.get(other);
                    if (!merged.type.equals(candidate.type)) continue;
                    if (horizontalGap(merged, candidate) > mergeDistance(merged.type)) continue;
                    merged.merge(candidate);
                    consumed[other] = true;
                    changed = true;
                }
            } while (changed);
            result.add(merged);
        }
        return result;
    }

    private static double horizontalGap(DraftFeature left, DraftFeature right) {
        double gapX = Math.max(0, Math.max(left.minX - right.maxX, right.minX - left.maxX));
        double gapZ = Math.max(0, Math.max(left.minZ - right.maxZ, right.minZ - left.maxZ));
        return Math.sqrt(gapX * gapX + gapZ * gapZ);
    }

    private static double mergeDistance(String type) {
        switch (type) {
            case "hedge": return 1.25;
            case "fence": return 1.35;
            case "path":
            case "patio":
            case "lawn":
            case "bed":
            case "terrain": return 1.0;
            case "building": return 0.9;
            case "tree":
            case "bush": return 0.45;
            case "play_equipment":
            case "object": return 0.35;
            default: return 0.55;
        }
    }

    private static String preliminaryType(String semanticLabel) {
        switch (semanticLabel.toUpperCase(Locale.ROOT)) {
            case "TREE": return "vegetation";
            case "TERRAIN": return "terrain";
            case "BUILDING": return "building";
            case "STRUCTURE": return "structure";
            case "ROAD":
            case "SIDEWALK": return "path";
            case "WATER": return "water";
            case "OBJECT": return "object";
            default: return "unknown";
        }
    }

    private static JSONObject mapToJson(Map<String, Integer> values) throws Exception {
        JSONObject result = new JSONObject();
        List<Map.Entry<String, Integer>> entries = new ArrayList<>(values.entrySet());
        entries.sort((left, right) -> Integer.compare(right.getValue(), left.getValue()));
        for (Map.Entry<String, Integer> entry : entries) result.put(entry.getKey(), entry.getValue());
        return result;
    }

    private static double[] array3(JSONArray array) throws Exception {
        return new double[] { array.getDouble(0), array.getDouble(1), array.getDouble(2) };
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static JSONObject readJson(File file) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line).append('\n');
        }
        return new JSONObject(builder.toString());
    }

    private static void writeJson(File file, JSONObject value) throws Exception {
        try (OutputStreamWriter writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            writer.write(value.toString(2));
        }
    }

    private static final class Projection {
        final double x;
        final double y;
        final double distance;
        final int imageWidth;
        final int imageHeight;
        Projection(double x, double y, double distance, int imageWidth, int imageHeight) {
            this.x = x; this.y = y; this.distance = distance; this.imageWidth = imageWidth; this.imageHeight = imageHeight;
        }
        boolean inside() { return x >= 0 && y >= 0 && x < imageWidth && y < imageHeight; }
    }

    private static final class CandidateView {
        final String keyframeId;
        final JSONObject metadata;
        final Projection projection;
        final double score;
        CandidateView(String keyframeId, JSONObject metadata, Projection projection, double score) {
            this.keyframeId = keyframeId; this.metadata = metadata; this.projection = projection; this.score = score;
        }
    }

    private static final class Pose {
        final double tx, ty, tz, qx, qy, qz, qw;
        Pose(double tx, double ty, double tz, double qx, double qy, double qz, double qw) {
            this.tx = tx; this.ty = ty; this.tz = tz;
            double norm = Math.sqrt(qx*qx + qy*qy + qz*qz + qw*qw);
            if (norm == 0) norm = 1;
            this.qx = qx/norm; this.qy = qy/norm; this.qz = qz/norm; this.qw = qw/norm;
        }
        static Pose fromJson(JSONObject value) throws Exception {
            JSONArray t = value.getJSONArray("translation");
            JSONArray q = value.getJSONArray("rotationQuaternion");
            return new Pose(t.getDouble(0), t.getDouble(1), t.getDouble(2), q.getDouble(0), q.getDouble(1), q.getDouble(2), q.getDouble(3));
        }
        double[] inverseTransform(double[] world) {
            double x = world[0] - tx, y = world[1] - ty, z = world[2] - tz;
            double ix = -qx, iy = -qy, iz = -qz, iw = qw;
            double tx2 = 2.0 * (iy * z - iz * y);
            double ty2 = 2.0 * (iz * x - ix * z);
            double tz2 = 2.0 * (ix * y - iy * x);
            return new double[] {
                x + iw * tx2 + (iy * tz2 - iz * ty2),
                y + iw * ty2 + (iz * tx2 - ix * tz2),
                z + iw * tz2 + (ix * ty2 - iy * tx2)
            };
        }
    }

    private static final class DraftFeature {
        String id;
        String type;
        double confidence;
        boolean visionClassified;
        boolean reviewRequired;
        long samples;
        int voxels;
        double weightedX, weightedY, weightedZ;
        double minX, minY, minZ, maxX, maxY, maxZ;
        final LinkedHashSet<String> sourceClusters = new LinkedHashSet<>();
        final LinkedHashSet<String> semanticLabels = new LinkedHashSet<>();
        final LinkedHashSet<String> evidenceKeyframes = new LinkedHashSet<>();
        final List<String> descriptions = new ArrayList<>();

        static DraftFeature fromCluster(JSONObject cluster, JSONObject classification) throws Exception {
            DraftFeature feature = new DraftFeature();
            String semantic = cluster.optString("semanticLabel", "UNLABELED");
            String fallback = preliminaryType(semantic);
            double spatialConfidence = cluster.optDouble("confidence", 0.5);
            double visionConfidence = classification == null ? 0 : classification.optDouble("confidence", 0);
            String visionType = classification == null ? "" : classification.optString("type", "");
            feature.visionClassified = classification != null && visionConfidence >= MIN_VISION_CONFIDENCE && !visionType.isEmpty();
            feature.type = feature.visionClassified ? visionType : fallback;
            feature.confidence = feature.visionClassified ? Math.min(0.99, spatialConfidence * 0.55 + visionConfidence * 0.45) : spatialConfidence * 0.62;
            feature.samples = cluster.optLong("samples");
            feature.voxels = cluster.optInt("voxels");
            JSONArray centroid = cluster.getJSONArray("centroid");
            feature.weightedX = centroid.getDouble(0) * feature.samples;
            feature.weightedY = centroid.getDouble(1) * feature.samples;
            feature.weightedZ = centroid.getDouble(2) * feature.samples;
            JSONObject bounds = cluster.getJSONObject("bounds");
            JSONArray min = bounds.getJSONArray("min");
            JSONArray max = bounds.getJSONArray("max");
            feature.minX = min.getDouble(0); feature.minY = min.getDouble(1); feature.minZ = min.getDouble(2);
            feature.maxX = max.getDouble(0); feature.maxY = max.getDouble(1); feature.maxZ = max.getDouble(2);
            feature.sourceClusters.add(cluster.getString("id"));
            feature.semanticLabels.add(semantic);
            JSONArray evidence = cluster.optJSONArray("evidenceKeyframes");
            if (evidence != null) for (int index = 0; index < evidence.length() && feature.evidenceKeyframes.size() < 24; index++) feature.evidenceKeyframes.add(evidence.optString(index));
            if (classification != null) {
                String description = classification.optString("description", "").trim();
                if (!description.isEmpty()) feature.descriptions.add(description);
            }
            feature.updateReviewFlag();
            return feature;
        }

        DraftFeature copy() {
            DraftFeature result = new DraftFeature();
            result.id = id; result.type = type; result.confidence = confidence; result.visionClassified = visionClassified;
            result.reviewRequired = reviewRequired; result.samples = samples; result.voxels = voxels;
            result.weightedX = weightedX; result.weightedY = weightedY; result.weightedZ = weightedZ;
            result.minX = minX; result.minY = minY; result.minZ = minZ; result.maxX = maxX; result.maxY = maxY; result.maxZ = maxZ;
            result.sourceClusters.addAll(sourceClusters); result.semanticLabels.addAll(semanticLabels); result.evidenceKeyframes.addAll(evidenceKeyframes); result.descriptions.addAll(descriptions);
            return result;
        }

        void merge(DraftFeature other) {
            long combinedSamples = samples + other.samples;
            confidence = combinedSamples == 0 ? Math.max(confidence, other.confidence) : (confidence * samples + other.confidence * other.samples) / combinedSamples;
            samples = combinedSamples;
            voxels += other.voxels;
            weightedX += other.weightedX; weightedY += other.weightedY; weightedZ += other.weightedZ;
            minX = Math.min(minX, other.minX); minY = Math.min(minY, other.minY); minZ = Math.min(minZ, other.minZ);
            maxX = Math.max(maxX, other.maxX); maxY = Math.max(maxY, other.maxY); maxZ = Math.max(maxZ, other.maxZ);
            visionClassified = visionClassified || other.visionClassified;
            sourceClusters.addAll(other.sourceClusters); semanticLabels.addAll(other.semanticLabels);
            for (String keyframe : other.evidenceKeyframes) if (evidenceKeyframes.size() < 24) evidenceKeyframes.add(keyframe);
            for (String description : other.descriptions) if (descriptions.size() < 4) descriptions.add(description);
            updateReviewFlag();
        }

        void updateReviewFlag() {
            double horizontalSpan = Math.max(maxX - minX, maxZ - minZ);
            reviewRequired = !visionClassified || type.equals("vegetation") || type.equals("structure") || type.equals("object") || type.equals("unknown") || horizontalSpan > 7.0;
        }

        JSONObject toJson() throws Exception {
            JSONArray clusterIds = new JSONArray(); for (String value : sourceClusters) clusterIds.put(value);
            JSONArray semantics = new JSONArray(); for (String value : semanticLabels) semantics.put(value);
            JSONArray evidence = new JSONArray(); for (String value : evidenceKeyframes) evidence.put(value);
            JSONArray visionEvidence = new JSONArray(); for (String value : descriptions) visionEvidence.put(value);
            double denominator = Math.max(1, samples);
            return new JSONObject()
                .put("id", id)
                .put("type", type)
                .put("confidence", confidence)
                .put("reviewRequired", reviewRequired)
                .put("visionClassified", visionClassified)
                .put("samples", samples)
                .put("voxels", voxels)
                .put("centroid", new JSONArray().put(weightedX / denominator).put(weightedY / denominator).put(weightedZ / denominator))
                .put("bounds", new JSONObject()
                    .put("min", new JSONArray().put(minX).put(minY).put(minZ))
                    .put("max", new JSONArray().put(maxX).put(maxY).put(maxZ))
                    .put("sizeMeters", new JSONArray().put(maxX-minX).put(maxY-minY).put(maxZ-minZ)))
                .put("sourceClusterIds", clusterIds)
                .put("semanticLabels", semantics)
                .put("evidenceKeyframes", evidence)
                .put("visionEvidence", visionEvidence);
        }
    }
}
