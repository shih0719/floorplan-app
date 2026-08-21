import { useEffect, useState } from 'react';

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    function onToast(e) {
      const item = e.detail;
      setItems((list) => [...list, item]);
      setTimeout(() => {
        setItems((list) => list.filter((i) => i.id !== item.id));
      }, 3000);
    }
    window.addEventListener('app-toast', onToast);
    return () => window.removeEventListener('app-toast', onToast);
  }, []);

  return (
    <div className="toaster" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast toast-${i.type}`}>{i.message}</div>
      ))}
    </div>
  );
}
