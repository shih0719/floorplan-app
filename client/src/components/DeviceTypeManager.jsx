import { useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';

export default function DeviceTypeManager({ deviceTypes, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📍');
  const [circuitCount, setCircuitCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setEditing(null);
    setName('');
    setIcon('📍');
    setCircuitCount(1);
    setError('');
  }

  function startAdd() {
    reset();
    setShowForm(true);
  }

  function startEdit(t) {
    setEditing(t);
    setName(t.name);
    setIcon(t.icon || '📍');
    setCircuitCount(t.circuit_count ?? 1);
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('請填寫類型名稱');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = { name: name.trim(), icon: icon.trim() || '📍', circuit_count: Math.max(1, Number(circuitCount) || 1) };
      if (editing) await api.updateDeviceType(editing.id, payload);
      else await api.createDeviceType(payload);
      setShowForm(false);
      reset();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(t) {
    if (!window.confirm(`確定刪除類型「${t.name}」？既有設備仍會保留該類型名稱。`)) return;
    try {
      await api.deleteDeviceType(t.id);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="circuit-manager">
      <div className="circuit-header">
        <h3>設備類型管理</h3>
        <button className="btn small primary" onClick={startAdd}>＋ 新增</button>
      </div>

      {showForm && (
        <form className="card inner-form" onSubmit={submit}>
          {error && <div className="error">{error}</div>}
          <label>類型名稱 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：冷氣" />
          <label>Icon（Emoji）</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="例如：❄️" />
          <label>迴路數量</label>
          <input
            type="number"
            min="1"
            max="100"
            value={circuitCount}
            onChange={(e) => setCircuitCount(e.target.value)}
            placeholder="例如：3"
          />
          <div className="muted hint">新增此類型設備時，會自動建立對應數量的迴路</div>
          <div className="row-actions">
            <button type="button" className="btn small" onClick={() => { setShowForm(false); reset(); }}>取消</button>
            <button type="submit" className="btn small primary" disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </form>
      )}

      <ul className="circuit-list">
        {deviceTypes.length === 0 && <li className="muted">尚未建立類型</li>}
        {deviceTypes.map((t) => (
          <li key={t.id} className="circuit-item">
            <div className="circuit-main" onClick={() => startEdit(t)}>
              <div className="circuit-code">
                <span className="type-icon">{t.icon || '📍'}</span> {t.name}
              </div>
              <div className="circuit-meta">
                <span className="badge">{t.device_count ?? 0} 台設備</span>
                  <span className="badge">{t.circuit_count ?? 1} 個迴路</span>
              </div>
            </div>
            <div className="circuit-actions">
              <button className="btn small" onClick={() => startEdit(t)}>編輯</button>
              <button className="btn small danger" onClick={() => remove(t)}>刪除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
