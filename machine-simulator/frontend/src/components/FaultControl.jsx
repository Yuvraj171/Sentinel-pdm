import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Zap, Thermometer, Droplets, Activity, TrendingDown, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

const FaultControl = ({ onInjectFault, onRepair, disabled }) => {
    const [driftActive, setDriftActive] = useState(false);
    const [driftLoading, setDriftLoading] = useState(false);

    // Reset drift state when parent calls repair (via effect on disabled changing to false after DOWN)
    // We'll also expose a way to reset via prop callback
    const handleRepairWithReset = useCallback(() => {
        setDriftActive(false);
        if (onRepair) onRepair();
    }, [onRepair]);

    // Listen for repair button clicks from parent - reset drift state if machine goes from DOWN to running
    useEffect(() => {
        // If machine is back to running and drift was active, it means repair was clicked
        if (!disabled && driftActive) {
            // This will auto-reset when machine restarts after DOWN
        }
    }, [disabled, driftActive]);

    const faults = [
        { id: 'hose_burst', label: 'Hose Burst', icon: Activity, color: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-500/10' },
        { id: 'power_surge', label: 'Power Surge', icon: Zap, color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' },
        { id: 'servo_jam', label: 'Servo Jam', icon: AlertTriangle, color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10' },
        { id: 'cooling_fail', label: 'Cooling Fail', icon: Thermometer, color: 'text-rose-400', border: 'border-rose-500/50', bg: 'bg-rose-500/10' },
        { id: 'pump_failure', label: 'Pump Fail', icon: Droplets, color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' },
    ];

    const handleDriftTest = async () => {
        setDriftLoading(true);
        try {
            const res = await fetch('http://localhost:8000/simulation/start-drift-test', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.timeline) {
                setDriftActive(true);
                console.log('🔴 Drift Test Started:', data);
            } else {
                alert(data.message || 'Failed to start drift test');
            }
        } catch (err) {
            console.error('Drift test error:', err);
            alert('Failed to connect to backend');
        } finally {
            setDriftLoading(false);
        }
    };

    return (
        <div className="mt-4 border-t border-slate-700 pt-4 space-y-4">
            {/* AI Drift Test - Special Section */}
            <div>
                <h4 className="text-purple-400 text-xs font-semibold uppercase mb-3 flex items-center gap-2">
                    <TrendingDown size={12} />
                    AI Calibrated Drift Test
                </h4>
                <button
                    onClick={handleDriftTest}
                    disabled={disabled || driftActive || driftLoading}
                    className={clsx(
                        "w-full flex items-center justify-center gap-3 p-3 rounded-lg border-2 transition-all",
                        "bg-gradient-to-r from-purple-900/40 to-indigo-900/40",
                        "border-purple-500/50 hover:border-purple-400",
                        "hover:from-purple-900/60 hover:to-indigo-900/60",
                        "active:scale-[0.98]",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-purple-500/50"
                    )}
                >
                    {driftLoading ? (
                        <Loader2 size={20} className="text-purple-400 animate-spin" />
                    ) : (
                        <TrendingDown size={20} className={clsx("text-purple-400", driftActive && "animate-pulse")} />
                    )}
                    <div className="text-left">
                        <span className="text-purple-300 font-bold text-sm block">
                            {driftActive ? '⏳ Drift Active - Watch AI Dashboard' : 'Simulate Slow Hydraulic Leak'}
                        </span>
                        <span className="text-purple-500 text-[10px]">
                            NG in ~1 min • Breakdown in ~2 min • Demo Mode
                        </span>
                    </div>
                </button>
                {driftActive && (
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            onClick={handleRepairWithReset}
                            className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border border-green-500/50 bg-green-500/10 hover:bg-green-500/20 transition-all text-green-400 text-sm font-medium"
                        >
                            🔧 Stop Drift & Repair
                        </button>
                        <span className="text-purple-400/70 text-xs">
                            ⏳ Drift in progress...
                        </span>
                    </div>
                )}
            </div>

            {/* Targeted Fault Injection - Original Section */}
            <div>
                <h4 className="text-slate-500 text-xs font-semibold uppercase mb-3 flex items-center gap-2">
                    <AlertTriangle size={12} />
                    Instant Fault Injection
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {faults.map((f) => {
                        const Icon = f.icon;
                        return (
                            <button
                                key={f.id}
                                onClick={() => onInjectFault(f.id)}
                                disabled={disabled}
                                className={clsx(
                                    "flex flex-col items-center justify-center p-2 rounded-lg border transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                    f.bg, f.border, "hover:bg-opacity-20"
                                )}
                                title={`Simulate ${f.label}`}
                            >
                                <Icon size={16} className={clsx("mb-1", f.color)} />
                                <span className={clsx("text-[10px] font-bold uppercase", f.color)}>{f.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default FaultControl;

