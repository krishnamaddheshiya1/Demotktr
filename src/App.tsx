import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QueueSnapshot,
  AdvisorRecommendation,
  DeterministicEstimate,
  StaffUpdateRequest,
  AccessibilityNeedId,
} from './types.js';
import {
  DEFAULT_QUEUE_ID,
  DEFAULT_STAFF_PASSCODE,
  API_ENDPOINTS,
} from './constants.js';
import { useAuth } from './context/AuthContext.js';
import { QueueStatusBanner } from './components/QueueStatusBanner.js';
import { QueueEntryForm } from './components/QueueEntryForm.js';
import { RecommendationCard } from './components/RecommendationCard.js';
import { CountdownReminder } from './components/CountdownReminder.js';
import { StaffQueueForm } from './components/StaffQueueForm.js';
import { DemoScenariosBar } from './components/DemoScenariosBar.js';
import { QrModal } from './components/QrModal.js';
import { AuthBar } from './components/AuthBar.js';
import { StaffElevationModal } from './components/StaffElevationModal.js';
import { SavedVisitsModal } from './components/SavedVisitsModal.js';
import {
  Clock,
  User,
  SlidersHorizontal,
  AlertCircle,
  RefreshCw,
  X,
  Sparkles,
  CheckCircle2,
  Info,
} from 'lucide-react';

export default function App() {
  const { isStaff } = useAuth();
  const [activeTab, setActiveTab] = useState<'visitor' | 'staff'>('visitor');
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [recommendation, setRecommendation] = useState<AdvisorRecommendation | null>(null);
  const [deterministic, setDeterministic] = useState<DeterministicEstimate | null>(null);
  const [isCalculatingRec, setIsCalculatingRec] = useState<boolean>(false);
  const [isSavingStaff, setIsSavingStaff] = useState<boolean>(false);

  const [simulateAiFailure, setSimulateAiFailure] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [showStaffElevationModal, setShowStaffElevationModal] = useState<boolean>(false);
  const [showSavedVisitsModal, setShowSavedVisitsModal] = useState<boolean>(false);
  const [liveAnnouncementText, setLiveAnnouncementText] = useState<string>('');

  // Cache user's last submitted parameters to re-evaluate reactively on live queue changes
  const lastUserParams = useRef<{
    queueId: string;
    peopleAhead?: number;
    minutesNeededToReturn?: number;
    accessibilityNeeds?: AccessibilityNeedId[];
  } | null>(null);

  // In-flight request controller to prevent async race conditions
  const inFlightRecAbortRef = useRef<AbortController | null>(null);
  const sseDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastComputedVersionRef = useRef<number | null>(null);

  // 1. Fetch initial queue snapshot and setup Server-Sent Events (SSE)
  const initQueue = useCallback(async () => {
    setIsLoadingSnapshot(true);
    setGlobalError(null);
    try {
      const res = await fetch(API_ENDPOINTS.QUEUE_SNAPSHOT(DEFAULT_QUEUE_ID));
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      } else {
        setGlobalError('Unable to load queue data from server. Please check your connection and retry.');
      }
    } catch (err) {
      console.warn('Initial snapshot fetch error:', err);
      setGlobalError('Network connection issue. The queue advisor will retry connecting.');
    } finally {
      setIsLoadingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isMounted = true;

    initQueue();

    // Check AI failure simulation status
    fetch(API_ENDPOINTS.DEMO_STATUS)
      .then((r) => (r.ok ? r.json() : null))
      .then((demoData) => {
        if (isMounted && demoData) setSimulateAiFailure(demoData.simulateAiFailure);
      })
      .catch(() => {});

    // Establish SSE Stream for real-time live push updates
    try {
      eventSource = new EventSource(API_ENDPOINTS.QUEUE_STREAM(DEFAULT_QUEUE_ID));

      eventSource.onopen = () => {
        if (isMounted) {
          setIsConnected(true);
          setGlobalError(null);
        }
      };

      eventSource.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const updated = JSON.parse(event.data);
          setSnapshot((prev) => {
            if (prev && prev.version === updated.version && prev.updatedAt === updated.updatedAt) {
              return prev;
            }
            return updated;
          });
          setIsConnected(true);
          setIsLoadingSnapshot(false);

          // Announce to screen readers
          setLiveAnnouncementText(
            `Live update: Queue status ${updated.status}, ${updated.peopleAhead} waiting, ${updated.activeCounters} windows active.`
          );

          // Debounce re-evaluation if user has an active recommendation and queue state actually changed
          if (lastUserParams.current && updated.version !== lastComputedVersionRef.current) {
            if (sseDebounceTimerRef.current) {
              clearTimeout(sseDebounceTimerRef.current);
            }
            sseDebounceTimerRef.current = setTimeout(() => {
              if (lastUserParams.current) {
                fetchRecommendation(lastUserParams.current, false);
              }
            }, 600);
          }
        } catch (e) {
          console.error('Failed to parse SSE payload', e);
        }
      };

      eventSource.onerror = () => {
        if (isMounted) setIsConnected(false);
      };
    } catch (e) {
      console.warn('SSE stream error:', e);
    }

    return () => {
      isMounted = false;
      if (eventSource) eventSource.close();
      if (sseDebounceTimerRef.current) clearTimeout(sseDebounceTimerRef.current);
      if (inFlightRecAbortRef.current) inFlightRecAbortRef.current.abort();
    };
  }, [initQueue]);

  // 2. Compute recommendation from backend with race condition cancellation
  const fetchRecommendation = useCallback(
    async (
      params: {
        queueId: string;
        peopleAhead?: number;
        minutesNeededToReturn?: number;
        accessibilityNeeds?: AccessibilityNeedId[];
      },
      showLoading = true
    ) => {
      lastUserParams.current = params;

      // Cancel previous in-flight recommendation request
      if (inFlightRecAbortRef.current) {
        inFlightRecAbortRef.current.abort();
      }
      const controller = new AbortController();
      inFlightRecAbortRef.current = controller;

      if (showLoading) {
        setIsCalculatingRec(true);
        setGlobalError(null);
      }

      try {
        const res = await fetch(API_ENDPOINTS.RECOMMENDATION, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          lastComputedVersionRef.current = data.snapshot?.version ?? null;
          setRecommendation(data.recommendation);
          setDeterministic(data.deterministic);

          // Scroll to result on desktop / mobile
          if (showLoading) {
            setTimeout(() => {
              const el = document.getElementById('recommendation-result');
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              el?.focus();
            }, 100);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.error || `Server responded with status ${res.status}.`;
          setGlobalError(`Advisor error: ${msg}`);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Expected when a newer request supersedes an older one
          return;
        }
        console.error('Error getting recommendation:', err);
        setGlobalError('Unable to generate advice right now. Please check your connection and try again.');
      } finally {
        if (showLoading) setIsCalculatingRec(false);
      }
    },
    []
  );

  // 3. Staff save update
  const handleStaffUpdate = async (data: StaffUpdateRequest): Promise<boolean> => {
    setIsSavingStaff(true);
    try {
      const res = await fetch(API_ENDPOINTS.QUEUE_SNAPSHOT(DEFAULT_QUEUE_ID), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-passcode': data.passcode || DEFAULT_STAFF_PASSCODE,
        },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const updated = await res.json();
        setSnapshot(updated);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Staff update error:', err);
      return false;
    } finally {
      setIsSavingStaff(false);
    }
  };

  // 4. Demo trigger scenario
  const handleTriggerScenario = async (scenario: 'outage' | 'pause' | 'rush' | 'reset') => {
    try {
      const res = await fetch(API_ENDPOINTS.DEMO_SCENARIO(scenario), { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
      }
    } catch (err) {
      console.error('Demo scenario error:', err);
    }
  };

  // 5. Toggle AI failure mode
  const handleToggleAiFailure = async () => {
    try {
      const res = await fetch(API_ENDPOINTS.TOGGLE_AI_FAILURE, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSimulateAiFailure(data.simulateAiFailure);
        // Refresh recommendation if active
        if (lastUserParams.current) {
          fetchRecommendation(lastUserParams.current, false);
        }
      }
    } catch (err) {
      console.error('Toggle AI failure error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Screen reader live announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncementText}
      </div>

      {/* Top Application Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Counter identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs">
              <Clock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
                  QueueLess
                </h1>
                <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  Action Advisor
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Campus Student Services & Clinic Counter 4
              </p>
            </div>
          </div>

          {/* Right Header Controls: Mode Switcher & Authentication */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Mode Switcher: Visitor vs Staff */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('visitor')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'visitor'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Visitor Mode</span>
                <span className="sm:hidden">Visitor</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('staff')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'staff'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Staff Desk Control</span>
                <span className="sm:hidden">Staff</span>
              </button>
            </div>

            {/* Authenticated Profile / Sign-in */}
            <AuthBar
              onOpenSavedVisits={() => setShowSavedVisitsModal(true)}
              onOpenStaffElevation={() => setShowStaffElevationModal(true)}
              onOpenStaffConsole={() => setActiveTab('staff')}
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Global Error Banner */}
        {globalError && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-rose-900">{globalError}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (lastUserParams.current) {
                      fetchRecommendation(lastUserParams.current, true);
                    } else {
                      initQueue();
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 underline underline-offset-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retry action</span>
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              aria-label="Dismiss alert"
              className="p-1 rounded-md text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Hackathon Demo Scenarios Quick Bar */}
        <DemoScenariosBar
          onTriggerScenario={handleTriggerScenario}
          onToggleAiFailure={handleToggleAiFailure}
          simulateAiFailure={simulateAiFailure}
          isLoading={isCalculatingRec || isSavingStaff}
        />

        {/* Live Queue Status Banner (shared by both views for instant context) */}
        <QueueStatusBanner
          snapshot={snapshot}
          isConnected={isConnected}
          isLoading={isLoadingSnapshot}
        />

        {/* VISITOR VIEW */}
        {activeTab === 'visitor' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Entry Form */}
            <div className="lg:col-span-6 space-y-6">
              <QueueEntryForm
                snapshot={snapshot}
                onSubmit={fetchRecommendation}
                isLoading={isCalculatingRec}
                onOpenQr={() => setShowQrModal(true)}
              />
            </div>

            {/* Right Column: Recommendation & Countdown */}
            <div className="lg:col-span-6 space-y-6">
              {recommendation ? (
                <>
                  <RecommendationCard
                    recommendation={recommendation}
                    deterministic={deterministic ?? undefined}
                    queueName={snapshot?.queueName}
                    queueId={snapshot?.queueId}
                  />

                  {/* Countdown Timer and Alarm */}
                  <CountdownReminder
                    initialMinutes={
                      recommendation.returnInMinutes ??
                      Math.max(5, recommendation.waitMinMinutes)
                    }
                    action={recommendation.action}
                  />
                </>
              ) : (
                <div className="bg-white rounded-2xl p-8 border border-slate-200/90 text-center shadow-xs flex flex-col items-center justify-center min-h-[340px]">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                    <Sparkles className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">
                    Ready to Advise Your Queue Decision
                  </h3>
                  <p className="text-xs md:text-sm text-slate-500 max-w-sm mt-1 leading-relaxed">
                    Submit your ticket position or people ahead on the left to receive a bounded wait
                    range, tailored accessibility advice, and one clear action: wait here, wait elsewhere,
                    or return later.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Deterministic Queuing Bounds
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Gemini Note Interpretation
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" /> Safe Return Alarm
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STAFF CONTROL VIEW */}
        {activeTab === 'staff' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8">
              <StaffQueueForm
                snapshot={snapshot}
                onUpdate={handleStaffUpdate}
                isSaving={isSavingStaff}
              />
            </div>

            {/* Staff Desk Guide / Reference card */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-indigo-600" />
                  Staff Desk Operating Protocol
                </h3>
                <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                  <li>
                    <strong>1. Outage Handling:</strong> If a station freezes or goes down, immediately increment
                    Offline Windows. QueueLess will widen the wait bounds and notify waiting visitors to adjust their
                    plans.
                  </li>
                  <li>
                    <strong>2. Shift Pause:</strong> Setting status to <em>PAUSED</em> triggers an immediate "COME BACK LATER"
                    advisor recommendation so crowds do not congregate in the hallway.
                  </li>
                  <li>
                    <strong>3. Realtime Push:</strong> Updates save directly to the authoritative state and are broadcast
                    via Server-Sent Events to all visitors.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-4">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>QueueLess — Live Queue Action Advisor</span>
            <span>•</span>
            <span>Campus Counter Window 4</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Single-Counter MVP</span>
            <span>•</span>
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Share QR Code
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile QR Code Modal */}
      <QrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        queueId={snapshot?.queueId ?? DEFAULT_QUEUE_ID}
      />

      {/* Staff Elevation Modal */}
      <StaffElevationModal
        isOpen={showStaffElevationModal}
        onClose={() => setShowStaffElevationModal(false)}
        onSuccess={() => {
          setShowStaffElevationModal(false);
          setActiveTab('staff');
        }}
      />

      {/* Saved Visits / Tickets Modal */}
      <SavedVisitsModal
        isOpen={showSavedVisitsModal}
        onClose={() => setShowSavedVisitsModal(false)}
      />
    </div>
  );
}
