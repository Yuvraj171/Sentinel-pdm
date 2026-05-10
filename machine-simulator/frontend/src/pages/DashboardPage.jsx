// Dashboard page — frame for both Operator and Maintenance views. Tab state
// is mirrored into the URL via ?tab=operator|maintenance so links land on the
// right view (operator default, matching the landing-page CTA).

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import BackgroundMesh from '../components/BackgroundMesh.jsx';
import HeaderBar from '../components/HeaderBar.jsx';
import TabBar from '../components/TabBar.jsx';
import InjectFailureButton from '../components/InjectFailureButton.jsx';
import TourBanner from '../components/TourBanner.jsx';
import OperatorTab from '../views/OperatorTab.jsx';
import MaintenanceTab from '../views/MaintenanceTab.jsx';
import PlantTab from '../views/PlantTab.jsx';
import { useProduction } from '../lib/api.js';
import { markVisited, loadSavedTab, saveTab } from '../lib/visited.js';

const DEFAULT_ACCENT = '#06b6d4';
const DEFAULT_INTENSITY = 'full';

function resolveInitialTab(params) {
  // URL wins (so card links from landing always land on the right view).
  // Otherwise fall back to the last-used tab, then 'plant' (the new default
  // for plant-head/supervisor users — cumulative roll-up across departments).
  const url = params.get('tab');
  if (url === 'plant' || url === 'operator' || url === 'maintenance') return url;
  return loadSavedTab() ?? 'plant';
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTabState] = useState(() => resolveInitialTab(params));

  // If we picked the tab from saved prefs (URL was empty), reflect it back
  // into the URL once on mount so a hard-refresh stays put.
  useEffect(() => {
    if (params.get('tab') !== tab) {
      const p = new URLSearchParams(params);
      p.set('tab', tab);
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = (next) => {
    setTabState(next);
    saveTab(next);
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  // Header reads production stats for the uptime/parts-per-hour pills.
  const prodQ = useProduction();

  // Reflect accent in CSS var + remember they've seen the dashboard so
  // future visits to `/` skip the tour.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', DEFAULT_ACCENT);
    markVisited();
  }, []);

  return (
    <div className="app">
      <BackgroundMesh accent={DEFAULT_ACCENT} intensity={DEFAULT_INTENSITY} />
      <HeaderBar accent={DEFAULT_ACCENT} production={prodQ.data} />
      <TabBar tab={tab} onChange={setTab} />
      <main className="main-stage">
        <TourBanner />
        {tab === 'plant'       && <PlantTab accent={DEFAULT_ACCENT} />}
        {tab === 'operator'    && <OperatorTab accent={DEFAULT_ACCENT} />}
        {tab === 'maintenance' && <MaintenanceTab accent={DEFAULT_ACCENT} intensity={DEFAULT_INTENSITY} />}
      </main>

      {/* Demo control gated to engineer/operator personas. The Plant tab is
          a roll-up view for plant heads — they shouldn't see a "simulate
          a failure" affordance. */}
      {tab !== 'plant' && <InjectFailureButton />}

    </div>
  );
}
