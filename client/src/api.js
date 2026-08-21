const BASE = '';

async function handle(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // floor plans
  listFloorPlans: () => fetch(`${BASE}/api/floorplans`).then(handle),
  getFloorPlan: (id) => fetch(`${BASE}/api/floorplans/${id}`).then(handle),
  createFloorPlan: (formData) =>
    fetch(`${BASE}/api/floorplans`, { method: 'POST', body: formData }).then(handle),
  updateFloorPlan: (id, data) =>
    fetch(`${BASE}/api/floorplans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  deleteFloorPlan: (id) =>
    fetch(`${BASE}/api/floorplans/${id}`, { method: 'DELETE' }).then(handle),

  // devices
  listDevices: (floorPlanId) =>
    fetch(`${BASE}/api/floorplans/${floorPlanId}/devices`).then(handle),
  createDevice: (floorPlanId, data) =>
    fetch(`${BASE}/api/floorplans/${floorPlanId}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  updateDevice: (id, data) =>
    fetch(`${BASE}/api/devices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  deleteDevice: (id) =>
    fetch(`${BASE}/api/devices/${id}`, { method: 'DELETE' }).then(handle),

  // device types
  listDeviceTypes: () => fetch(`${BASE}/api/device-types`).then(handle),
  createDeviceType: (data) =>
    fetch(`${BASE}/api/device-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  updateDeviceType: (id, data) =>
    fetch(`${BASE}/api/device-types/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  deleteDeviceType: (id) =>
    fetch(`${BASE}/api/device-types/${id}`, { method: 'DELETE' }).then(handle),

  // circuits
  listCircuits: (floorPlanId) =>
    fetch(`${BASE}/api/circuits${floorPlanId ? `?floorPlanId=${floorPlanId}` : ''}`).then(handle),
  createCircuit: (data) =>
    fetch(`${BASE}/api/circuits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  updateCircuit: (id, data) =>
    fetch(`${BASE}/api/circuits/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle),
  deleteCircuit: (id) =>
    fetch(`${BASE}/api/circuits/${id}`, { method: 'DELETE' }).then(handle),

  // export / import
  exportData: (floorPlanId) =>
    fetch(`${BASE}/api/export${floorPlanId ? `?floorPlanId=${floorPlanId}` : ''}`).then(handle),
  importData: (data) =>
    fetch(`${BASE}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handle)
};
