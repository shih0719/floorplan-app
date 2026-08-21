import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';

function coordLabel(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Number(v).toFixed(2) : '';
}

export default function CircuitManager({ circuits, devices, onChanged, floorPlanId, editRequest = null }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editRequest) {
      const c = circuits.find((x) => String(x.id) === String(editRequest.id));
      if (c) startEdit(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  function reset() {
    setEditing(null);
    setDeviceId('');
    setCode('');
    setName('');
    setDescription('');
    setX('');
    setY('');
    setError('');
  }

  function startAdd() {
    reset();
    setShowForm(true);
  }

  function startEdit(c) {
    setEditing(c);
    setDeviceId(String(c.device_id ?? ''));
    setCode(c.code);
    setName(c.name || '');
    setDescription(c.description || '');
    setX(coordLabel(c.x));
    setY(coordLabel(c.y));
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!code.trim()) {
      setError('請填寫迴路編號');
      return;
    }
    if (!deviceId) {
      setError('請選擇所屬設備');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        device_id: Number(deviceId)
      };
      if (x !== '') payload.x = Number(x);
      if (y !== '') payload.y = Number(y);
      if (editing) await api.updateCircuit(editing.id, payload);
      else await api.createCircuit(payload);
      setShowForm(false);
      reset();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`確定刪除迴路「${c.code}」？`)) return;
    try {
      await api.deleteCircuit(c.id);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="circuit-manager">
      <div className="circuit-header">
        <h3>迴路管理</h3>
        <button className="btn small primary" onClick={startAdd}>＋ 新增</button>
      </div>

      <p className="muted hint">
        迴路從屬於設備：建立設備時會自動產生迴路；可在平面圖「迴路圖層」把迴路放到其負載位置。
      </p>

      {showForm && (
        <form className="card inner-form" onSubmit={submit}>
          {error && <div className="error">{error}</div>}
          <label>所屬設備 *</label>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">選擇設備…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.code ? ` (${d.code})` : ''}
              </option>
            ))}
          </select>
          <label>迴路編號 *</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如：R-01" />
          <label>名稱</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：一樓插座" />
          <label>說明</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="說明…" />
          <div className="coord-fields">
            <div>
              <label>座標 X</label>
              <input type="number" step="0.01" min="0" max="1" value={x} onChange={(e) => setX(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label>座標 Y</label>
              <input type="number" step="0.01" min="0" max="1" value={y} onChange={(e) => setY(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="muted hint">通常到「迴路圖層」點平面圖放置，這裡可手動填座標。</div>
          <div className="row-actions">
            <button type="button" className="btn small" onClick={() => { setShowForm(false); reset(); }}>取消</button>
            <button type="submit" className="btn small primary" disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </form>
      )}

      <ul className="circuit-list">
        {circuits.length === 0 && <li className="muted">尚未建立迴路</li>}
        {circuits.map((c) => (
          <li key={c.id} className="circuit-item">
            <div className="circuit-main" onClick={() => startEdit(c)}>
              <div className="circuit-code">
                {c.code}
                {c.device_name && <span className="badge">{c.device_name}</span>}
              </div>
              <div className="circuit-meta">
                {c.device_code && <span>{c.device_code}</span>}
                {typeof c.x === 'number' && typeof c.y === 'number'
                  ? <span>已放置 ({coordLabel(c.x)}, {coordLabel(c.y)})</span>
                  : <span className="muted">未放置</span>}
              </div>
            </div>
            <div className="circuit-actions">
              <button className="btn small" onClick={() => startEdit(c)}>編輯</button>
              <button className="btn small danger" onClick={() => remove(c)}>刪除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
