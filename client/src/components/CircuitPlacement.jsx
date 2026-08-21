import { useMemo } from 'react';

export default function CircuitPlacement({ circuits, devices, armedId, onArm, onOpenManager }) {
  const groups = useMemo(() => {
    return devices
      .map((d) => ({
        ...d,
        circuits: circuits.filter((c) => String(c.device_id) === String(d.id))
      }))
      .filter((d) => d.circuits.length > 0);
  }, [devices, circuits]);

  const unplacedCount = circuits.filter(
    (c) => !(typeof c.x === 'number' && typeof c.y === 'number')
  ).length;
  const armed = circuits.find((c) => String(c.id) === String(armedId)) || null;

  return (
    <aside className="side-panel circuit-placement">
      <div className="circuit-header">
        <h3>放置迴路</h3>
        <span className="badge">未放置 {unplacedCount}</span>
      </div>

      {armed ? (
        <div className="armed-hint">
          將放置：<strong>{armed.device_name ? `${armed.device_name} / ` : ''}{armed.code}</strong>
        </div>
      ) : (
        <div className="muted hint">點下方一個迴路，再點平面圖把它放到負載位置。</div>
      )}

      {groups.length === 0 && <p className="muted">尚無迴路。可點下方「迴路管理」建立。</p>}

      {groups.map((d) => (
        <div key={d.id} className="placement-device">
          <div className="placement-device-name">
            {d.name}{d.code ? ` (${d.code})` : ''}
          </div>
          <ul className="circuit-list">
            {d.circuits.map((c) => {
              const placed = typeof c.x === 'number' && typeof c.y === 'number';
              const isArmed = String(c.id) === String(armedId);
              return (
                <li key={c.id} className={`circuit-item placement-row${isArmed ? ' armed' : ''}`}>
                  <button className="circuit-main placement-btn" onClick={() => onArm(c)}>
                    <div className="circuit-code">
                      {c.code}
                      {c.name && <span className="muted"> {c.name}</span>}
                    </div>
                    <div className="circuit-meta">
                      {placed
                        ? <span>已放置 ({Number(c.x).toFixed(2)}, {Number(c.y).toFixed(2)})</span>
                        : <span className="muted">未放置</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <button className="btn small full" onClick={onOpenManager}>＋ 迴路管理</button>
    </aside>
  );
}
