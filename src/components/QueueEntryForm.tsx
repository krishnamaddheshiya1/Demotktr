import React, { useState, useEffect } from 'react';
import { AccessibilityNeedId, AccessibilityNeedOption, QueueSnapshot } from '../types';
import {
  DEFAULT_QUEUE_ID,
  DEFAULT_RETURN_MINUTES,
  MAX_PEOPLE_AHEAD,
  MAX_RETURN_MINUTES,
} from '../constants';
import {
  Sparkles,
  QrCode,
  Navigation,
  Accessibility,
  Check,
  RotateCcw,
  Users,
} from 'lucide-react';

interface QueueEntryFormProps {
  snapshot: QueueSnapshot | null;
  onSubmit: (params: {
    queueId: string;
    peopleAhead?: number;
    minutesNeededToReturn?: number;
    accessibilityNeeds?: AccessibilityNeedId[];
  }) => void;
  isLoading: boolean;
  onOpenQr: () => void;
}

const ACCESSIBILITY_OPTIONS: AccessibilityNeedOption[] = [
  {
    id: 'mobility_seating',
    label: 'Seating Required / Reduced Mobility',
    description: 'Directs to guaranteed lobby seating instead of standing in queue line.',
  },
  {
    id: 'sensory_quiet',
    label: 'Sensory / Quiet Space Needed',
    description: 'Recommends calm waiting zones with reliable notification buffer.',
  },
  {
    id: 'extra_return_buffer',
    label: 'Extra Return Travel Buffer (+5 min)',
    description: 'Adds safety cushion so you are never rushed returning to the desk.',
  },
  {
    id: 'visual_audio_assist',
    label: 'Visual & High-Contrast Audio Alerts',
    description: 'Assures clear screen display & audio bell triggers for turn calls.',
  },
  {
    id: 'staff_assist',
    label: 'Staff Greeting & Check-in Support',
    description: 'Guides you to check in directly with Window 1 greeter upon arrival.',
  },
];

export const QueueEntryForm: React.FC<QueueEntryFormProps> = React.memo(({
  snapshot,
  onSubmit,
  isLoading,
  onOpenQr,
}) => {
  const [queueCode, setQueueCode] = useState(DEFAULT_QUEUE_ID);
  const [peopleAhead, setPeopleAhead] = useState<number>(snapshot?.peopleAhead ?? 7);
  const [returnMinutes, setReturnMinutes] = useState<number>(DEFAULT_RETURN_MINUTES);
  const [selectedNeeds, setSelectedNeeds] = useState<AccessibilityNeedId[]>([]);
  const [useCustomPosition, setUseCustomPosition] = useState(false);

  // Sync default peopleAhead when snapshot loads if user hasn't explicitly customized
  useEffect(() => {
    if (snapshot && !useCustomPosition) {
      setPeopleAhead(snapshot.peopleAhead);
    }
  }, [snapshot?.peopleAhead, useCustomPosition]);

  const toggleNeed = (id: AccessibilityNeedId) => {
    setSelectedNeeds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const cleanCode = queueCode.trim() || DEFAULT_QUEUE_ID;
    const safePeople = Math.min(MAX_PEOPLE_AHEAD, Math.max(0, Number(peopleAhead) || 0));
    const safeReturn = Math.min(MAX_RETURN_MINUTES, Math.max(1, Number(returnMinutes) || DEFAULT_RETURN_MINUTES));

    onSubmit({
      queueId: cleanCode,
      peopleAhead: safePeople,
      minutesNeededToReturn: safeReturn,
      accessibilityNeeds: selectedNeeds,
    });
  };

  const returnTimePresets = [3, 5, 10, 15, 20];

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/90 shadow-xs"
      aria-label="Queue recommendation request form"
    >
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base md:text-lg font-bold text-slate-900">
            Tell Us About Your Visit
          </h3>
          <p className="text-xs md:text-sm text-slate-500">
            Get an instant wait range and one clear action: wait here, wait elsewhere, or come back later.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenQr}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
          title="Show QR Code to open on mobile"
        >
          <QrCode className="w-4 h-4" aria-hidden="true" />
          <span>Mobile QR</span>
        </button>
      </div>

      <div className="space-y-5 pt-4">
        {/* Queue Code Selector */}
        <div>
          <label htmlFor="queue-code-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Counter Queue Code
          </label>
          <div className="flex gap-2">
            <input
              id="queue-code-input"
              type="text"
              value={queueCode}
              onChange={(e) => setQueueCode(e.target.value.toUpperCase())}
              placeholder="e.g. CAMPUS-REG-4"
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 uppercase"
              required
            />
          </div>
        </div>

        {/* Position / People Ahead */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="people-ahead-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              People Ahead of You
            </label>
            <button
              type="button"
              onClick={() => {
                setUseCustomPosition(false);
                if (snapshot) setPeopleAhead(snapshot.peopleAhead);
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Live Counter ({snapshot?.peopleAhead ?? 7})
            </button>
          </div>

          <div className="relative">
            <input
              id="people-ahead-input"
              type="number"
              min="0"
              max="200"
              value={peopleAhead}
              onChange={(e) => {
                setUseCustomPosition(true);
                setPeopleAhead(Math.max(0, parseInt(e.target.value) || 0));
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              required
            />
            <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Current live counter shows {snapshot?.peopleAhead ?? 7} waiting ahead. Adjust if your ticket differs.
          </p>
        </div>

        {/* Return Travel Time */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="return-minutes-slider" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Time Needed to Return to Counter
            </label>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
              {returnMinutes} minutes walk
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {returnTimePresets.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setReturnMinutes(mins)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${
                  returnMinutes === mins
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {mins} min
              </button>
            ))}
          </div>

          <input
            id="return-minutes-slider"
            type="range"
            min="1"
            max="30"
            step="1"
            value={returnMinutes}
            onChange={(e) => setReturnMinutes(parseInt(e.target.value))}
            className="w-full accent-indigo-600 cursor-pointer"
            aria-valuemin={1}
            aria-valuemax={30}
            aria-valuenow={returnMinutes}
          />
          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
            <Navigation className="w-3 h-3 text-slate-400" aria-hidden="true" />
            Used to calculate whether you have safe time to visit a nearby library or coffee shop.
          </p>
        </div>

        {/* Accessibility Needs Preferences */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Accessibility className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Accessibility & Seating Preferences (Optional)
            </span>
          </div>

          <div className="space-y-2">
            {ACCESSIBILITY_OPTIONS.map((opt) => {
              const isChecked = selectedNeeds.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-indigo-50/70 border-indigo-300'
                      : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleNeed(opt.id)}
                    className="mt-1 w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                  />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      {opt.label}
                      {isChecked && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-normal">{opt.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-60 shadow-sm transition-all text-sm md:text-base cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Analyzing Queue State with Gemini & Estimator...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Get Live Action Recommendation</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
});

QueueEntryForm.displayName = 'QueueEntryForm';
