import { useRef, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';

export default function FloorPlanList({ floorPlans, onSelect, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');
  const [image, setImage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const importInputRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('name', name);
      form.append('floor', floor);
      form.append('area', area);
      if (image) form.append('image', image);
      if (editing) {
        await api.updateFloorPlan(editing.id, { name, floor, area });
      } else {
        if (!image) throw new Error('請選擇平面圖圖片');
        await api.createFloorPlan(form);
      }
      setShowForm(false);
      setEditing(null);
      setName(''); setFloor(''); setArea(''); setImage(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(fp) {
    if (!window.confirm(`確定刪除「${fp.name}」？底下的設備也會一併刪除。`)) return;
    try {
      await api.deleteFloorPlan(fp.id);
      onChanged();
      toast(`已刪除「${fp.name}」`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function startEdit(fp) {
    setEditing(fp);
    setName(fp.name);
    setFloor(fp.floor || '');
    setArea(fp.area || '');
    setImage(null);
    setShowForm(true);
  }

  function downloadExport(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function exportAll() {
    downloadExport('/api/export', 'floorplan-export.json');
    toast('已開始匯出全部平面圖');
  }

  function exportOne(fp) {
    downloadExport(`/api/export?floorPlanId=${fp.id}`, `${fp.name || 'floorplan'}.json`);
    toast(`已開始匯出「${fp.name}」`);
  }

  async function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api.importData(data);
      toast(`已匯入 ${res.imported} 個平面圖`);
      onChanged();
    } catch (err) {
      toast(err.message || '匯入失敗', 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>🏢 平面圖設備標註</h1>
        <div className="topbar-right">
          <button className="btn" onClick={exportAll}>匯出全部</button>
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            ref={importInputRef}
            onChange={handleImportFile}
          />
          <button className="btn" onClick={() => importInputRef.current?.click()} disabled={importing}>
            {importing ? '匯入中…' : '匯入'}
          </button>
          <button className="btn primary" onClick={() => { setEditing(null); setName(''); setFloor(''); setArea(''); setImage(null); setShowForm(true); }}>
            ＋ 新增平面圖
          </button>
        </div>
      </header>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>{editing ? '編輯平面圖' : '新增平面圖'}</h2>
            {error && <div className="error">{error}</div>}
            <label>名稱 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="例如：一樓平面圖" />
            <label>樓層</label>
            <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="例如：1F" />
            <label>區域</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例如：A 區" />
            {!editing && (
              <>
                <label>平面圖圖片 *</label>
                <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0] || null)} />
              </>
            )}
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => setShowForm(false)}>取消</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid">
        {floorPlans.length === 0 && (
          <div className="empty">還沒有平面圖，請按「新增平面圖」開始。</div>
        )}
        {floorPlans.map((fp) => (
          <div key={fp.id} className="card floor-card" onClick={() => onSelect(fp)}>
            <div className="thumb">
              {fp.image_path ? <img src={fp.image_path} alt={fp.name} /> : <div>無圖片</div>}
            </div>
            <div className="floor-info">
              <div className="floor-name">{fp.name}</div>
              <div className="floor-meta">
                {fp.floor && <span>{fp.floor}</span>}
                {fp.area && <span>{fp.area}</span>}
                <span>設備：{fp.device_count ?? 0}</span>
              </div>
            </div>
            <div className="card-actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn small" onClick={() => onSelect(fp)}>開啟</button>
              <button className="btn small" onClick={() => exportOne(fp)}>匯出</button>
              <button className="btn small" onClick={() => startEdit(fp)}>編輯</button>
              <button className="btn small danger" onClick={() => remove(fp)}>刪除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
