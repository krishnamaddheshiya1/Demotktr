import React from 'react';
import { Zap, Pause, TrendingUp, RotateCcw, ShieldAlert } from 'lucide-react';

interface DemoScenariosBarProps {
  onTriggerScenario: (scenario: 'outage' | 'pause' | 'rush' | 'reset') => void;
  onToggleAiFailure: () => void;
  simulateAiFailure: boolean;
  isLoading: boolean;
}

export const DemoScenariosBar: React.FC<DemoScenariosBarProps> = React.memo(({
  onTriggerScenario,
  onToggleAiFailure,
  simulateAiFailure,
  isLoading,
}) => {
  return (
    <div
      role="region"
      aria-label="Interactive Demo Scenarios"
      className="bg-slate-900 text-slate-100 rounded-2xl p-4 md:p-5 shadow-lg border border-slate-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Hackathon Live Demo Controls
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          Click a scenario to trigger real-time state change & observe recommendation reaction
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Outage Scenario */}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onTriggerScenario('outage')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>1. Counter Outage (Window Offline)</span>
        </button>

        {/* Pause Scenario */}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onTriggerScenario('pause')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors disabled:opacity-50"
        >
          <Pause className="w-3.5 h-3.5 text-rose-400" />
          <span>2. Pause Queue (Shift Briefing)</span>
        </button>

        {/* Rush Scenario */}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onTriggerScenario('rush')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 transition-colors disabled:opacity-50"
        >
          <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          <span>3. Sudden Rush (+10 Waiting)</span>
        </button>

        {/* AI Fallback Resilience Toggle */}
        <button
          type="button"
          disabled={isLoading}
          onClick={onToggleAiFailure}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50 ${
            simulateAiFailure
              ? 'bg-rose-600 text-white border-rose-400'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
          title="Simulates Gemini API network/quota failure to prove deterministic fallback resilience"
        >
          <ShieldAlert className={`w-3.5 h-3.5 ${simulateAiFailure ? 'text-white' : 'text-slate-400'}`} />
          <span>
            {simulateAiFailure ? 'AI Failure Active (Fallback On)' : 'Simulate AI Failure'}
          </span>
        </button>

        {/* Reset */}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onTriggerScenario('reset')}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors ml-auto disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Default</span>
        </button>
      </div>
    </div>
  );
});

DemoScenariosBar.displayName = 'DemoScenariosBar';
