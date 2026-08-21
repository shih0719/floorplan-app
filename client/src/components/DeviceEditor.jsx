import { useEffect, useState } from 'react';

const FALLBACK_TYPES = ['插座', '燈具', '開關', '馬達', '設備', '其他'];

function roundCoord(v) {
  return Math.round(v * 1000) / 1000;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nextNumberFor(type, existingDevices, x, y) {
  const re = new RegExp(`^${escapeRegExp(type)}(\\d+)$`);
  let max = 0;
  for (const d of existingDevices || []) {
    if (d.type !== type) continue;
    if (x !== undefined && y !== undefined) {
      if (roundCoord(d.x) !== roundCoord(x) || roundCoord(d.y) !== roundCoord(y)) continue;
    }
    const m = String(d.name || '').match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export default function DeviceEditor({ device, onSave, onClose, existingDevices = [], position = null, deviceTypes = [], initialType = null }) {
  const types = deviceTypes.length > 0 ? deviceTypes.map((t) => t.name) : FALLBACK_TYPES;
  const [name, setName] = useState(device?.name ?? '');
  const [code, setCode] = useState(device?.code ?? '');
  const [type, setType] = useState(device?.type ?? initialType ?? types[0] ?? '設備');
  const [note, setNote] = useState(device?.note ?? '');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (device) {
      setName(device.name ?? '');
      setCode(device.code ?? '');
      setType(device.type ?? types[0] ?? '設備');
      setNote(device.note ?? '');
      setQuantity(1);
    }
  }, [device]);

  async function submit(e) {
    e.preventDefault();
    const isNew = !device;
    const count = isNew ? Math.max(1, Math.floor(Number(quantity) || 1)) : 1;

    if (isNew) {
      if (!name.trim() && count === 1) {
        setError('請填寫設備名稱');
        return;
      }
    } else if (!name.trim()) {
      setError('請填寫設備名稱');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (isNew && count > 1) {
        let start = nextNumberFor(type, existingDevices, position?.x, position?.y);
        for (let i = 0; i < count; i++) {
          await onSave({
            name: `${type}${start + i}`,
            code: code.trim(),
            type,
            note: note.trim()
          });
        }
      } else {
        await onSave({
          name: (isNew && !name.trim() ? `${type}${nextNumberFor(type, existingDevices, position?.x, position?.y)}` : name.trim()),
          code: code.trim(),
          type,
          note: note.trim()
        });
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{device ? '編輯設備' : '新增設備'}</h2>
        {error && <div className="error">{error}</div>}
          {!device && (
            <>
              <label>數量</label>
              <input
                type="number"
                min="1"
                max="100"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="例如：3"
              />
              <div className="muted hint">輸入數量後，名稱會自動依類型建立，例如「燈具1、燈具2…」</div>
            </>
          )}
        <label>{device ? '設備名稱 *' : '設備名稱（可不填，會自動產生）'}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：插座-01" autoFocus />
        <label>設備編號</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如：S-001" />
        <label>設備類型</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
            {device && !types.includes(device.type) && <option value={device.type}>{device.type}</option>}
          {types.map((t) => {
              const dt = deviceTypes.find((x) => x.name === t);
              return <option key={t} value={t}>{dt?.icon ? `${dt.icon} ` : ''}{t}</option>;
            })}
        </select>
        <label>備註</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="備註…" />
        <div className="row-actions">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
        </div>
      </form>
    </div>
  );
}
