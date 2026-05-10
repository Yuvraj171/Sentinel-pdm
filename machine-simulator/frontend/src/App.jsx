import { Routes, Route, Navigate } from 'react-router-dom';

import LandingPage from './pages/LandingPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { hasVisited } from './lib/visited.js';

// Smart root: first-time visitors get the landing tour, repeat visitors land
// straight in the dashboard. The flag is set when they either click a CTA on
// the tour or land on /dashboard directly.
function SmartRoot() {
  return <Navigate to={hasVisited() ? '/dashboard' : '/about'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SmartRoot />} />
      <Route path="/about" element={<LandingPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
