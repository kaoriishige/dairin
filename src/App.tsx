import { useState } from 'react';
import { DemoPage } from './pages/DemoPage/DemoPage';
import { AdminPage } from './pages/AdminPage/AdminPage';

export function App() {
  const [view, setView] = useState<'demo' | 'admin'>(() =>
    window.location.pathname.startsWith('/admin') ? 'admin' : 'demo'
  );

  const navigate = (next: 'demo' | 'admin') => {
    setView(next);
    const targetPath = next === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  if (view === 'admin') {
    return <AdminPage onBackToDemo={() => navigate('demo')} />;
  }

  return <DemoPage onOpenAdmin={() => navigate('admin')} />;
}

export default App;
