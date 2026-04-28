import React from 'react';
import { AlertTriangle, XCircle, Clock, Activity } from 'lucide-react';

const EventLog = ({ logs }) => {
    // If no logs, show a placeholder or nothing
    if (!logs || logs.length === 0) {
        return (
            <div className="bg-industrial-card p-4 rounded-xl border border-slate-700 shadow-lg mt-6">
                <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Activity size={16} /> Production Event Log
                </h3>
                <div className="text-slate-500 text-sm text-center py-4 italic">
                    No NG/DOWN events recorded yet. System running smoothly.
                </div>
            </div>
        );
    }

    // Reverse logs to show newest first if the backend sends oldest first (deque order)
    // Backend sends [old, ..., new]. We probably want [new, ..., old].
    const displayLogs = [...logs].reverse();

    return (
        <div className="bg-industrial-card p-4 rounded-xl border border-slate-700 shadow-lg mt-6">
            <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity size={16} /> Production Event Log (Recent Failures)
            </h3>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-slate-700 text-slate-400">
                            <th className="pb-2 pl-2">Time</th>
                            <th className="pb-2">Part ID</th>
                            <th className="pb-2">Status</th>
                            <th className="pb-2">Reason (Logic Trace)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {displayLogs.map((log, index) => (
                            <tr key={index} className="hover:bg-slate-800/50 transition-colors">
                                <td className="py-3 pl-2 font-mono text-slate-300 whitespace-nowrap">
                                    <span className="flex items-center gap-2">
                                        <Clock size={14} className="text-slate-500" />
                                        {/* Backend sends "Day 1, 09:30:00". We want "09:30:00" */}
                                        {log.time.split(', ')[1] || log.time}
                                    </span>
                                </td>
                                <td className="py-3 font-mono text-cyan-400 text-xs">
                                    {log.part_id}
                                </td>
                                <td className="py-3">
                                    {log.status === 'DOWN' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold">
                                            <XCircle size={12} /> DOWN
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold">
                                            <AlertTriangle size={12} /> NG
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 text-slate-300 font-mono text-xs">
                                    {log.reason}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EventLog;
