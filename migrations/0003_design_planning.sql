PRAGMA foreign_keys = ON;

CREATE TABLE plant_catalog (
  id TEXT PRIMARY KEY,
  common_name TEXT NOT NULL,
  scientific_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('groundcover', 'perennial', 'grass', 'shrub', 'hedge', 'annual')),
  sun_json TEXT NOT NULL,
  moisture_json TEXT NOT NULL,
  soil_json TEXT NOT NULL,
  maintenance_level INTEGER NOT NULL CHECK (maintenance_level BETWEEN 1 AND 5),
  height_cm INTEGER NOT NULL,
  spread_cm INTEGER NOT NULL,
  evergreen INTEGER NOT NULL DEFAULT 0 CHECK (evergreen IN (0, 1)),
  colors_json TEXT NOT NULL,
  flowering_months_json TEXT NOT NULL,
  biodiversity_score INTEGER NOT NULL CHECK (biodiversity_score BETWEEN 1 AND 5),
  slope_suitable INTEGER NOT NULL DEFAULT 0 CHECK (slope_suitable IN (0, 1)),
  privacy_suitable INTEGER NOT NULL DEFAULT 0 CHECK (privacy_suitable IN (0, 1)),
  safety TEXT NOT NULL DEFAULT 'review' CHECK (safety IN ('low_risk', 'review', 'avoid')),
  safety_note TEXT,
  source_label TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE design_inspirations (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  style_tags_json TEXT NOT NULL,
  desired_elements_json TEXT NOT NULL,
  avoided_elements_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX design_inspirations_garden_id_idx ON design_inspirations(garden_id, created_at);

CREATE TABLE design_projects (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  target_feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  inspiration_id TEXT REFERENCES design_inspirations(id) ON DELETE SET NULL,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL CHECK (goal IN ('low_maintenance', 'slope', 'privacy', 'flowers', 'biodiversity', 'seating', 'edible', 'other')),
  constraints_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'selected', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE UNIQUE INDEX design_projects_version_idx ON design_projects(garden_id, version_no);
CREATE INDEX design_projects_garden_id_idx ON design_projects(garden_id, created_at);

CREATE TABLE design_options (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES design_projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  name TEXT NOT NULL,
  strategy TEXT NOT NULL,
  summary TEXT NOT NULL,
  maintenance_score INTEGER NOT NULL CHECK (maintenance_score BETWEEN 1 AND 5),
  budget_band TEXT NOT NULL CHECK (budget_band IN ('low', 'medium', 'high')),
  biodiversity_score INTEGER NOT NULL CHECK (biodiversity_score BETWEEN 1 AND 5),
  plants_json TEXT NOT NULL,
  work_items_json TEXT NOT NULL,
  rule_trace_json TEXT NOT NULL,
  visual_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'selected', 'rejected')),
  created_at TEXT NOT NULL,
  selected_at TEXT,
  UNIQUE (project_id, position)
);
CREATE INDEX design_options_project_id_idx ON design_options(project_id, position);

INSERT INTO plant_catalog VALUES
('lavandula-angustifolia','Lavendel','Lavandula angustifolia','perennial','["sun"]','["dry","normal"]','["sandy","loam","chalk"]',2,60,60,0,'["purple","blue","white"]','[6,7,8]',5,1,0,'review','Plantesort og indtagelse skal vurderes, især ved kæledyr.','RHS Plant Guide','https://www.rhs.org.uk/plants/lavender','2026-08-03T00:00:00.000Z'),
('thymus-serpyllum','Krybende timian','Thymus serpyllum','groundcover','["sun"]','["dry"]','["sandy","loam","chalk"]',1,10,40,1,'["purple","pink","white"]','[6,7,8]',5,1,0,'review','Brug kun korrekt identificeret plantesort; spiselighed er ikke en del af anbefalingen.','RHS slope guidance','https://www.rhs.org.uk/garden-design/sustainable-planting-combinations/problem-solving/slope-stabilisation-sun','2026-08-03T00:00:00.000Z'),
('nepeta-faassenii','Blåkant','Nepeta × faassenii','perennial','["sun","part_shade"]','["dry","normal"]','["sandy","loam"]',1,45,60,0,'["blue","purple"]','[5,6,7,8,9]',5,1,0,'review','Sikkerhed skal kontrolleres for det konkrete dyr og plantesort.','Have Guide starter catalogue',NULL,'2026-08-03T00:00:00.000Z'),
('geranium-macrorrhizum','Storkenæb','Geranium macrorrhizum','groundcover','["sun","part_shade","shade"]','["dry","normal"]','["loam","clay"]',1,35,60,0,'["pink","white"]','[5,6,7]',4,1,0,'review','Sikkerhed skal kontrolleres for det konkrete dyr og plantesort.','RHS ground-cover guidance','https://www.rhs.org.uk/plants/for-places/ground-cover','2026-08-03T00:00:00.000Z'),
('hylotelephium-telephium','Sankthansurt','Hylotelephium telephium','perennial','["sun"]','["dry","normal"]','["sandy","loam"]',1,55,45,0,'["pink","red","white"]','[8,9,10]',5,1,0,'review','Sikkerhed skal kontrolleres for det konkrete dyr og plantesort.','RHS Plants for Pollinators','https://www.rhs.org.uk/science/research/plants-for-pollinators','2026-08-03T00:00:00.000Z'),
('achillea-millefolium','Røllike','Achillea millefolium','perennial','["sun"]','["dry","normal"]','["sandy","loam"]',2,80,50,0,'["white","yellow","pink","red"]','[6,7,8,9]',5,1,0,'review','Kan give hudreaktion hos nogle; sikkerhed skal vurderes konkret.','RHS Plant Guide','https://www.rhs.org.uk/plants/achillea','2026-08-03T00:00:00.000Z'),
('alchemilla-mollis','Løvefod','Alchemilla mollis','perennial','["sun","part_shade"]','["normal","moist"]','["loam","clay"]',2,45,55,0,'["yellow","green"]','[6,7,8]',3,1,0,'review','Sikkerhed skal kontrolleres for det konkrete dyr og plantesort.','Have Guide starter catalogue',NULL,'2026-08-03T00:00:00.000Z'),
('echinacea-purpurea','Purpursolhat','Echinacea purpurea','perennial','["sun"]','["normal"]','["sandy","loam"]',2,90,45,0,'["pink","purple","white"]','[7,8,9]',5,0,0,'review','Sikkerhed skal kontrolleres for det konkrete dyr og plantesort.','RHS Plants for Pollinators','https://www.rhs.org.uk/science/research/plants-for-pollinators','2026-08-03T00:00:00.000Z'),
('calamagrostis-karl-foerster','Rørhvene Karl Foerster','Calamagrostis × acutiflora Karl Foerster','grass','["sun","part_shade"]','["normal","moist"]','["loam","clay"]',2,160,60,0,'["green","brown"]','[6,7,8]',2,0,1,'review','Sikkerhed skal kontrolleres for det konkrete dyr og plantesort.','Have Guide starter catalogue',NULL,'2026-08-03T00:00:00.000Z'),
('ribes-alpinum','Fjeldribs','Ribes alpinum','hedge','["sun","part_shade","shade"]','["normal"]','["sandy","loam","clay"]',2,180,120,0,'["green"]','[4,5]',3,1,1,'review','Bær og plantedele må ikke antages spiselige uden sikker identifikation.','Have Guide starter catalogue',NULL,'2026-08-03T00:00:00.000Z'),
('carpinus-betulus','Avnbøg','Carpinus betulus','hedge','["sun","part_shade","shade"]','["normal","moist"]','["loam","clay"]',3,400,150,0,'["green","brown"]','[4,5]',3,1,1,'review','Hæk kræver løbende klipning; sikkerhed skal vurderes konkret.','Have Guide starter catalogue',NULL,'2026-08-03T00:00:00.000Z'),
('corylus-avellana','Hassel','Corylus avellana','shrub','["sun","part_shade"]','["normal","moist"]','["loam","clay"]',2,400,300,0,'["green","yellow"]','[2,3]',5,1,1,'review','Nøddeallergi og korrekt identifikation skal indgå i vurderingen.','Have Guide starter catalogue',NULL,'2026-08-03T00:00:00.000Z'),
('helianthus-annuus','Solsikke','Helianthus annuus','annual','["sun"]','["normal"]','["sandy","loam"]',2,180,50,0,'["yellow","red","brown"]','[7,8,9]',5,0,1,'low_risk','ASPCA angiver solsikke som ikke-giftig for hunde og katte; andre risici og sorter skal stadig vurderes.','ASPCA plant database','https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/sunflower','2026-08-03T00:00:00.000Z'),
('zinnia-elegans','Zinnia','Zinnia elegans','annual','["sun"]','["normal"]','["sandy","loam"]',2,75,35,0,'["pink","red","orange","yellow","white"]','[7,8,9,10]',4,0,0,'low_risk','ASPCA angiver zinnia som ikke-giftig for hunde og katte; andre risici og sorter skal stadig vurderes.','ASPCA plant database','https://www.aspca.org/pet-care/aspca-poison-control/toxic-and-non-toxic-plants/zinnia','2026-08-03T00:00:00.000Z'),
('hydrangea-paniculata','Syrenhortensia','Hydrangea paniculata','shrub','["sun","part_shade"]','["normal","moist"]','["loam","clay"]',2,220,180,0,'["white","pink"]','[7,8,9,10]',3,0,1,'avoid','RHS angiver hortensia som skadelig for hunde og katte ved indtagelse.','RHS Plant Guide','https://www.rhs.org.uk/plants/218297/hydrangea-pee-gee/details','2026-08-03T00:00:00.000Z');
