import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'inventory.db');
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS floor_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    floor TEXT DEFAULT '',
    area TEXT DEFAULT '',
    image_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS circuits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_plan_id INTEGER,
    device_id INTEGER,
    code TEXT NOT NULL,
    name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    device_type TEXT DEFAULT '',
    x REAL,
    y REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS device_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '📍',
    circuit_count INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_plan_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT DEFAULT '',
    type TEXT DEFAULT '一般設備',
    note TEXT DEFAULT '',
    x REAL NOT NULL,
    y REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_devices_floor_plan ON devices(floor_plan_id);
  CREATE INDEX IF NOT EXISTS idx_circuits_floor_plan ON circuits(floor_plan_id);
`);

// ---- migrations for existing databases ----
function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

if (hasColumn('circuits', 'id') && !hasColumn('circuits', 'floor_plan_id')) {
  db.exec('ALTER TABLE circuits ADD COLUMN floor_plan_id INTEGER REFERENCES floor_plans(id) ON DELETE CASCADE;');
}
if (hasColumn('circuits', 'id') && !hasColumn('circuits', 'device_type')) {
  db.exec("ALTER TABLE circuits ADD COLUMN device_type TEXT DEFAULT '';");
}
if (hasColumn('circuits', 'id') && !hasColumn('circuits', 'x')) {
  db.exec('ALTER TABLE circuits ADD COLUMN x REAL;');
}
if (hasColumn('circuits', 'id') && !hasColumn('circuits', 'y')) {
  db.exec('ALTER TABLE circuits ADD COLUMN y REAL;');
}

// ---- circuit ↔ device: circuit is subordinate to device (one device → many circuits) ----
// 1. ensure device_id column on circuits
if (hasColumn('circuits', 'id') && !hasColumn('circuits', 'device_id')) {
  db.exec('ALTER TABLE circuits ADD COLUMN device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE;');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_circuits_device ON circuits(device_id);');
// 2. backfill from old direction (devices.circuit_id) then drop the column via table rebuild
if (hasColumn('devices', 'circuit_id')) {
  db.exec(`
    UPDATE circuits
    SET device_id = (SELECT MIN(d.id) FROM devices d WHERE d.circuit_id = circuits.id)
    WHERE device_id IS NULL
      AND EXISTS (SELECT 1 FROM devices d WHERE d.circuit_id = circuits.id);
  `);
  db.exec('DROP INDEX IF EXISTS idx_devices_circuit;');
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(`
    CREATE TABLE devices_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      floor_plan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT DEFAULT '',
      type TEXT DEFAULT '一般設備',
      note TEXT DEFAULT '',
      x REAL NOT NULL,
      y REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (floor_plan_id) REFERENCES floor_plans(id) ON DELETE CASCADE
    );
  `);
  db.exec(`
    INSERT INTO devices_new (id, floor_plan_id, name, code, type, note, x, y, created_at, updated_at)
    SELECT id, floor_plan_id, name, code, type, note, x, y, created_at, updated_at FROM devices;
  `);
  db.exec('DROP TABLE devices;');
  db.exec('ALTER TABLE devices_new RENAME TO devices;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('CREATE INDEX IF NOT EXISTS idx_devices_floor_plan ON devices(floor_plan_id);');
}
if (hasColumn('device_types', 'id') && !hasColumn('device_types', 'circuit_count')) {
  db.exec('ALTER TABLE device_types ADD COLUMN circuit_count INTEGER DEFAULT 1;');
}

// seed default device types if empty
const typeCount = db.prepare('SELECT COUNT(*) AS c FROM device_types').get().c;
if (typeCount === 0) {
  const seed = db.prepare('INSERT INTO device_types (name, icon, circuit_count) VALUES (?, ?, ?)');
  seed.run('插座', '🔌', 1);
  seed.run('燈具', '💡', 1);
  seed.run('開關', '🔘', 1);
  seed.run('馬達', '⚙️', 1);
  seed.run('設備', '📦', 1);
  seed.run('其他', '📍', 1);
}

export default db;
export { uploadsDir };
