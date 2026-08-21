import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import DeviceGroupModal from './DeviceGroupModal.jsx';
import DeviceEditor from './DeviceEditor.jsx';
import CircuitManager from './CircuitManager.jsx';
import CircuitPlacement from './CircuitPlacement.jsx';
import DeviceTypeManager from './DeviceTypeManager.jsx';
import { toast } from '../toast.js';

function roundCoord(v) {
  return Math.round(v * 1000) / 1000;
}

function groupKey(d) {
  return `${d.type}__${roundCoord(d.x)}__${roundCoord(d.y)}`;
}

export default function FloorPlanView({ floorPlan, onBack }) {
  const [devices, setDevices] = useState([]);
  const [circuits, setCircuits] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);
  const [selectedCircuit, setSelectedCircuit] = useState('');
  const [sidePanel, setSidePanel] = useState(''); // '' | 'circuit-manage' | 'type-manage'
  const [showCircuitLabels, setShowCircuitLabels] = useState(true);
  const [layerMode, setLayerMode] = useState('device'); // 'device' | 'circuit'
  const [armedCircuitId, setArmedCircuitId] = useState('');
  const [circuitEditRequest, setCircuitEditRequest] = useState(null);
  const [groupModal, setGroupModal] = useState(null);
  const [addingAt, setAddingAt] = useState(null);
  const [editingDevice, setEditingDevice] = useState(null);
  const [error, setError] = useState('');
  const imageRef = useRef(null);

  // ---- zoom / pan ----
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 8;
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const activeGestureRef = useRef(false);

  function setScaleState(v) { scaleRef.current = v; setScale(v); }
  function setPanState(p) { panRef.current = p; setPan(p); }

  function relPos(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // anchor zoom so the content point under (cx, cy) stays put
  function zoomAt(cx, cy, targetScale) {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));
    const factor = s / scaleRef.current;
    const cur = panRef.current;
    setScaleState(s);
    setPanState({ x: cx - factor * (cx - cur.x), y: cy - factor * (cy - cur.y) });
  }

  function handleWheel(e) {
    const { x, y } = relPos(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    zoomAt(x, y, scaleRef.current * factor);
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;
    if (!activeGestureRef.current) {
      activeGestureRef.current = true;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerEnd);
      window.addEventListener('pointercancel', handlePointerEnd);
    }
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        prevDist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        prevMidX: (p1.x + p2.x) / 2,
        prevMidY: (p1.y + p2.y) / 2
      };
      dragRef.current = null;
    }
  }

  function handlePointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const rect = canvasRef.current.getBoundingClientRect();
      const anchorX = pinchRef.current.prevMidX - rect.left;
      const anchorY = pinchRef.current.prevMidY - rect.top;
      const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleRef.current * (dist / pinchRef.current.prevDist)));
      const factor = targetScale / scaleRef.current;
      const cur = panRef.current;
      const newPanX = anchorX - factor * (anchorX - cur.x) + (midX - pinchRef.current.prevMidX);
      const newPanY = anchorY - factor * (anchorY - cur.y) + (midY - pinchRef.current.prevMidY);
      setScaleState(targetScale);
      setPanState({ x: newPanX, y: newPanY });
      pinchRef.current = { prevDist: dist, prevMidX: midX, prevMidY: midY };
      movedRef.current = true;
      setDragging(true);
    } else if (pointersRef.current.size === 1 && dragRef.current) {
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        dragRef.current.moved = true;
        movedRef.current = true;
        setDragging(true);
      }
      const cur = panRef.current;
      setPanState({ x: cur.x + dx, y: cur.y + dy });
    }
  }

  function handlePointerEnd(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      const [p] = [...pointersRef.current.values()];
      dragRef.current = { x: p.x, y: p.y, moved: movedRef.current };
    } else if (pointersRef.current.size === 0) {
      dragRef.current = null;
      activeGestureRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      setDragging(false);
    }
  }

  function resetZoom() { setScaleState(1); setPanState({ x: 0, y: 0 }); }

  function zoomByButton(factor) {
    const rect = canvasRef.current.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, scaleRef.current * factor);
  }

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => { e.preventDefault(); handleWheel(e); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const [d, c, t] = await Promise.all([
        api.listDevices(floorPlan.id),
        api.listCircuits(floorPlan.id),
        api.listDeviceTypes()
      ]);
      setDevices(d);
      setCircuits(c);
      setDeviceTypes(t);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPlan.id]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const d of devices) {
      const key = groupKey(d);
      if (!map.has(key)) {
        map.set(key, { type: d.type, x: d.x, y: d.y, devices: [], floorPlanId: floorPlan.id });
      }
      map.get(key).devices.push(d);
    }
    return [...map.values()];
  }, [devices, floorPlan.id]);

  const placedCircuits = useMemo(() => {
    const withPos = circuits.filter((c) => typeof c.x === 'number' && typeof c.y === 'number');
    if (!selectedCircuit) return withPos;
    return withPos.filter((c) => String(c.id) === String(selectedCircuit));
  }, [circuits, selectedCircuit]);

  const armedCircuit = useMemo(
    () => circuits.find((c) => String(c.id) === String(armedCircuitId)) || null,
    [circuits, armedCircuitId]
  );

  const circuitColors = ['#059669', '#7c3aed', '#db2777', '#d97706', '#0891b2', '#dc2626', '#4f46e5'];

  function circuitColor(c) {
    let h = 0;
    for (const ch of String(c.id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return circuitColors[h % circuitColors.length];
  }

  function getPosition(e) {
    const rect = imageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: roundCoord(Math.min(1, Math.max(0, x))), y: roundCoord(Math.min(1, Math.max(0, y))) };
  }

  async function handleImageClick(e) {
    if (movedRef.current) return; // ignore after a pan/pinch gesture
    if (e.target !== imageRef.current) return;
    const pos = getPosition(e);
    if (!pos) return;
    if (layerMode === 'circuit') {
      if (!armedCircuit) {
        toast('請先在左側選擇要放置的迴路', 'error');
        return;
      }
      try {
        const c = armedCircuit;
        await api.updateCircuit(c.id, { x: pos.x, y: pos.y });
        await load();
        toast(`已放置 ${c.code}`);
        // auto-advance to the next unplaced circuit of the same device (excluding the one just placed)
        const next = circuits.find(
          (cc) => cc.id !== c.id &&
            String(cc.device_id) === String(c.device_id) &&
            !(typeof cc.x === 'number' && typeof cc.y === 'number')
        );
        setArmedCircuitId(next ? next.id : '');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }
    setAddingAt(pos);
  }

  function armCircuit(c) {
    const placed = typeof c.x === 'number' && typeof c.y === 'number';
    if (placed) {
      if (!window.confirm(`迴路「${c.code}」已放置在 (${Number(c.x).toFixed(2)}, ${Number(c.y).toFixed(2)})。確定移動到新位置？`)) return;
    }
    setArmedCircuitId(c.id);
    toast(`將放置：${c.code}`);
  }

  async function saveNewDevice(payload) {
    await api.createDevice(floorPlan.id, {
      ...payload,
      x: addingAt.x,
      y: addingAt.y
    });
  }

  async function saveEditedDevice(payload) {
    await api.updateDevice(editingDevice.id, payload);
    setEditingDevice(null);
    await load();
  }

  async function removeDevice(device) {
    const circuitCount = circuits.filter((c) => String(c.device_id) === String(device.id)).length;
    const msg = circuitCount > 0
      ? `確定刪除設備「${device.name}」？其 ${circuitCount} 個迴路（含放置位置）也會一併刪除。`
      : `確定刪除設備「${device.name}」？`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteDevice(device.id);
      setEditingDevice(null);
      await load();
      toast(`已刪除 ${device.name}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="view-page">
      <header className="topbar view-topbar">
        <button className="btn" onClick={onBack}>← 返回</button>
        <h1>{floorPlan.name}</h1>
        <div className="topbar-right">
          <div className="layer-switch">
            <button
              className={`btn small ${layerMode === 'device' ? 'active' : ''}`}
              onClick={() => setLayerMode('device')}
            >設備</button>
            <button
              className={`btn small ${layerMode === 'circuit' ? 'active' : ''}`}
              onClick={() => setLayerMode('circuit')}
            >迴路</button>
          </div>
          <select
            value={selectedCircuit}
            onChange={(e) => setSelectedCircuit(e.target.value)}
            className="circuit-filter"
          >
            <option value="">全部迴路</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>{c.code}{c.name ? ` ${c.name}` : ''}</option>
            ))}
          </select>
            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={showCircuitLabels}
                onChange={(e) => setShowCircuitLabels(e.target.checked)}
              />
              迴路標籤
            </label>
          <button
            className="btn"
            onClick={() => {
              if (sidePanel === 'circuit-manage') setCircuitEditRequest(null);
              setSidePanel(sidePanel === 'circuit-manage' ? '' : 'circuit-manage');
            }}
          >
            迴路管理
          </button>
            <button
              className="btn"
              onClick={() => setSidePanel(sidePanel === 'type-manage' ? '' : 'type-manage')}
            >
              設備類型
            </button>
        </div>
      </header>

      {error && <div className="error bar">{error}</div>}

      <div className="workspace">
        <div className="canvas-wrap">
          <div className="canvas-hint">
            {layerMode === 'circuit'
              ? '迴路圖層：在左側選一個迴路，再點平面圖把它放到負載位置。'
              : '設備圖層：點擊平面圖即可新增設備；點設備可編輯。'}
          </div>
          <div
            className={`canvas${dragging ? ' dragging' : ''}`}
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div
              className="canvas-zoom"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
              <img
                ref={imageRef}
                src={floorPlan.image_path}
                alt={floorPlan.name}
                className="floor-image"
                onClick={handleImageClick}
                draggable={false}
              />
              {groups.map((g) => (
                <button
                  key={groupKey(g)}
                  className={`device-marker type-${g.type}`}
                  style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%` }}
                  onClick={() => { if (movedRef.current) return; setGroupModal(g); }}
                  title={g.devices.map((d) => d.name).join('\n')}
                >
                  <span className="marker-icon">{deviceTypes.find((t) => t.name === g.type)?.icon || '📍'}</span>
                  {g.devices.length > 1 && <span className="marker-count">{g.devices.length}</span>}
                </button>
              ))}
              {showCircuitLabels && placedCircuits.map((c) => (
                <button
                  key={c.id}
                  className="circuit-marker"
                  style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, background: circuitColor(c) }}
                  onClick={() => {
                    if (movedRef.current) return;
                    setSidePanel('circuit-manage');
                    setCircuitEditRequest({ id: c.id, ts: Date.now() });
                  }}
                  title={`${c.device_name ? c.device_name + ' ' : ''}${c.code}`}
                >
                  <span className="circuit-marker-code">{c.code}</span>
                </button>
              ))}
            </div>
            <div className="zoom-controls">
              <button className="btn small" onClick={() => zoomByButton(1.35)} title="放大">＋</button>
              <button className="btn small" onClick={() => zoomByButton(1 / 1.35)} title="縮小">−</button>
              <button className="btn small" onClick={resetZoom} title="重設">↺</button>
              <span className="zoom-percent">{Math.round(scale * 100)}%</span>
            </div>
          </div>
        </div>

        {layerMode === 'circuit' && sidePanel === '' && (
          <CircuitPlacement
            circuits={circuits}
            devices={devices}
            armedId={armedCircuitId}
            onArm={armCircuit}
            onOpenManager={() => setSidePanel('circuit-manage')}
          />
        )}

        {sidePanel === 'circuit-manage' && (
          <aside className="side-panel">
            <CircuitManager circuits={circuits} devices={devices} onChanged={load} floorPlanId={floorPlan.id} editRequest={circuitEditRequest} />
          </aside>
        )}

        {sidePanel === 'type-manage' && (
          <aside className="side-panel">
            <DeviceTypeManager deviceTypes={deviceTypes} onChanged={load} />
          </aside>
        )}
      </div>

      {addingAt && (
        <DeviceEditor
          deviceTypes={deviceTypes}
          onSave={saveNewDevice}
          onClose={() => { setAddingAt(null); load(); }}
          existingDevices={devices}
          position={addingAt}
        />
      )}

      {groupModal && (
        <DeviceGroupModal
          group={groupModal}
          deviceTypes={deviceTypes}
          onClose={() => setGroupModal(null)}
          onChanged={async () => { await load(); setGroupModal(null); }}
          existingDevices={devices}
        />
      )}

      {editingDevice && (
        <DeviceEditor
          device={editingDevice}
          deviceTypes={deviceTypes}
          onSave={saveEditedDevice}
          onClose={() => setEditingDevice(null)}
          existingDevices={devices}
        />
      )}
    </div>
  );
}
