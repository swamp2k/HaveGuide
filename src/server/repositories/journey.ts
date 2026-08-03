import type { GardenChange, GardenJourney, GardenTask, ShoppingItem } from '../../shared/journey-types';
import { nowIso } from '../utils/time';

function task(row: any): GardenTask { return { id: row.id, gardenId: row.garden_id, featureId: row.feature_id, title: row.title, description: row.description ?? '', season: row.season, dueDate: row.due_date, status: row.status, priority: row.priority, source: row.source, createdAt: row.created_at, completedAt: row.completed_at, updatedAt: row.updated_at }; }
function change(row: any): GardenChange { return { id: row.id, gardenId: row.garden_id, featureId: row.feature_id, title: row.title, notes: row.notes ?? '', occurredOn: row.occurred_on, beforeMediaId: row.before_media_id, afterMediaId: row.after_media_id, costMinor: row.cost_minor, currency: row.currency, createdAt: row.created_at, updatedAt: row.updated_at }; }
function shopping(row: any): ShoppingItem { return { id: row.id, gardenId: row.garden_id, designProjectId: row.design_project_id, name: row.name, quantity: row.quantity, unit: row.unit, estimatedUnitPriceMinor: row.estimated_unit_price_minor, actualUnitPriceMinor: row.actual_unit_price_minor, supplier: row.supplier ?? '', url: row.url ?? '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }; }

export async function getJourney(db: D1Database, gardenId: string): Promise<GardenJourney> {
  const [tasks, changes, shoppingItems] = await Promise.all([
    db.prepare('SELECT * FROM garden_tasks WHERE garden_id = ? AND archived_at IS NULL ORDER BY status, due_date, created_at DESC').bind(gardenId).all(),
    db.prepare('SELECT * FROM garden_changes WHERE garden_id = ? AND archived_at IS NULL ORDER BY occurred_on DESC, created_at DESC').bind(gardenId).all(),
    db.prepare('SELECT * FROM shopping_items WHERE garden_id = ? AND archived_at IS NULL ORDER BY status, created_at DESC').bind(gardenId).all(),
  ]);
  const mappedTasks = tasks.results.map(task);
  const mappedShopping = shoppingItems.results.map(shopping);
  return {
    tasks: mappedTasks,
    changes: changes.results.map(change),
    shopping: mappedShopping,
    summary: {
      openTasks: mappedTasks.filter((item) => item.status === 'open').length,
      completedTasks: mappedTasks.filter((item) => item.status === 'done').length,
      estimatedBudgetMinor: mappedShopping.reduce((sum, item) => sum + Math.round(item.quantity * item.estimatedUnitPriceMinor), 0),
      actualBudgetMinor: mappedShopping.reduce((sum, item) => sum + Math.round(item.quantity * (item.actualUnitPriceMinor ?? 0)), 0),
    },
  };
}

export async function createTask(db: D1Database, gardenId: string, input: any): Promise<void> {
  const now = nowIso();
  await db.prepare(`INSERT INTO garden_tasks (id,garden_id,feature_id,title,description,season,due_date,status,priority,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'open',?,'manual',?,?)`)
    .bind(crypto.randomUUID(), gardenId, input.featureId ?? null, input.title, input.description, input.season, input.dueDate ?? null, input.priority, now, now).run();
}

export async function updateTask(db: D1Database, gardenId: string, taskId: string, input: any): Promise<boolean> {
  const current = await db.prepare('SELECT * FROM garden_tasks WHERE id = ? AND garden_id = ? AND archived_at IS NULL').bind(taskId, gardenId).first<any>();
  if (!current) return false;
  const status = input.status ?? current.status;
  const completedAt = status === 'done' ? (current.completed_at ?? nowIso()) : null;
  await db.prepare(`UPDATE garden_tasks SET title=?,description=?,due_date=?,priority=?,status=?,completed_at=?,updated_at=? WHERE id=? AND garden_id=?`)
    .bind(input.title ?? current.title, input.description ?? current.description, input.dueDate === undefined ? current.due_date : input.dueDate, input.priority ?? current.priority, status, completedAt, nowIso(), taskId, gardenId).run();
  return true;
}

export async function createChange(db: D1Database, gardenId: string, input: any): Promise<void> {
  const now = nowIso();
  await db.prepare(`INSERT INTO garden_changes (id,garden_id,feature_id,title,notes,occurred_on,before_media_id,after_media_id,cost_minor,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'DKK',?,?)`)
    .bind(crypto.randomUUID(), gardenId, input.featureId ?? null, input.title, input.notes, input.occurredOn, input.beforeMediaId ?? null, input.afterMediaId ?? null, input.costMinor, now, now).run();
}

export async function createShoppingItem(db: D1Database, gardenId: string, input: any): Promise<void> {
  const now = nowIso();
  await db.prepare(`INSERT INTO shopping_items (id,garden_id,design_project_id,name,quantity,unit,estimated_unit_price_minor,supplier,url,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'planned',?,?)`)
    .bind(crypto.randomUUID(), gardenId, input.designProjectId ?? null, input.name, input.quantity, input.unit, input.estimatedUnitPriceMinor, input.supplier || null, input.url || null, now, now).run();
}

export async function updateShoppingItem(db: D1Database, gardenId: string, itemId: string, input: any): Promise<boolean> {
  const current = await db.prepare('SELECT * FROM shopping_items WHERE id=? AND garden_id=? AND archived_at IS NULL').bind(itemId, gardenId).first<any>();
  if (!current) return false;
  await db.prepare('UPDATE shopping_items SET status=?, actual_unit_price_minor=?, updated_at=? WHERE id=? AND garden_id=?')
    .bind(input.status ?? current.status, input.actualUnitPriceMinor === undefined ? current.actual_unit_price_minor : input.actualUnitPriceMinor, nowIso(), itemId, gardenId).run();
  return true;
}
