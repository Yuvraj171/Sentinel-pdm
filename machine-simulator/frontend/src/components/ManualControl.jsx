import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Sliders, AlertCircle } from 'lucide-react';

const ManualControl = ({ apiUrl }) => {
    const [enabled, setEnabled] = useState(false);
    const [tempLimit, setTempLimit] = useState(870); // Default OK Max
    const [flowTarget, setFlowTarget] = useState(120); // Default OK Center

    // Debounce or Commit Logic: We'll commit on mouse up to avoid spamming API
    const handleCommit = async (newEnabled, newTemp, newFlow) => {
        try {
            await axios.post(`${apiUrl}/simulation/manual-control`, null, {
                params: {
                    enabled: newEnabled,
                    temp_limit: newTemp,
                    flow_target: newFlow
                }
            });
            console.log("🎛️ Manual Control Updated:", { newEnabled, newTemp, newFlow });
        } catch (error) {
            console.error("Failed to set manual control", error);
        }
    };

    const toggleEnabled = () => {
        const newState = !enabled;
        setEnabled(newState);
        handleCommit(newState, tempLimit, flowTarget);
    };

    const handleTempChange = (e) => {
        setTempLimit(parseFloat(e.target.value));
    };

    const handleFlowChange = (e) => {
        setFlowTarget(parseFloat(e.target.value));
    };

    // Commit only when user lets go of slider
    const handleSliderCommit = () => {
        if (enabled) {
            handleCommit(enabled, tempLimit, flowTarget);
        }
    };

    return (
        <div className={`w-full rounded-xl border p-6 transition-all ${enabled ? 'bg-slate-800 border-industrial-accent shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-industrial-card border-slate-700'}`}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <Sliders className={enabled ? "text-industrial-accent" : "text-slate-500"} size={24} />
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">Manual Process Limits</h3>
                        <p className="text-xs text-slate-500">Override Physics Engine</p>
                    </div>
                </div>

                {/* Toggle Switch */}
                <button
                    onClick={toggleEnabled}
                    className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-industrial-accent' : 'bg-slate-600'}`}
                >
                    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className={`space-y-6 transition-opacity ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>

                {/* Temp Limit Slider */}
                <div>
                    <div className="flex justify-between text-xs font-bold uppercase mb-2">
                        <span className="text-slate-400">Temp Limit (Ceiling)</span>
                        <span className="text-industrial-accent font-mono">{tempLimit} °C</span>
                    </div>
                    <input
                        type="range"
                        min="25" max="1300" step="10"
                        value={tempLimit}
                        onChange={handleTempChange}
                        onMouseUp={handleSliderCommit}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-industrial-accent"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>25</span>
                        <span>850 (Trigger)</span>
                        <span>1300</span>
                    </div>
                </div>

                {/* Flow Target Slider */}
                <div>
                    <div className="flex justify-between text-xs font-bold uppercase mb-2">
                        <span className="text-slate-400">Flow Target (Valve)</span>
                        <span className="text-blue-400 font-mono">{flowTarget} LPM</span>
                    </div>
                    <input
                        type="range"
                        min="0" max="200" step="5"
                        value={flowTarget}
                        onChange={handleFlowChange}
                        onMouseUp={handleSliderCommit}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                        <span>0</span>
                        <span>80 (Min)</span>
                        <span>200</span>
                    </div>
                </div>

                {enabled && (
                    <div className="flex gap-2 items-start bg-yellow-500/10 border border-yellow-500/20 p-3 rounded text-xs text-yellow-500">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <p>Physics Override Active. Cycles will follow these limits regardless of natural heating/cooling.</p>
                    </div>
                )}
            </div>

            {/* Process Specifications Reference (Always Visible) */}
            <div className="mt-6 pt-4 border-t border-slate-700/50">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Process Specifications</h4>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                    <table className="w-full text-[10px] text-left">
                        <thead>
                            <tr className="text-slate-500 border-b border-slate-700/50">
                                <th className="pb-1 pl-1">Parameter</th>
                                <th className="pb-1 text-green-500">OK Range</th>
                                <th className="pb-1 text-orange-400">NG Range</th>
                                <th className="pb-1 text-red-500">DOWN</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 text-slate-300 font-mono">
                            <tr>
                                <td className="py-2 pl-1">Part Temp</td>
                                <td className="text-green-400">830-870°C</td>
                                <td className="text-orange-300">&lt;830 | &gt;870</td>
                                <td className="text-red-400">&gt;1200</td>
                            </tr>
                            <tr>
                                <td className="py-2 pl-1">Quench Flow</td>
                                <td className="text-green-400">80-150 L</td>
                                <td className="text-orange-300">50-80 | &gt;150</td>
                                <td className="text-red-400">&lt;50</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ManualControl;
