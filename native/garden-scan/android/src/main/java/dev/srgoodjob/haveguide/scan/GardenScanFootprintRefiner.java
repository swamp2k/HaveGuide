package dev.srgoodjob.haveguide.scan;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
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

final class GardenScanFootprintRefiner {
    private static final double DEFAULT_VOXEL_SIZE_METERS = 0.35;
    private static final double CLUSTER_MARGIN_METERS = 0.20;
    private static final double DUPLICATE_OVERLAP_RATIO = 0.58;

    private GardenScanFootprintRefiner() {}

    static JSONObject refine(File sessionDir) throws Exception {
        File reconstructionFile = new File(sessionDir, "reconstruction.json");
        File draftFile = new File(sessionDir, "draft-features.json");
        if (!reconstructionFile.isFile()) throw new IllegalArgumentException("Kør spatial rekonstruktion først.");
        if (!draftFile.isFile()) throw new IllegalArgumentException("Kør feature-fusion først.");

        JSONObject reconstruction = readJson(reconstructionFile);
        JSONObject draft = readJson(draftFile);
        double voxelSize = reconstruction.optDouble("voxelSizeMeters", DEFAULT_VOXEL_SIZE_METERS);

        Map<String, ClusterInfo> clustersById = new HashMap<>();
        Map<String, List<ClusterInfo>> clustersByLabel = new HashMap<>();
        JSONArray clusters = reconstruction.getJSONArray("clusters");
        for (int index = 0; index < clusters.length(); index++) {
            ClusterInfo cluster = ClusterInfo.fromJson(clusters.getJSONObject(index));
            clustersById.put(cluster.id, cluster);
            clustersByLabel.computeIfAbsent(cluster.semanticLabel, ignored -> new ArrayList<>()).add(cluster);
        }

        String voxelName = reconstruction.optString("voxelFile", "reconstruction-voxels.jsonl");
        File voxelFile = new File(sessionDir, voxelName);
        if (voxelFile.isFile()) assignVoxels(voxelFile, clustersByLabel, voxelSize);

        JSONArray sourceFeatures = draft.getJSONArray("features");
        List<RefinedFeature> refined = new ArrayList<>();
        for (int index = 0; index < sourceFeatures.length(); index++) {
            JSONObject source = sourceFeatures.getJSONObject(index);
            refined.add(RefinedFeature.fromJson(source, clustersById));
        }

        int suppressed = suppressGenericDuplicates(refined);
        refined.removeIf(feature -> feature.suppressed);
        refined.sort(Comparator
            .comparingInt((RefinedFeature feature) -> layerPriority(feature.layer))
            .thenComparing((left, right) -> Long.compare(right.samples, left.samples)));

        JSONArray featureArray = new JSONArray();
        Map<String, Integer> typeCounts = new HashMap<>();
        int reviewRequired = 0;
        int withFootprint = 0;
        int counter = 1;
        for (RefinedFeature feature : refined) {
            feature.id = String.format(Locale.US, "rf-%04d", counter++);
            JSONObject json = feature.toJson();
            featureArray.put(json);
            typeCounts.put(feature.type, typeCounts.getOrDefault(feature.type, 0) + 1);
            if (feature.reviewRequired) reviewRequired++;
            if (feature.footprint.size() >= 3) withFootprint++;
        }

        JSONObject output = new JSONObject()
            .put("schemaVersion", 2)
            .put("sourceSessionId", draft.optString("sourceSessionId", sessionDir.getName()))
            .put("coordinateFrame", draft.optString("coordinateFrame", reconstruction.optString("coordinateFrame", "unknown")))
            .put("generatedAtMs", System.currentTimeMillis())
            .put("sourceClusters", draft.optInt("sourceClusters", clusters.length()))
            .put("visionClassifiedClusters", draft.optInt("visionClassifiedClusters", 0))
            .put("features", featureArray)
            .put("bounds", draft.optJSONObject("bounds"))
            .put("typeCounts", mapToJson(typeCounts))
            .put("suppressedGenericDuplicates", suppressed)
            .put("featuresWithVoxelFootprints", withFootprint);

        File outputFile = new File(sessionDir, "refined-features.json");
        writeJson(outputFile, output);

        return new JSONObject()
            .put("sessionId", output.getString("sourceSessionId"))
            .put("sourceClusters", output.getInt("sourceClusters"))
            .put("visionClassifiedClusters", output.getInt("visionClassifiedClusters"))
            .put("features", featureArray.length())
            .put("reviewRequired", reviewRequired)
            .put("typeCounts", output.getJSONObject("typeCounts"))
            .put("bounds", output.optJSONObject("bounds"))
            .put("draftFeatures", featureArray)
            .put("draftFile", outputFile.getAbsolutePath())
            .put("suppressedGenericDuplicates", suppressed)
            .put("featuresWithVoxelFootprints", withFootprint);
    }

    private static void assignVoxels(File voxelFile, Map<String, List<ClusterInfo>> clustersByLabel, double voxelSize) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(voxelFile), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                JSONObject voxel = new JSONObject(line);
                String label = voxel.optString("label", "");
                List<ClusterInfo> candidates = clustersByLabel.get(label);
                if (candidates == null || candidates.isEmpty()) continue;
                JSONArray center = voxel.optJSONArray("center");
                if (center == null || center.length() < 3) continue;
                double x = center.getDouble(0);
                double y = center.getDouble(1);
                double z = center.getDouble(2);

                ClusterInfo best = null;
                double bestDistance = Double.POSITIVE_INFINITY;
                for (ClusterInfo candidate : candidates) {
                    if (!candidate.contains(x, y, z, CLUSTER_MARGIN_METERS + voxelSize * 0.55)) continue;
                    double distance = candidate.distanceSquared(x, y, z);
                    if (distance < bestDistance) {
                        best = candidate;
                        bestDistance = distance;
                    }
                }
                if (best == null) continue;
                best.addVoxelCell(x, z, voxelSize);
            }
        }
    }

    private static int suppressGenericDuplicates(List<RefinedFeature> features) {
        int suppressed = 0;
        for (RefinedFeature generic : features) {
            if (!isSuppressibleGeneric(generic.type)) continue;
            for (RefinedFeature specific : features) {
                if (generic == specific || specific.suppressed) continue;
                if (!isSpecificFor(generic.type, specific.type)) continue;
                double overlap = overlapRatioOfGeneric(generic, specific);
                if (overlap < DUPLICATE_OVERLAP_RATIO) continue;
                if (specific.confidence + 0.05 < generic.confidence && !specific.visionClassified) continue;
                generic.suppressed = true;
                suppressed++;
                break;
            }
        }
        return suppressed;
    }

    private static boolean isSuppressibleGeneric(String type) {
        return type.equals("vegetation") || type.equals("structure") || type.equals("object") || type.equals("unknown");
    }

    private static boolean isSpecificFor(String generic, String specific) {
        switch (generic) {
            case "vegetation":
                return specific.equals("tree") || specific.equals("bush") || specific.equals("hedge") || specific.equals("bed") || specific.equals("lawn");
            case "structure":
                return specific.equals("building") || specific.equals("fence") || specific.equals("path") || specific.equals("patio") || specific.equals("play_equipment");
            case "object":
                return specific.equals("play_equipment") || specific.equals("fence");
            case "unknown":
                return !specific.equals("unknown") && !specific.equals("terrain");
            default:
                return false;
        }
    }

    private static double overlapRatioOfGeneric(RefinedFeature generic, RefinedFeature specific) {
        double intersectionX = Math.max(0, Math.min(generic.maxX, specific.maxX) - Math.max(generic.minX, specific.minX));
        double intersectionZ = Math.max(0, Math.min(generic.maxZ, specific.maxZ) - Math.max(generic.minZ, specific.minZ));
        double intersection = intersectionX * intersectionZ;
        double genericArea = Math.max(0.01, (generic.maxX - generic.minX) * (generic.maxZ - generic.minZ));
        return intersection / genericArea;
    }

    private static int layerPriority(String layer) {
        switch (layer) {
            case "surface": return 0;
            case "vegetation": return 1;
            case "structure": return 2;
            default: return 3;
        }
    }

    private static String layerForType(String type) {
        switch (type) {
            case "terrain":
            case "lawn":
            case "bed":
            case "path":
            case "patio":
            case "water":
                return "surface";
            case "tree":
            case "bush":
            case "hedge":
            case "vegetation":
                return "vegetation";
            case "building":
            case "fence":
            case "structure":
                return "structure";
            default:
                return "object";
        }
    }

    private static JSONObject mapToJson(Map<String, Integer> values) throws Exception {
        JSONObject result = new JSONObject();
        List<Map.Entry<String, Integer>> entries = new ArrayList<>(values.entrySet());
        entries.sort((left, right) -> Integer.compare(right.getValue(), left.getValue()));
        for (Map.Entry<String, Integer> entry : entries) result.put(entry.getKey(), entry.getValue());
        return result;
    }

    private static List<Point2> convexHull(List<Point2> values) {
        Set<Point2> unique = new HashSet<>(values);
        List<Point2> points = new ArrayList<>(unique);
        points.sort(Comparator.comparingDouble((Point2 point) -> point.x).thenComparingDouble(point -> point.z));
        if (points.size() <= 2) return points;

        List<Point2> lower = new ArrayList<>();
        for (Point2 point : points) {
            while (lower.size() >= 2 && cross(lower.get(lower.size() - 2), lower.get(lower.size() - 1), point) <= 0) {
                lower.remove(lower.size() - 1);
            }
            lower.add(point);
        }

        List<Point2> upper = new ArrayList<>();
        for (int index = points.size() - 1; index >= 0; index--) {
            Point2 point = points.get(index);
            while (upper.size() >= 2 && cross(upper.get(upper.size() - 2), upper.get(upper.size() - 1), point) <= 0) {
                upper.remove(upper.size() - 1);
            }
            upper.add(point);
        }

        lower.remove(lower.size() - 1);
        upper.remove(upper.size() - 1);
        lower.addAll(upper);
        return lower;
    }

    private static double cross(Point2 origin, Point2 left, Point2 right) {
        return (left.x - origin.x) * (right.z - origin.z) - (left.z - origin.z) * (right.x - origin.x);
    }

    private static double polygonArea(List<Point2> points) {
        if (points.size() < 3) return 0;
        double twiceArea = 0;
        for (int index = 0; index < points.size(); index++) {
            Point2 current = points.get(index);
            Point2 next = points.get((index + 1) % points.size());
            twiceArea += current.x * next.z - next.x * current.z;
        }
        return Math.abs(twiceArea) * 0.5;
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

    private static final class ClusterInfo {
        final String id;
        final String semanticLabel;
        final double centroidX;
        final double centroidY;
        final double centroidZ;
        final double minX;
        final double minY;
        final double minZ;
        final double maxX;
        final double maxY;
        final double maxZ;
        final LinkedHashSet<Point2> footprintPoints = new LinkedHashSet<>();

        ClusterInfo(String id, String semanticLabel, double centroidX, double centroidY, double centroidZ,
                    double minX, double minY, double minZ, double maxX, double maxY, double maxZ) {
            this.id = id;
            this.semanticLabel = semanticLabel;
            this.centroidX = centroidX;
            this.centroidY = centroidY;
            this.centroidZ = centroidZ;
            this.minX = minX;
            this.minY = minY;
            this.minZ = minZ;
            this.maxX = maxX;
            this.maxY = maxY;
            this.maxZ = maxZ;
        }

        static ClusterInfo fromJson(JSONObject cluster) throws Exception {
            JSONArray centroid = cluster.getJSONArray("centroid");
            JSONObject bounds = cluster.getJSONObject("bounds");
            JSONArray min = bounds.getJSONArray("min");
            JSONArray max = bounds.getJSONArray("max");
            return new ClusterInfo(
                cluster.getString("id"),
                cluster.optString("semanticLabel", "UNLABELED"),
                centroid.getDouble(0), centroid.getDouble(1), centroid.getDouble(2),
                min.getDouble(0), min.getDouble(1), min.getDouble(2),
                max.getDouble(0), max.getDouble(1), max.getDouble(2));
        }

        boolean contains(double x, double y, double z, double margin) {
            return x >= minX - margin && x <= maxX + margin
                && y >= minY - margin && y <= maxY + margin
                && z >= minZ - margin && z <= maxZ + margin;
        }

        double distanceSquared(double x, double y, double z) {
            double dx = x - centroidX;
            double dy = y - centroidY;
            double dz = z - centroidZ;
            return dx * dx + dy * dy + dz * dz;
        }

        void addVoxelCell(double centerX, double centerZ, double voxelSize) {
            double half = voxelSize * 0.5;
            footprintPoints.add(new Point2(centerX - half, centerZ - half));
            footprintPoints.add(new Point2(centerX + half, centerZ - half));
            footprintPoints.add(new Point2(centerX + half, centerZ + half));
            footprintPoints.add(new Point2(centerX - half, centerZ + half));
        }

        List<Point2> footprint() {
            return convexHull(new ArrayList<>(footprintPoints));
        }
    }

    private static final class RefinedFeature {
        String id;
        String type;
        String layer;
        double confidence;
        boolean reviewRequired;
        boolean visionClassified;
        long samples;
        int voxels;
        double minX;
        double minZ;
        double maxX;
        double maxZ;
        boolean suppressed;
        final JSONObject source;
        final List<Point2> footprint;

        RefinedFeature(JSONObject source, List<Point2> footprint) throws Exception {
            this.source = new JSONObject(source.toString());
            this.id = source.optString("id", "");
            this.type = source.optString("type", "unknown");
            this.layer = layerForType(type);
            this.confidence = source.optDouble("confidence", 0);
            this.reviewRequired = source.optBoolean("reviewRequired", true);
            this.visionClassified = source.optBoolean("visionClassified", false);
            this.samples = source.optLong("samples", 0);
            this.voxels = source.optInt("voxels", 0);
            JSONObject bounds = source.getJSONObject("bounds");
            JSONArray min = bounds.getJSONArray("min");
            JSONArray max = bounds.getJSONArray("max");
            this.minX = min.getDouble(0);
            this.minZ = min.getDouble(2);
            this.maxX = max.getDouble(0);
            this.maxZ = max.getDouble(2);
            this.footprint = footprint;
        }

        static RefinedFeature fromJson(JSONObject source, Map<String, ClusterInfo> clustersById) throws Exception {
            List<Point2> points = new ArrayList<>();
            JSONArray sourceIds = source.optJSONArray("sourceClusterIds");
            if (sourceIds != null) {
                for (int index = 0; index < sourceIds.length(); index++) {
                    ClusterInfo cluster = clustersById.get(sourceIds.optString(index, ""));
                    if (cluster != null) points.addAll(cluster.footprint());
                }
            }
            return new RefinedFeature(source, points.size() >= 3 ? convexHull(points) : new ArrayList<>());
        }

        JSONObject toJson() throws Exception {
            JSONObject result = new JSONObject(source.toString());
            result.put("id", id);
            result.put("layer", layer);
            result.put("geometryQuality", footprint.size() >= 3 ? "voxel-hull" : "bounds-fallback");
            if (footprint.size() >= 3) {
                JSONArray polygon = new JSONArray();
                for (Point2 point : footprint) polygon.put(new JSONArray().put(point.x).put(point.z));
                result.put("footprint", polygon);
                result.put("footprintAreaM2", polygonArea(footprint));
            }
            return result;
        }
    }

    private static final class Point2 {
        final double x;
        final double z;

        Point2(double x, double z) {
            this.x = x;
            this.z = z;
        }

        @Override public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof Point2)) return false;
            Point2 point = (Point2) other;
            return Double.doubleToLongBits(x) == Double.doubleToLongBits(point.x)
                && Double.doubleToLongBits(z) == Double.doubleToLongBits(point.z);
        }

        @Override public int hashCode() {
            long xBits = Double.doubleToLongBits(x);
            long zBits = Double.doubleToLongBits(z);
            int result = (int) (xBits ^ (xBits >>> 32));
            result = 31 * result + (int) (zBits ^ (zBits >>> 32));
            return result;
        }
    }
}
