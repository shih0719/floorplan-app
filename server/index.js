import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import db, { uploadsDir } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '300mb' }));
app.use('/uploads', express.static(uploadsDir));

// ---------- multer setup ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `fp_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error('只支援 PNG / JPG / WEBP / GIF 圖片'), ok);
  }
});

// ---------- Floor Plans ----------
app.get('/api/floorplans', (req, res) => {
  const rows = db.prepare(`
    SELECT fp.*,
      (SELECT COUNT(*) FROM devices d WHERE d.floor_plan_id = fp.id) AS device_count
    FROM floor_plans fp
    ORDER BY fp.id DESC
  `).all();
  res.json(rows);
});

app.get('/api/floorplans/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM floor_plans WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '找不到平面圖' });
  res.json(row);
});

app.post('/api/floorplans', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳圖片' });
  const { name, floor = '', area = '' } = req.body;
  if (!name) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '請填寫平面圖名稱' });
  }
  const imagePath = `/uploads/${req.file.filename}`;
  const info = db.prepare(`
    INSERT INTO floor_plans (name, floor, area, image_path)
    VALUES (?, ?, ?, ?)
  `).run(name, floor, area, imagePath);
  const row = db.prepare('SELECT * FROM floor_plans WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/floorplans/:id', (req, res) => {
  const { name, floor, area } = req.body;
  const existing = db.prepare('SELECT * FROM floor_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '找不到平面圖' });
  db.prepare(`
    UPDATE floor_plans
    SET name = ?, floor = ?, area = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name ?? existing.name, floor ?? existing.floor, area ?? existing.area, req.params.id);
  const row = db.prepare('SELECT * FROM floor_plans WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/api/floorplans/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM floor_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '找不到平面圖' });
  db.prepare('DELETE FROM floor_plans WHERE id = ?').run(req.params.id);
  if (existing.image_path) {
    const filePath = path.join(uploadsDir, path.basename(existing.image_path));
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  }
  res.json({ ok: true });
});

// ---------- auto-generate circuits for a device (subordinate to the device) ----------
function ensureCircuitsForDevice(deviceId, floorPlanId, type) {
  const dt = db.prepare('SELECT * FROM device_types WHERE name = ?').get(type);
  if (!dt || !dt.circuit_count) return;
  const count = Math.max(1, Number(dt.circuit_count) || 1);
  const existing = db.prepare(`
    SELECT COUNT(*) AS c FROM circuits
    WHERE device_id = ? AND device_type = ?
  `).get(deviceId, type).c;
  if (existing > 0) return;
  // prefix circuits with the owning device's name/code so codes stay distinguishable
  const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  const prefix = (dev && (dev.name || dev.code)) ? (dev.name || dev.code) : `d${deviceId}`;
  const insert = db.prepare(`
    INSERT INTO circuits (floor_plan_id, device_id, code, name, description, device_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (let i = 1; i <= count; i++) {
    insert.run(floorPlanId, deviceId, `${prefix}-ch${i}`, `ch${i}`, '', type);
  }
}


// ---------- Devices ----------
app.get('/api/floorplans/:id/devices', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM devices
    WHERE floor_plan_id = ?
    ORDER BY id
  `).all(req.params.id);
  res.json(rows);
});

app.post('/api/floorplans/:id/devices', (req, res) => {
  const { name, code = '', type = '一般設備', note = '', x, y } = req.body;
  if (!name || typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'name、x、y 為必填' });
  }
  const floorPlanId = Number(req.params.id);
  const info = db.prepare(`
    INSERT INTO devices (floor_plan_id, name, code, type, note, x, y)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(floorPlanId, name, code, type, note, x, y);
  // auto-generate this device's subordinate circuits
  ensureCircuitsForDevice(info.lastInsertRowid, floorPlanId, type);
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/devices/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '找不到設備' });
  const { name, code, type, note, x, y } = req.body;
  db.prepare(`
    UPDATE devices
    SET name = ?, code = ?, type = ?, note = ?, x = ?, y = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? existing.name,
    code ?? existing.code,
    type ?? existing.type,
    note ?? existing.note,
    x ?? existing.x,
    y ?? existing.y,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/api/devices/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Circuits ----------
const circuitSelect = `
  SELECT c.*,
    d.code AS device_code,
    d.name AS device_name
  FROM circuits c
  LEFT JOIN devices d ON d.id = c.device_id
`;

app.get('/api/circuits', (req, res) => {
  const { floorPlanId } = req.query;
  const where = floorPlanId ? `WHERE c.floor_plan_id = ${Number(floorPlanId)}` : '';
  const rows = db.prepare(`${circuitSelect} ${where} ORDER BY c.id DESC`).all();
  res.json(rows);
});

app.post('/api/circuits', (req, res) => {
  const { code, name = '', description = '', device_id = null, x = null, y = null } = req.body;
  if (!code) return res.status(400).json({ error: '請填寫迴路編號' });
  if (device_id == null) return res.status(400).json({ error: '請選擇所屬設備' });
  const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(device_id);
  if (!dev) return res.status(404).json({ error: '找不到所屬設備' });
  const info = db.prepare(`
    INSERT INTO circuits (floor_plan_id, device_id, code, name, description, x, y)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(dev.floor_plan_id, device_id, code, name, description, x, y);
  const row = db.prepare(`${circuitSelect} WHERE c.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/api/circuits/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM circuits WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '找不到迴路' });
  const { code, name, description, x, y, device_id } = req.body;
  let floor_plan_id = existing.floor_plan_id;
  let devId = existing.device_id;
  if (device_id !== undefined && device_id !== existing.device_id) {
    const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(device_id);
    if (!dev) return res.status(404).json({ error: '找不到所屬設備' });
    devId = device_id;
    floor_plan_id = dev.floor_plan_id;
  }
  db.prepare(`
    UPDATE circuits
    SET code = ?, name = ?, description = ?, x = ?, y = ?, device_id = ?, floor_plan_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    code ?? existing.code,
    name ?? existing.name,
    description ?? existing.description,
    x === undefined ? existing.x : x,
    y === undefined ? existing.y : y,
    devId,
    floor_plan_id,
    req.params.id
  );
  const row = db.prepare(`${circuitSelect} WHERE c.id = ?`).get(req.params.id);
  res.json(row);
});

app.delete('/api/circuits/:id', (req, res) => {
  db.prepare('DELETE FROM circuits WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Device Types ----------
app.get('/api/device-types', (req, res) => {
  const rows = db.prepare(`
    SELECT dt.*,
      (SELECT COUNT(*) FROM devices d WHERE d.type = dt.name) AS device_count
    FROM device_types dt
    ORDER BY dt.id
  `).all();
  res.json(rows);
});

app.post('/api/device-types', (req, res) => {
  const { name, icon = '📍', circuit_count = 1 } = req.body;
  if (!name) return res.status(400).json({ error: '請填寫類型名稱' });
  try {
    const info = db.prepare(`
      INSERT INTO device_types (name, icon, circuit_count) VALUES (?, ?, ?)
    `).run(name, icon, Math.max(1, Number(circuit_count) || 1));
    const row = db.prepare('SELECT * FROM device_types WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: '類型名稱已存在' });
  }
});

app.put('/api/device-types/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM device_types WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '找不到類型' });
  const { name, icon, circuit_count } = req.body;
  try {
    db.prepare(`
      UPDATE device_types
      SET name = ?, icon = ?, circuit_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? existing.name,
      icon ?? existing.icon,
      circuit_count === undefined ? existing.circuit_count : Math.max(1, Number(circuit_count) || 1),
      req.params.id
    );
    const row = db.prepare('SELECT * FROM device_types WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: '類型名稱已存在' });
  }
});

app.delete('/api/device-types/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM device_types WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '找不到類型' });
  db.prepare('DELETE FROM device_types WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Export / Import ----------
function extToMime(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
  return map[ext] || 'application/octet-stream';
}

app.get('/api/export', (req, res) => {
  const { floorPlanId } = req.query;
  const data = {
    app: 'floorplan-device-mvp',
    version: 1,
    exportedAt: new Date().toISOString(),
    deviceTypes: [],
    floorPlans: []
  };
  const usedTypes = new Set();
  const fps = floorPlanId
    ? db.prepare('SELECT * FROM floor_plans WHERE id = ?').all(floorPlanId)
    : db.prepare('SELECT * FROM floor_plans ORDER BY id').all();

  for (const fp of fps) {
    const devices = db.prepare('SELECT * FROM devices WHERE floor_plan_id = ? ORDER BY id').all(fp.id);
    const circuits = db.prepare('SELECT * FROM circuits WHERE floor_plan_id = ? ORDER BY id').all(fp.id);
    devices.forEach((d) => usedTypes.add(d.type));

    let image = null;
    let imageMime = null;
    if (fp.image_path) {
      const filePath = path.join(uploadsDir, path.basename(fp.image_path));
      try {
        image = fs.readFileSync(filePath).toString('base64');
        imageMime = extToMime(fp.image_path);
      } catch (_) { /* ignore */ }
    }

    const deviceList = devices.map((d, idx) => ({
      idx,
      name: d.name, code: d.code, type: d.type, note: d.note, x: d.x, y: d.y
    }));
    const circuitList = circuits.map((c) => {
      const deviceIdx = devices.findIndex((d) => d.id === c.device_id);
      return {
        code: c.code, name: c.name, description: c.description,
        device_type: c.device_type, x: c.x, y: c.y,
        deviceIdx: deviceIdx >= 0 ? deviceIdx : null
      };
    });
    data.floorPlans.push({
      name: fp.name, floor: fp.floor, area: fp.area,
      image, imageMime, devices: deviceList, circuits: circuitList
    });
  }

  const allTypes = db.prepare('SELECT name, icon, circuit_count FROM device_types ORDER BY id').all();
  data.deviceTypes = floorPlanId ? allTypes.filter((t) => usedTypes.has(t.name)) : allTypes;

  res.setHeader('Content-Disposition', `attachment; filename="floorplan-export-${Date.now()}.json"`);
  res.json(data);
});

app.post('/api/import', (req, res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.floorPlans)) {
    return res.status(400).json({ error: '格式錯誤：不是有效的備份檔' });
  }
  const upsertType = db.prepare(
    'INSERT OR IGNORE INTO device_types (name, icon, circuit_count) VALUES (?, ?, ?)'
  );
  for (const t of data.deviceTypes || []) {
    upsertType.run(t.name, t.icon || '📍', Math.max(1, Number(t.circuit_count) || 1));
  }

  const insFp = db.prepare(
    'INSERT INTO floor_plans (name, floor, area, image_path) VALUES (?, ?, ?, ?)'
  );
  const insDev = db.prepare(
    'INSERT INTO devices (floor_plan_id, name, code, type, note, x, y) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insCirc = db.prepare(
    'INSERT INTO circuits (floor_plan_id, device_id, code, name, description, device_type, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  let imported = 0;
  for (const fp of data.floorPlans) {
    let imagePath = '';
    if (fp.image) {
      try {
        const buf = Buffer.from(fp.image, 'base64');
        const ext = (fp.imageMime || 'image/png').split('/')[1] || 'png';
        const filename = `fp_${Date.now()}_${Math.round(Math.random() * 1e9)}.${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), buf);
        imagePath = `/uploads/${filename}`;
      } catch (_) { imagePath = ''; }
    }
    const fpInfo = insFp.run(fp.name || '匯入平面圖', fp.floor || '', fp.area || '', imagePath);
    const newFpId = fpInfo.lastInsertRowid;

    const idMap = new Map();
    for (const d of fp.devices || []) {
      const info = insDev.run(newFpId, d.name, d.code || '', d.type || '一般設備', d.note || '', d.x, d.y);
      idMap.set(d.idx, info.lastInsertRowid);
    }
    for (const c of fp.circuits || []) {
      const devId = c.deviceIdx != null ? idMap.get(c.deviceIdx) : null;
      insCirc.run(newFpId, devId, c.code, c.name || '', c.description || '', c.device_type || '', c.x, c.y);
    }
    imported++;
  }
  res.json({ ok: true, imported });
});

// ---------- serve built frontend (if present) so the app can run standalone ----------
const distDir = path.join(__dirname, '..', 'client', 'dist');
const distIndex = path.join(distDir, 'index.html');
app.use(express.static(distDir));
app.get(/^(?!\/(api|uploads))/, (req, res) => {
  if (fs.existsSync(distIndex)) res.sendFile(distIndex);
  else res.status(404).send('前端尚未建置：請先執行 npm run build');
});

// ---------- error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '伺服器錯誤' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
