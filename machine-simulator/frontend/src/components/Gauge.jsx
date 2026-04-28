import React from 'react';
import { clsx } from 'clsx';

const Gauge = ({ value, min = 0, max = 100, limitMin, limitMax, label, unit, color = "text-industrial-accent" }) => {
    // Normalize value to 0-1
    const normalizedValue = Math.min(Math.max((value - min) / (max - min), 0), 1);

    // Determine dynamic color based on limits
    let finalColor = color;
    let isWarning = false;
    if (limitMin !== undefined && limitMax !== undefined) {
        if (value < limitMin || value > limitMax) {
            finalColor = "text-red-500 animate-pulse"; // Alert Red
            isWarning = true;
        } else {
            finalColor = "text-green-500"; // Safe Green within limits
        }
    }

    // Circumference of the gauge (semi-circle)
    const radius = 40;
    const circumference = Math.PI * radius;
    const dashOffset = circumference * (1 - normalizedValue);

    // Calculate Safe Zone Arc (if limits exist)
    let safeZoneOffset = 0;
    let safeZoneLength = 0;

    if (limitMin !== undefined && limitMax !== undefined) {
        const normMin = Math.max((limitMin - min) / (max - min), 0);
        const normMax = Math.min((limitMax - min) / (max - min), 1);
        const range = normMax - normMin;

        safeZoneLength = circumference * range;
        // The offset calculation for SVG stroke-dasharray is tricky.
        // It draws from right to left (counter-clockwise) usually or standard start.
        // Let's simplify: We rotate the green arc to start at 'normMin'.
        safeZoneOffset = circumference * (1 - normMin);
    }

    return (
        <div className={clsx("flex flex-col items-center justify-center p-4 bg-industrial-card rounded-xl border shadow-lg relative overflow-hidden transition-colors duration-500",
            isWarning ? "border-red-500/50 shadow-red-500/20" : "border-slate-700"
        )}>
            {/* Glossy overlay effect */}
            <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

            <h3 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                {label}
                {isWarning && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />}
            </h3>

            <div className="relative w-48 h-24 overflow-hidden">
                <svg className="w-full h-full transform scale-150 origin-bottom" viewBox="0 0 100 50">
                    {/* 1. Background Arc (Grey) */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="#1e293b" // slate-800
                        strokeWidth="10"
                        strokeLinecap="round"
                    />

                    {/* 2. Safe Zone Arc (Green Strip) */}
                    {limitMin !== undefined && (
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none"
                            stroke="#15803d" // green-700
                            strokeWidth="10"
                            strokeLinecap="butt" // Butt cap for precise fit
                            strokeDasharray={`${safeZoneLength} ${circumference}`}
                            strokeDashoffset={circumference * (1 - parseFloat((limitMin - min) / (max - min)))} // Start position
                            className="opacity-40"
                        />
                    )}

                    {/* 3. Value Progress Arc */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        className={clsx("transition-all duration-500 ease-out", finalColor)}
                        stroke="currentColor"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                    />
                </svg>

                {/* Value Text centered at bottom */}
                <div className="absolute bottom-0 w-full text-center">
                    <span className="text-3xl font-bold font-mono text-white tracking-tight drop-shadow-md">
                        {value.toFixed(1)}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">{unit}</span>
                </div>
            </div>
        </div>
    );
};

export default Gauge;
