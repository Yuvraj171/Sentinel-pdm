import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const LiveChart = ({ data }) => {
    return (
        <div className="w-full h-80 bg-industrial-card rounded-xl border border-slate-700 shadow-lg p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Heating Profile (Live)</h3>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-industrial-accent animate-pulse" />
                    <span className="text-xs text-industrial-accent">REAL-TIME</span>
                </div>
            </div>

            <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis
                            dataKey="time"
                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                            stroke="#475569"
                            interval={4}
                        />
                        <YAxis
                            domain={[0, 'auto']}
                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                            stroke="#475569"
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
                            itemStyle={{ color: '#f1f5f9' }}
                            labelStyle={{ color: '#94a3b8' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="temp"
                            stroke="#f97316" // industrial-accent
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#fff' }}
                            isAnimationActive={false} // Disable animation for smoother live updates
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default LiveChart;
