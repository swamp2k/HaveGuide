export type GardenTaskStatus = 'open' | 'done' | 'skipped';
export type GardenTaskSeason = 'spring' | 'summer' | 'autumn' | 'winter' | 'any';
export type GardenTaskPriority = 'low' | 'normal' | 'high';

export interface GardenTask {
  id: string;
  gardenId: string;
  featureId: string | null;
  title: string;
  description: string;
  season: GardenTaskSeason;
  dueDate: string | null;
  status: GardenTaskStatus;
  priority: GardenTaskPriority;
  source: 'manual' | 'plan' | 'seasonal';
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface GardenChange {
  id: string;
  gardenId: string;
  featureId: string | null;
  title: string;
  notes: string;
  occurredOn: string;
  beforeMediaId: string | null;
  afterMediaId: string | null;
  costMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  gardenId: string;
  designProjectId: string | null;
  name: string;
  quantity: number;
  unit: string;
  estimatedUnitPriceMinor: number;
  actualUnitPriceMinor: number | null;
  supplier: string;
  url: string;
  status: 'planned' | 'bought' | 'skipped';
  createdAt: string;
  updatedAt: string;
}

export interface GardenJourney {
  tasks: GardenTask[];
  changes: GardenChange[];
  shopping: ShoppingItem[];
  summary: {
    openTasks: number;
    completedTasks: number;
    estimatedBudgetMinor: number;
    actualBudgetMinor: number;
  };
}
