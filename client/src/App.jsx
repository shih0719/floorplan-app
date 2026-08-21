import { useEffect, useState } from 'react';
import { api } from './api.js';
import FloorPlanList from './components/FloorPlanList.jsx';
import FloorPlanView from './components/FloorPlanView.jsx';
import Toaster from './components/Toaster.jsx';

export default function App() {
  const [floorPlans, setFloorPlans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadFloorPlans() {
    try {
      const data = await api.listFloorPlans();
      setFloorPlans(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFloorPlans();
  }, []);

  if (selected) {
    return (
      <FloorPlanView
        floorPlan={selected}
        onBack={() => {
          setSelected(null);
          loadFloorPlans();
        }}
      />
    );
  }

  return (
    <div>
      {error && <div className="error bar">{error}</div>}
      {loading ? (
        <div className="loading">載入中…</div>
      ) : (
        <FloorPlanList
          floorPlans={floorPlans}
          onSelect={setSelected}
          onChanged={loadFloorPlans}
        />
      )}
      <Toaster />
    </div>
  );
}
