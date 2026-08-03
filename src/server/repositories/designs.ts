import { generateDesignOptions, replaceVisualBackground } from '../../shared/design-engine';
import type {
  DesignConstraints,
  DesignGoal,
  DesignInspiration,
  DesignOption,
  DesignProject,
  DesignVisual,
  DesignWorkspace,
  FeatureType,
  GardenAssessment,
  PlantCatalogEntry,
} from '../../shared/types';
import { nowIso } from '../utils/time';

interface InspirationRow {
  id: string;
  garden_id: string;
  media_id: string | null;
  source_url: string | null;
  title: string;
  notes: string | null;
  style_tags_json: string;
  desired_elements_json: string;
  avoided_elements_json: string;
  created_at: string;
}

interface ProjectRow {
  id: string;
  garden_id: string;
  target_feature_id: string | null;
  inspiration_id: string | null;
  version_no: number;
  title: string;
  goal: DesignGoal;
  constraints_json: string;
  status: DesignProject['status'];
  created_at: string;
  updated_at: string;
}

interface OptionRow {
  id: string;
  project_id: string;
  position: number;
  name: string;
  strategy: string;
  summary: string;
  maintenance_score: number;
  budget_band: DesignOption['budgetBand'];
  biodiversity_score: number;
  plants_json: string;
  work_items_json: string;
  rule_trace_json: string;
  visual_json: string;
  status: DesignOption['status'];
  created_at: string;
  selected_at: string | null;
}

interface CatalogRow {
  id: string;
  common_name: string;
  scientific_name: string;
  category: PlantCatalogEntry['category'];
  sun_json: string;
  moisture_json: string;
  soil_json: string;
  maintenance_level: number;
  height_cm: number;
  spread_cm: number;
  evergreen: number;
  colors_json: string;
  flowering_months_json: string;
  biodiversity_score: number;
  slope_suitable: number;
  privacy_suitable: number;
  safety: PlantCatalogEntry['safety'];
  safety_note: string | null;
  source_label: string;
  source_url: string | null;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function mapInspiration(row: InspirationRow): DesignInspiration {
  return {
    id: row.id,
    gardenId: row.garden_id,
    mediaId: row.media_id,
    sourceUrl: row.source_url ?? '',
    title: row.title,
    notes: row.notes ?? '',
    styleTags: parseJson<string[]>(row.style_tags_json),
    desiredElements: parseJson<string[]>(row.desired_elements_json),
    avoidedElements: parseJson<string[]>(row.avoided_elements_json),
    createdAt: row.created_at,
  };
}

function mapOption(row: OptionRow): DesignOption {
  return {
    id: row.id,
    projectId: row.project_id,
    position: row.position,
    name: row.name,
    strategy: row.strategy,
    summary: row.summary,
    maintenanceScore: row.maintenance_score,
    budgetBand: row.budget_band,
    biodiversityScore: row.biodiversity_score,
    plants: parseJson<DesignOption['plants']>(row.plants_json),
    workItems: parseJson<DesignOption['workItems']>(row.work_items_json),
    ruleTrace: parseJson<string[]>(row.rule_trace_json),
    visual: parseJson<DesignVisual>(row.visual_json),
    status: row.status,
    createdAt: row.created_at,
    selectedAt: row.selected_at,
  };
}

function mapProject(row: ProjectRow, options: DesignOption[]): DesignProject {
  return {
    id: row.id,
    gardenId: row.garden_id,
    targetFeatureId: row.target_feature_id,
    inspirationId: row.inspiration_id,
    versionNo: row.version_no,
    title: row.title,
    goal: row.goal,
    constraints: parseJson<DesignConstraints>(row.constraints_json),
    status: row.status,
    options,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCatalog(row: CatalogRow): PlantCatalogEntry {
  return {
    id: row.id,
    commonName: row.common_name,
    scientificName: row.scientific_name,
    category: row.category,
    sun: parseJson<string[]>(row.sun_json),
    moisture: parseJson<string[]>(row.moisture_json),
    soil: parseJson<string[]>(row.soil_json),
    maintenanceLevel: row.maintenance_level,
    heightCm: row.height_cm,
    spreadCm: row.spread_cm,
    evergreen: row.evergreen === 1,
    colors: parseJson<PlantCatalogEntry['colors']>(row.colors_json),
    floweringMonths: parseJson<number[]>(row.flowering_months_json),
    biodiversityScore: row.biodiversity_score,
    slopeSuitable: row.slope_suitable === 1,
    privacySuitable: row.privacy_suitable === 1,
    safety: row.safety,
    safetyNote: row.safety_note ?? '',
    sourceLabel: row.source_label,
    sourceUrl: row.source_url ?? '',
  };
}

export async function listPlantCatalog(db: D1Database): Promise<PlantCatalogEntry[]> {
  const rows = await db.prepare(`SELECT id, common_name, scientific_name, category, sun_json, moisture_json, soil_json,
    maintenance_level, height_cm, spread_cm, evergreen, colors_json, flowering_months_json, biodiversity_score,
    slope_suitable, privacy_suitable, safety, safety_note, source_label, source_url
    FROM plant_catalog ORDER BY common_name`).all<CatalogRow>();
  return rows.results.map(mapCatalog);
}

export async function getDesignWorkspace(db: D1Database, gardenId: string): Promise<DesignWorkspace> {
  const [projectsResult, optionsResult, inspirationsResult, catalogCount] = await Promise.all([
    db.prepare(`SELECT id, garden_id, target_feature_id, inspiration_id, version_no, title, goal, constraints_json,
      status, created_at, updated_at FROM design_projects
      WHERE garden_id = ? AND archived_at IS NULL ORDER BY version_no DESC`).bind(gardenId).all<ProjectRow>(),
    db.prepare(`SELECT o.id, o.project_id, o.position, o.name, o.strategy, o.summary, o.maintenance_score,
      o.budget_band, o.biodiversity_score, o.plants_json, o.work_items_json, o.rule_trace_json,
      o.visual_json, o.status, o.created_at, o.selected_at
      FROM design_options o JOIN design_projects p ON p.id = o.project_id
      WHERE p.garden_id = ? AND p.archived_at IS NULL ORDER BY p.version_no DESC, o.position`).bind(gardenId).all<OptionRow>(),
    db.prepare(`SELECT id, garden_id, media_id, source_url, title, notes, style_tags_json,
      desired_elements_json, avoided_elements_json, created_at FROM design_inspirations
      WHERE garden_id = ? AND archived_at IS NULL ORDER BY created_at DESC`).bind(gardenId).all<InspirationRow>(),
    db.prepare('SELECT COUNT(*) AS count FROM plant_catalog').first<{ count: number }>(),
  ]);
  const optionsByProject = new Map<string, DesignOption[]>();
  for (const row of optionsResult.results) {
    const items = optionsByProject.get(row.project_id) ?? [];
    items.push(mapOption(row));
    optionsByProject.set(row.project_id, items);
  }
  const projects = projectsResult.results.map((row) => mapProject(row, optionsByProject.get(row.id) ?? []));
  const current = projects.find((project) => project.status === 'selected') ?? projects[0] ?? null;
  return {
    projects,
    inspirations: inspirationsResult.results.map(mapInspiration),
    catalogSize: catalogCount?.count ?? 0,
    currentProjectId: current?.id ?? null,
  };
}

export async function createDesignProject(
  db: D1Database,
  gardenId: string,
  input: {
    targetFeatureId?: string;
    title: string;
    goal: DesignGoal;
    constraints: DesignConstraints;
    inspiration?: {
      mediaId?: string;
      sourceUrl: string;
      title: string;
      notes: string;
      styleTags: string[];
      desiredElements: string[];
      avoidedElements: string[];
    };
  },
): Promise<DesignWorkspace> {
  const [versionRow, targetRow, assessmentsResult, catalog] = await Promise.all([
    db.prepare('SELECT COALESCE(MAX(version_no), 0) + 1 AS version FROM design_projects WHERE garden_id = ?')
      .bind(gardenId).first<{ version: number }>(),
    input.targetFeatureId
      ? db.prepare('SELECT type FROM garden_features WHERE id = ? AND garden_id = ? AND archived_at IS NULL')
        .bind(input.targetFeatureId, gardenId).first<{ type: FeatureType }>()
      : Promise.resolve(null),
    db.prepare(`SELECT id, garden_id, category, value, notes, geometry_json, created_at, updated_at
      FROM garden_assessments WHERE garden_id = ? AND archived_at IS NULL`).bind(gardenId).all<{
        id: string; garden_id: string; category: GardenAssessment['category']; value: string; notes: string | null;
        geometry_json: string | null; created_at: string; updated_at: string;
      }>(),
    listPlantCatalog(db),
  ]);

  const timestamp = nowIso();
  const projectId = crypto.randomUUID();
  const inspirationId = input.inspiration ? crypto.randomUUID() : null;
  const versionNo = versionRow?.version ?? 1;
  const inspirationForEngine = input.inspiration
    ? {
        mediaId: input.inspiration.mediaId ?? null,
        sourceUrl: input.inspiration.sourceUrl,
        title: input.inspiration.title,
        notes: input.inspiration.notes,
        styleTags: input.inspiration.styleTags,
        desiredElements: input.inspiration.desiredElements,
        avoidedElements: input.inspiration.avoidedElements,
      }
    : null;
  const assessments = assessmentsResult.results.map((row) => ({
    id: row.id,
    gardenId: row.garden_id,
    category: row.category,
    value: row.value,
    notes: row.notes ?? '',
    geometry: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies GardenAssessment));
  const generated = generateDesignOptions({
    goal: input.goal,
    constraints: input.constraints,
    targetFeatureType: targetRow?.type ?? null,
    assessments,
    catalog,
    inspiration: inspirationForEngine,
  });

  const statements: D1PreparedStatement[] = [];
  if (input.inspiration && inspirationId) {
    statements.push(db.prepare(`INSERT INTO design_inspirations
      (id, garden_id, media_id, source_url, title, notes, style_tags_json, desired_elements_json,
       avoided_elements_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(inspirationId, gardenId, input.inspiration.mediaId ?? null, input.inspiration.sourceUrl || null,
        input.inspiration.title, input.inspiration.notes || null, JSON.stringify(input.inspiration.styleTags),
        JSON.stringify(input.inspiration.desiredElements), JSON.stringify(input.inspiration.avoidedElements), timestamp));
  }
  statements.push(db.prepare(`INSERT INTO design_projects
    (id, garden_id, target_feature_id, inspiration_id, version_no, title, goal, constraints_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
    .bind(projectId, gardenId, input.targetFeatureId ?? null, inspirationId, versionNo, input.title, input.goal,
      JSON.stringify(input.constraints), timestamp, timestamp));
  for (const option of generated) {
    statements.push(db.prepare(`INSERT INTO design_options
      (id, project_id, position, name, strategy, summary, maintenance_score, budget_band, biodiversity_score,
       plants_json, work_items_json, rule_trace_json, visual_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`)
      .bind(crypto.randomUUID(), projectId, option.position, option.name, option.strategy, option.summary,
        option.maintenanceScore, option.budgetBand, option.biodiversityScore, JSON.stringify(option.plants),
        JSON.stringify(option.workItems), JSON.stringify(option.ruleTrace), JSON.stringify(option.visual), timestamp));
  }
  await db.batch(statements);
  return getDesignWorkspace(db, gardenId);
}

export async function selectDesignOption(
  db: D1Database,
  gardenId: string,
  projectId: string,
  optionId: string,
): Promise<boolean> {
  const match = await db.prepare(`SELECT 1 AS found FROM design_options o JOIN design_projects p ON p.id = o.project_id
    WHERE o.id = ? AND o.project_id = ? AND p.garden_id = ? AND p.archived_at IS NULL LIMIT 1`)
    .bind(optionId, projectId, gardenId).first<{ found: number }>();
  if (match?.found !== 1) return false;
  const timestamp = nowIso();
  await db.batch([
    db.prepare("UPDATE design_options SET status = 'draft', selected_at = NULL WHERE project_id = ?").bind(projectId),
    db.prepare("UPDATE design_options SET status = 'selected', selected_at = ? WHERE id = ? AND project_id = ?")
      .bind(timestamp, optionId, projectId),
    db.prepare("UPDATE design_projects SET status = 'draft', updated_at = ? WHERE garden_id = ? AND archived_at IS NULL")
      .bind(timestamp, gardenId),
    db.prepare("UPDATE design_projects SET status = 'selected', updated_at = ? WHERE id = ? AND garden_id = ?")
      .bind(timestamp, projectId, gardenId),
  ]);
  return true;
}

export async function updateDesignVisual(
  db: D1Database,
  gardenId: string,
  optionId: string,
  backgroundMediaId: string | null,
): Promise<boolean> {
  const row = await db.prepare(`SELECT o.visual_json FROM design_options o JOIN design_projects p ON p.id = o.project_id
    WHERE o.id = ? AND p.garden_id = ? AND p.archived_at IS NULL LIMIT 1`)
    .bind(optionId, gardenId).first<{ visual_json: string }>();
  if (!row) return false;
  const visual = replaceVisualBackground(parseJson<DesignVisual>(row.visual_json), backgroundMediaId);
  await db.prepare('UPDATE design_options SET visual_json = ? WHERE id = ?').bind(JSON.stringify(visual), optionId).run();
  return true;
}

export async function archiveDesignProject(db: D1Database, gardenId: string, projectId: string): Promise<boolean> {
  const timestamp = nowIso();
  const result = await db.prepare(`UPDATE design_projects SET status = 'archived', archived_at = ?, updated_at = ?
    WHERE id = ? AND garden_id = ? AND archived_at IS NULL`).bind(timestamp, timestamp, projectId, gardenId).run();
  return (result.meta.changes ?? 0) === 1;
}
