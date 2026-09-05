import React, { useState, useEffect } from 'react';
import { QueueSnapshot, QueueStatus, StaffUpdateRequest } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import {
  DEFAULT_STAFF_PASSCODE,
  MAX_PEOPLE_AHEAD,
  MAX_SERVICE_MINUTES,
  MIN_SERVICE_MINUTES,
  MAX_COUNTERS,
  MAX_ANNOUNCEMENT_LENGTH,
} from '../constants.js';
import {
  Save,
  CheckCircle2,
  PauseCircle,
  XCircle,
  AlertTriangle,
  Lock,
  Megaphone,
  Users,
  Clock,
  Key,
  ShieldCheck,
} from 'lucide-react';

interface StaffQueueFormProps {
  snapshot: QueueSnapshot | null;
  onUpdate: (data: StaffUpdateRequest) => Promise<boolean>;
  isSaving: boolean;
}

export const StaffQueueForm: React.FC<StaffQueueFormProps> = React.memo(({
  snapshot,
  onUpdate,
  isSaving,
}) => {
  const { user, isStaff, profile } = useAuth();
  const [passcode, setPasscode] = useState(DEFAULT_STAFF_PASSCODE);
  const [status, setStatus] = useState<QueueStatus>(snapshot?.status ?? 'OPEN');
  const [peopleAhead, setPeopleAhead] = useState<number>(snapshot?.peopleAhead ?? 7);
  const [averageServiceMinutes, setAverageServiceMinutes] = useState<number>(snapshot?.averageServiceMinutes ?? 5);
  const [activeCounters, setActiveCounters] = useState<number>(snapshot?.activeCounters ?? 2);
  const [unavailableCounters, setUnavailableCounters] = useState<number>(snapshot?.unavailableCounters ?? 1);
  const [announcement, setAnnouncement] = useState<string>(snapshot?.announcement ?? '');
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Synchronize form when external snapshot updates (e.g. via SSE broadcast or Demo Preset)
  useEffect(() => {
    if (!snapshot) return;
    setStatus(snapshot.status);
    setPeopleAhead(Number.isFinite(snapshot.peopleAhead) ? snapshot.peopleAhead : 0);
    setAverageServiceMinutes(Number.isFinite(snapshot.averageServiceMinutes) ? snapshot.averageServiceMinutes : 5);
    setActiveCounters(Number.isFinite(snapshot.activeCounters) ? snapshot.activeCounters : 0);
    setUnavailableCounters(Number.isFinite(snapshot.unavailableCounters) ? snapshot.unavailableCounters : 0);
    setAnnouncement(snapshot.announcement ?? '');
  }, [snapshot?.version]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage(null);

    const safePeople = Math.min(MAX_PEOPLE_AHEAD, Math.max(0, Number(peopleAhead) || 0));
    const safeAvg = Math.min(MAX_SERVICE_MINUTES, Math.max(MIN_SERVICE_MINUTES, Number(averageServiceMinutes) || 1));
    const safeActive = Math.min(MAX_COUNTERS, Math.max(0, Number(activeCounters) || 0));
    const safeUnavailable = Math.min(MAX_COUNTERS, Math.max(0, Number(unavailableCounters) || 0));

    if (safeActive === 0 && status === 'OPEN') {
      setSaveMessage({
        text: 'Cannot set desk status to OPEN when Active Windows is 0. Please set status to PAUSED or CLOSED.',
        type: 'error',
      });
      return;
    }

    const ok = await onUpdate({
      passcode,
      status,
      peopleAhead: safePeople,
      averageServiceMinutes: safeAvg,
      activeCounters: safeActive,
      unavailableCounters: safeUnavailable,
      announcement: announcement.trim().slice(0, MAX_ANNOUNCEMENT_LENGTH),
    });

    if (ok) {
      setSaveMessage({ text: 'Queue snapshot published! Live visitor screens updated immediately.', type: 'success' });
      setTimeout(() => setSaveMessage(null), 4000);
    } else {
      setSaveMessage({ text: `Update failed. Please verify the staff passcode (${DEFAULT_STAFF_PASSCODE}) and inputs.`, type: 'error' });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/90 shadow-xs"
      aria-label="Staff queue management form"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            Staff Counter Control Panel
          </h2>
          <p className="text-xs md:text-sm text-slate-500">
            Authoritative desk manager. Changes broadcast in real-time to all waiting visitors.
          </p>
        </div>

        {/* Staff Authorization Badge or Passcode */}
        <div className="flex items-center gap-2">
          {isStaff ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verified Staff ({profile?.displayName || user?.email?.split('@')[0]})</span>
            </div>
          ) : (
            <>
              <label htmlFor="staff-passcode-input" className="sr-only">Staff Passcode</label>
              <div className="relative">
                <input
                  id="staff-passcode-input"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Staff Passcode"
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
                <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <button
                type="button"
                onClick={() => setPasscode(DEFAULT_STAFF_PASSCODE)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1.5 rounded-lg border border-indigo-200"
              >
                Demo Pass ({DEFAULT_STAFF_PASSCODE})
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6 pt-5">
        {/* Status Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Desk Operational Status
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'OPEN', label: 'Open & Serving', icon: CheckCircle2, color: 'text-emerald-700', active: 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500' },
              { id: 'PAUSED', label: 'Paused (Break/Sync)', icon: PauseCircle, color: 'text-amber-700', active: 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-500' },
              { id: 'CLOSED', label: 'Closed for Day', icon: XCircle, color: 'text-slate-700', active: 'border-slate-500 bg-slate-100 ring-1 ring-slate-500' },
            ].map((opt) => {
              const Icon = opt.icon;
              const isSelected = status === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatus(opt.id as QueueStatus)}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition-all ${
                    isSelected ? opt.active : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${opt.color}`} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Counter Capacity Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Active Counters */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="active-counters-input" className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Active Open Windows
              </label>
              <span className="text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {activeCounters} windows
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveCounters((prev) => Math.max(0, prev - 1))}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold hover:bg-slate-100 active:scale-95"
              >
                -
              </button>
              <input
                id="active-counters-input"
                type="number"
                min="0"
                max="10"
                value={activeCounters}
                onChange={(e) => setActiveCounters(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 py-2 text-center rounded-xl border border-slate-300 font-bold text-base text-slate-900"
              />
              <button
                type="button"
                onClick={() => setActiveCounters((prev) => Math.min(10, prev + 1))}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold hover:bg-slate-100 active:scale-95"
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Stations actively processing visitors.</p>
          </div>

          {/* Unavailable Counters */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="unavailable-counters-input" className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Offline / Down Windows
              </label>
              <span className="text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {unavailableCounters} down
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUnavailableCounters((prev) => Math.max(0, prev - 1))}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold hover:bg-slate-100 active:scale-95"
              >
                -
              </button>
              <input
                id="unavailable-counters-input"
                type="number"
                min="0"
                max="10"
                value={unavailableCounters}
                onChange={(e) => setUnavailableCounters(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 py-2 text-center rounded-xl border border-slate-300 font-bold text-base text-slate-900"
              />
              <button
                type="button"
                onClick={() => setUnavailableCounters((prev) => Math.min(10, prev + 1))}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold hover:bg-slate-100 active:scale-95"
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Windows offline for maintenance or meal break.</p>
          </div>
        </div>

        {/* People Ahead & Service Minutes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="staff-people-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              Total People in Queue
            </label>
            <input
              id="staff-people-input"
              type="number"
              min="0"
              max="200"
              value={peopleAhead}
              onChange={(e) => setPeopleAhead(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
              required
            />
          </div>

          <div>
            <label htmlFor="staff-pace-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-600" />
              Average Service Pace (Minutes / Visitor)
            </label>
            <input
              id="staff-pace-input"
              type="number"
              min="1"
              max="60"
              value={averageServiceMinutes}
              onChange={(e) => setAverageServiceMinutes(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
              required
            />
          </div>
        </div>

        {/* Status Announcement Note */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="staff-announcement-input" className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-amber-600" />
              Live Status Announcement for Visitors
            </label>
            <span className={`text-[11px] font-mono ${announcement.length >= 260 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
              {announcement.length}/280
            </span>
          </div>
          <textarea
            id="staff-announcement-input"
            rows={2}
            maxLength={280}
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="e.g. Counter 2 offline for system reboot. Delays expected."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Gemini reads this announcement to adapt visitor recommendations and explanations.
          </p>
        </div>

        {/* Action Buttons & Feedback */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 shadow-sm transition-all text-sm cursor-pointer"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Broadcasting to Visitors...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Publish Live Queue Snapshot</span>
              </>
            )}
          </button>
        </div>

        {saveMessage && (
          <div
            role="status"
            className={`p-3 rounded-xl text-xs font-medium ${
              saveMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {saveMessage.text}
          </div>
        )}
      </div>
    </form>
  );
});

StaffQueueForm.displayName = 'StaffQueueForm';
