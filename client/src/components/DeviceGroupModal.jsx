import { useState } from 'react';
import DeviceEditor from './DeviceEditor.jsx';
import { api } from '../api.js';
import { toast } from '../toast.js';

export default function DeviceGroupModal({ group, onClose, onChanged, existingDevices = [], deviceTypes = [] }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveDevice(payload) {
    if (editing) {
      await api.updateDevice(editing.id, payload);
    } else {
      await api.createDevice(group.floorPlanId, {
        ...payload,
        x: group.x,
        y: group.y
      });
    }
  }

  async function remove(device) {
    if (!window.confirm(`確定刪除設備「${device.name}」？`)) return;
    setBusy(true);
    try {
      await api.deleteDevice(device.id);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {group.type}（{group.devices.length}）
            <span className="muted"> 座標 ({group.x.toFixed(2)}, {group.y.toFixed(2)})</span>
          </h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <button className="btn primary full" disabled={busy} onClick={() => { setAdding(true); setEditing(null); }}>
          ＋ 在此位置新增設備
        </button>

        <ul className="device-list">
          {group.devices.map((d) => (
            <li key={d.id} className="device-item">
              <div className="device-main" onClick={() => { setEditing(d); setAdding(false); }}>
                <div className="device-name">{d.name}</div>
                <div className="device-meta">
                  {d.code && <span>{d.code}</span>}
                  {d.note && <span className="muted">{d.note}</span>}
                </div>
              </div>
              <div className="device-actions">
                <button className="btn small" onClick={() => { setEditing(d); setAdding(false); }}>編輯</button>
                <button className="btn small danger" disabled={busy} onClick={() => remove(d)}>刪除</button>
              </div>
            </li>
          ))}
        </ul>

        {(editing || adding) && (
          <DeviceEditor
            device={editing}
            onSave={saveDevice}
            onClose={() => { setEditing(null); setAdding(false); onChanged(); }}
            existingDevices={existingDevices}
            deviceTypes={deviceTypes}
            initialType={group.type}
            position={adding ? { x: group.x, y: group.y } : null}
          />
        )}
      </div>
    </div>
  );
}
