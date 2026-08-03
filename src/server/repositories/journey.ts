import type { z } from 'zod';
import type {
  createChangeSchema,
  createShoppingItemSchema,
  createTaskSchema,
  updateShoppingItemSchema,
  updateTaskSchema,
} from '../../shared/journey-schemas';
import type { GardenChange, GardenJourney, GardenTask, ShoppingItem } from '../../shared/journey-types';
import { nowIso } from '../utils/time';

type CreateTaskInput = z.infer<typeof createTaskSchema>;
type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
type CreateChangeInput = z.infer<typeof createChangeSchema>;
type CreateShoppingInput = z.infer<typeof createShoppingItemSchema>;
type UpdateShoppingInput = z.infer<typeof updateShoppingItemSchema>;

interface TaskRow {
  id: string; garden_id: string; feature_id: string | null; title: string; description: string | null;
  season: GardenTask['season']; due_date: string | null; status: GardenTask['status']; priority: GardenTask['priority'];
  source: GardenTask['source']; created_at: string; completed_at: string | null; updated_at: string;
}
interface ChangeRow {
  id: string; garden_id: string; feature_id: string | null; title: string; notes: string | null;
  occurred_on: string; before_media_id: string | null; after_media_id: string | null; cost_minor: number;
  currency: string; created_at: string; updated_at: string;
}
interface ShoppingRow {
  id: string; garden_id: string; design_project_id: string | null; name: string; quantity: number; unit: string;
  estimated_unit_price_minor: number; actual_unit_price_minor: number | null; supplier: string | null; url: string | null;
  status: ShoppingItem['status']; created_at: string; updated_at: string;
}

function mapTask(row: TaskRow): GardenTask {
  return { id: row.id, gardenId: row.garden_id, featureId: row.feature_id, title: row.title, description: row.description ?? '', season: row.season, dueDate: row.due_date, status: row.status, priority: row.priority, source: row.source, createdAt: row.created_at, completedAt: row.completed_at, updatedAt: row.updated_at };
}
function mapChange(row: ChangeRow): GardenChange {
  return { id: row.id, gardenId: row.garden_id, featureId: row.feature_id, title: row.title, notes: row.notes ?? '', occurredOn: row.occurred_on, beforeMediaId: row.before_media_id, afterMediaId: row.after_media_id, costMinor: row.cost_minor, currency: row.currency, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapShopping(row: ShoppingRow): ShoppingItem {
  return { id: row.id, gardenId: row.garden_id, designProjectId: row.design_project_id, name: row.name, quantity: row.quantity, unit: row.unit, estimatedUnitPriceMinor: row.estimated_unit_price_minor, actualUnitPriceMinor: row.actual_unit_price_minor, supplier: row.supplier ?? '', url: row.url ?? '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getJourney(db: D1Database, gardenId: string): Promise<GardenJourney> {
  const [tasks, changes, shoppingItems] = await Promise.all([
    db.prepare('SELECT * FROM garden_tasks WHERE garden_id = ? AND archived_at IS NULL ORDER BY status, due_date, created_at DESC').bind(gardenId).all<TaskRow>(),
    db.prepare('SELECT * FROM garden_changes WHERE garden_id = ? AND archived_at IS NULL ORDER BY occurred_on DESC, created_at DESC').bind(gardenId).all<ChangeRow>(),
    db.prepare('SELECT * FROM shopping_items WHERE garden_id = ? AND archived_at IS NULL ORDER BY status, created_at DESC').bind(gardenId).all<ShoppingRow>(),
  ]);
  const mappedTasks = tasks.results.map(mapTask);
  const mappedShopping = shoppingItems.results.map(mapShopping);
  return {
    tasks: mappedTasks,
    changes: changes.results.map(mapChange),
    shopping: mappedShopping,
    summary: {
      openTasks: mappedTasks.filter((item) => item.status === 'open').length,
      completedTasks: mappedTasks.filter((item) => item.status === 'done').length,
      estimatedBudgetMinor: mappedShopping.reduce((sum, item) => sum + Math.round(item.quantity * item.estimatedUnitPriceMinor), 0),
      actualBudgetMinor: mappedShopping.reduce((sum, item) => sum + Math.round(item.quantity * (item.actualUnitPriceMinor ?? 0)), 0),
    },
  };
}

export async function createTask(db: D1Database, gardenId: string, input: CreateTaskInput): Promise<void> {
  const now = nowIso();
  await db.prepare(`INSERT INTO garden_tasks (id,garden_id,feature_id,title,description,season,due_date,status,priority,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'open',?,'manual',?,?)`)
    .bind(crypto.randomUUID(), gardenId, input.featureId ?? null, input.title, input.description, input.season, input.dueDate ?? null, input.priority, now, now).run();
}

export async function updateTask(db: D1Database, gardenId: string, taskId: string, input: UpdateTaskInput): Promise<boolean> {
  const current = await db.prepare('SELECT * FROM garden_tasks WHERE id = ? AND garden_id = ? AND archived_at IS NULL').bind(taskId, gardenId).first<TaskRow>();
  if (!current) return false;
  const status = input.status ?? current.status;
  const completedAt = status === 'done' ? (current.completed_at ?? nowIso()) : null;
  await db.prepare(`UPDATE garden_tasks SET title=?,description=?,due_date=?,priority=?,status=?,completed_at=?,updated_at=? WHERE id=? AND garden_id=?`)
    .bind(input.title ?? current.title, input.description ?? current.description, input.dueDate === undefined ? current.due_date : input.dueDate, input.priority ?? current.priority, status, completedAt, nowIso(), taskId, gardenId).run();
  return true;
}

export async function createChange(db: D1Database, gardenId: string, input: CreateChangeInput): Promise<void> {
  const now = nowIso();
  await db.prepare(`INSERT INTO garden_changes (id,garden_id,feature_id,title,notes,occurred_on,before_media_id,after_media_id,cost_minor,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'DKK',?,?)`)
    .bind(crypto.randomUUID(), gardenId, input.featureId ?? null, input.title, input.notes, input.occurredOn, input.beforeMediaId ?? null, input.afterMediaId ?? null, input.costMinor, now, now).run();
}

export async function createShoppingItem(db: D1Database, gardenId: string, input: CreateShoppingInput): Promise<void> {
  const now = nowIso();
  await db.prepare(`INSERT INTO shopping_items (id,garden_id,design_project_id,name,quantity,unit,estimated_unit_price_minor,supplier,url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'planned',?,?)`)
    .bind(crypto.randomUUID(), gardenId, input.designProjectId ?? null, input.name, input.quantity, input.unit, input.estimatedUnitPriceMinor, input.supplier || null, input.url || null, now, now).run();
}

export async function updateShoppingItem(db: D1Database, gardenId: string, itemId: string, input: UpdateShoppingInput): Promise<boolean> {
  const current = await db.prepare('SELECT * FROM shopping_items WHERE id=? AND garden_id=? AND archived_at IS NULL').bind(itemId, gardenId).first<ShoppingRow>();
  if (!current) return false;
  await db.prepare('UPDATE shopping_items SET status=?, actual_unit_price_minor=?, updated_at=? WHERE id=? AND garden_id=?')
    .bind(input.status ?? current.status, input.actualUnitPriceMinor === undefined ? current.actual_unit_price_minor : input.actualUnitPriceMinor, nowIso(), itemId, gardenId).run();
  return true;
}
