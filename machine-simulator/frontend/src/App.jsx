import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Gauge from './components/Gauge';
import LiveChart from './components/LiveChart';
import ControlPanel from './components/ControlPanel';
import ManualControl from './components/ManualControl';
import EventLog from './components/EventLog';
import { Settings, Zap, Thermometer, Droplets, Activity } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000';

function App() {
  const [status, setStatus] = useState('OFFLINE');
  const [telemetry, setTelemetry] = useState(null);
  const [eventLog, setEventLog] = useState([]); // New State for Log
  const [chartData, setChartData] = useState([]);
  const [dbStats, setDbStats] = useState({ total: 0, ok_count: 0, ng_count: 0, down_count: 0 });

  // Polling Interval Ref to clear on unmount
  const timerRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/simulation/status`);
      const data = res.data;

      setStatus(data.state);
      setTelemetry(data.telemetry);
      // setEventLog(data.event_log || []); // Removed to prevent overwriting DB logs

      // Update Chart Data (keep last 60 points)
      if (data.telemetry) {
        setChartData(prev => {
          const newData = [...prev, {
            time: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
            temp: data.telemetry.temp
          }];
          return newData.slice(-60);
        });
      }
    } catch (error) {
      // Silent fail on polling to avoid console spam
    }
  };

  // Fetch DB stats AND Events
  const fetchDbStats = async () => {
    try {
      const resStats = await axios.get(`${API_URL}/simulation/stats`);
      setDbStats(resStats.data);

      // Also fetch events from DB (to catch Fast Forward changes)
      const resEvents = await axios.get(`${API_URL}/simulation/events`);
      if (resEvents.data) {
        // Map DB fields to UI expected fields
        const formattedEvents = resEvents.data.map(e => ({
          time: new Date(e.timestamp).toLocaleTimeString([], { hour12: false }), // Simple HH:MM:SS
          part_id: e.part_id,
          status: e.status,
          reason: e.reason
        }));
        setEventLog(formattedEvents);
      }
    } catch (error) {
      // Silent fail
    }
  };

  useEffect(() => {
    // Poll telemetry every 200ms (High Speed Sync)
    timerRef.current = setInterval(fetchStatus, 200);

    // Poll DB stats every 2 seconds
    fetchDbStats(); // Initial fetch
    const statsTimer = setInterval(fetchDbStats, 2000);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(statsTimer);
    };
  }, []);

  const handleStart = async () => {
    console.log("🖱️ ACTION: Start Cycle Clicked");
    try {
      const url = `${API_URL}/simulation/start`;
      console.log(`📡 NETWORK: Calling Backend API -> POST ${url}`);

      const response = await axios.post(url);

      console.log("✅ RESPONSE: Simulation Started Details:", response.data);
      alert(`Simulation Started! Mode: ${response.data.mode}`);

      // Reset chart on new run
      setChartData([]);
    } catch (error) {
      console.error("❌ ERROR: Start Cycle Failed", error);
      if (error.response) {
        console.log("❌ ERROR RESPONSE DATA:", error.response.data);
        alert("Failed to start: " + (error.response.data.detail || error.message));
      } else {
        alert("Failed to connect to Backend. Is it running?");
      }
    }
  };

  const handleStop = async () => {
    try {
      await axios.post(`${API_URL}/simulation/stop`);
      setStatus('IDLE');
    } catch (error) {
      console.error("Stop failed", error);
      alert("Failed to stop: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleInjectFault = async (faultType = null) => {
    try {
      const url = faultType
        ? `${API_URL}/simulation/inject-fault?type=${faultType}`
        : `${API_URL}/simulation/inject-fault`;

      await axios.post(url);
    } catch (error) {
      console.error("Fault injection failed", error);
      alert("Failed to inject fault: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleReset = async () => {
    if (!window.confirm("⚠️ HARD RESET WARNING\n\nThis will clear ALL database records, history, and charts.\n\nAre you sure you want to completely reset the system?")) {
      return;
    }

    try {
      await axios.post(`${API_URL}/simulation/reset`);
      setChartData([]);
      setDbStats({ total: 0, ok_count: 0, ng_count: 0, down_count: 0 }); // Reset UI stats
      setStatus('IDLE');
      alert("System Hard Reset Complete. Database cleared.");
    } catch (error) {
      console.error("Reset failed", error);
      alert("Failed to reset: " + (error.response?.data?.detail || error.message));
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg p-8 font-sans text-slate-100 selection:bg-industrial-accent selection:text-white">
      <header className="mb-8 flex justify-between items-center border-b border-slate-700 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Activity className="text-industrial-accent" size={32} />
            <h1 className="text-3xl font-bold tracking-tight text-white">INDUCTION<span className="text-industrial-accent">SIM</span></h1>
          </div>
          <p className="text-slate-400">Real-time Telemetry & Physics Monitoring</p>
        </div>
        <div className="flex items-center gap-4">
          {/* New Info Panel for Shift Logic */}
          <div className="flex flex-col items-end mr-4">
            <span className="text-2xl font-mono font-bold text-white tracking-widest">
              {telemetry?.timestamp_sim || '00:00:00'}
            </span>
            <div className="flex gap-2 text-xs font-bold uppercase">
              <span className="text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                {telemetry?.shift_id || 'NO SHIFT'}
              </span>
              <span className="text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">
                {telemetry?.operator_id || '---'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-industrial-card px-4 py-2 rounded-lg border border-slate-700">
            <div className="flex flex-col items-end">
              <span className="text-xs text-slate-500 uppercase font-bold">Session ID</span>
              <span className="font-mono text-industrial-accent">#{telemetry?.sim_run_id || 'LIVE'}</span>
            </div>
            <Settings className="text-slate-600 hover:text-white cursor-pointer transition-colors" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        {/* Top Row: Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Gauge
            label="Induction Power"
            value={telemetry?.power || 0}
            max={60}
            unit="kW"
            color="text-yellow-500"
          // Power doesn't have a rigid safety range in the prompt, but let's assume standard
          />
          <Gauge
            label="Part Temperature"
            value={telemetry?.temp || 25}
            min={0}
            max={1200} // Range 0-1200 for Heat Treatment
            limitMin={830} // OK Zone (Quality)
            limitMax={870}
            unit="°C"
            color="text-industrial-accent"
          />
          <Gauge
            label="Quench Flow"
            value={telemetry?.flow || 0}
            max={200}
            limitMin={80} // 80-150 is OK
            limitMax={150}
            unit="L/min"
            color="text-blue-500"
          />
          <Gauge
            label="Quench Pressure"
            value={telemetry?.pressure || 0}
            max={6.0}
            limitMin={2.0}
            limitMax={4.0}
            unit="Bar"
            color="text-purple-500"
          />
        </div>

        {/* Middle Row: Chart & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <LiveChart data={chartData} />

            {/* Manual Control Panel (Moved to Balance Layout) */}
            <div className="mt-6">
              <ManualControl apiUrl={API_URL} />
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-industrial-card p-6 rounded-xl border border-slate-700 shadow-lg">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4">Physics Parameters</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span className="text-slate-400 flex items-center gap-2"><Zap size={16} /> Frequency</span>
                  <span className="font-mono font-bold">25.0 kHz</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span className="text-slate-400 flex items-center gap-2"><Droplets size={16} /> Pressure</span>
                  <span className="font-mono font-bold">{(telemetry?.pressure || 0).toFixed(1)} bar</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span className="text-slate-400 flex items-center gap-2"><Thermometer size={16} /> Ambient</span>
                  <span className="font-mono font-bold">25.0 °C</span>
                </div>
              </div>
            </div>

            {/* Production Stats Panel (DB Totals) */}
            <div className="bg-industrial-card p-6 rounded-xl border border-slate-700 shadow-lg mt-4">
              <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4">Production Status (Database Totals)</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                  <span className="text-slate-400 text-xs uppercase font-bold">Current Part</span>
                  <span className="font-mono text-cyan-400 text-sm">
                    {telemetry?.part_id || 'Waiting...'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-500/10 p-2 rounded border border-green-500/20 text-center">
                    <span className="block text-xs text-green-500 font-bold uppercase">OK Parts</span>
                    <span className="text-2xl font-mono text-white">{dbStats.ok_count.toLocaleString()}</span>
                  </div>
                  <div className="bg-yellow-500/10 p-2 rounded border border-yellow-500/20 text-center">
                    <span className="block text-xs text-yellow-500 font-bold uppercase">NG Parts</span>
                    <span className="text-2xl font-mono text-white">{dbStats.ng_count.toLocaleString()}</span>
                  </div>
                  <div className="bg-red-500/10 p-2 rounded border border-red-500/20 text-center">
                    <span className="block text-xs text-red-500 font-bold uppercase">DOWN</span>
                    <span className="text-2xl font-mono text-white">{dbStats.down_count.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-center text-xs text-slate-500 mt-2">
                  Total Records: {dbStats.total.toLocaleString()}
                </div>
              </div>
            </div>



          </div>
        </div>

        {/* Bottom Row: Controls */}
        <div className="mt-8">
          <ControlPanel
            status={status}
            onStart={handleStart}
            onStop={handleStop}
            onInjectFault={handleInjectFault}
            onReset={handleReset}
            onRepair={async () => {
              try {
                await axios.post(`${API_URL}/simulation/repair`);
                fetchStatus();
              } catch (error) {
                console.error("Repair failed", error);
                alert("Failed to repair: " + (error.response?.data?.detail || error.message));
              }
            }}
            onFastForwardDay={async () => {
              try {
                alert("Generating 1 day of data... Please wait (this may take 10-20 seconds).");
                const response = await axios.post(`${API_URL}/simulation/fast-forward/day`);

                // Fetch updated DB stats
                const statsResponse = await axios.get(`${API_URL}/simulation/stats`);
                const stats = statsResponse.data;

                alert(`✅ Fast Forward Complete!\n\nGenerated: ${response.data.stats.total_records} records\n\n📊 Database Totals:\nTotal: ${stats.total}\nOK: ${stats.ok_count}\nNG: ${stats.ng_count}\nDOWN: ${stats.down_count}`);
              } catch (error) {
                console.error("Fast Forward failed", error);
                alert("Failed: " + (error.response?.data?.detail || error.message));
              }
            }}
            onFastForwardAI={async () => {
              const confirm = window.confirm("🤖 START AI PREDICTION?\n\nThis will look at your history and generate 7 DAYS of new data tailored to your machine's behavior.\n\nTechnique: Statistical Sampling + Markov Chain\nExpected Records: ~50,000\nDuration: ~20-30 seconds\n\nProceed?");
              if (!confirm) return;

              try {
                // Batching: 7 separate calls for 1 day each to prevent timeouts
                const TOTAL_DAYS = 7;
                let totalGenerated = 0;

                // Show initial status (can't update UI easily without state, so using console/alert)
                console.log("Starting AI Generation...");

                for (let i = 1; i <= TOTAL_DAYS; i++) {
                  // Add a small delay between requests to allow DB to commit/index safely
                  if (i > 1) await new Promise(r => setTimeout(r, 1000));

                  // console.log(`generating day ${i}...`);
                  const response = await axios.post(`${API_URL}/simulation/fast-forward/ai?days=1`, {}, { timeout: 60000 });
                  totalGenerated += response.data.stats.total_records;
                }

                // Final Fetch
                const statsResponse = await axios.get(`${API_URL}/simulation/stats`);
                const stats = statsResponse.data;

                alert(`✅ AI PREDICTION COMPLETE!\n\nSuccess! Generated ${TOTAL_DAYS} Days of data.\nTotal New Records: ${totalGenerated.toLocaleString()}\n\n📊 New Database Totals:\nTotal: ${stats.total.toLocaleString()}\nOK: ${stats.ok_count.toLocaleString()}\nNG: ${stats.ng_count.toLocaleString()}\nDOWN: ${stats.down_count.toLocaleString()}`);
              } catch (error) {
                console.error("AI Fast Forward failed", error);
                alert("❌ Generation Failed Partway\n\nError: " + (error.response?.data?.detail || error.message));
              }
            }}
          />
        </div>

        {/* Live Event Log (Full Width Bottom) */}
        <EventLog logs={eventLog} />

      </main>
    </div>
  );
}

export default App
