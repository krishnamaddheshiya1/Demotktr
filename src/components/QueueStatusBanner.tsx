import React, { useState, useEffect } from 'react';
import { QueueSnapshot } from '../types';
import { STALE_THRESHOLD_MINUTES } from '../constants';
import {
  Users,
  Clock,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Megaphone,
  AlertTriangle,
  Radio,
  Building2,
} from 'lucide-react';

interface QueueStatusBannerProps {
  snapshot: QueueSnapshot | null;
  isConnected: boolean;
  isLoading: boolean;
}

function computeTimeAgo(ts: number): { text: string; minutes: number; isStale: boolean } {
  if (!Number.isFinite(ts)) return { text: 'recently', minutes: 0, isStale: false };
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const minutes = Math.floor(diffSec / 60);
  const isStale = minutes >= STALE_THRESHOLD_MINUTES;
  let text = 'just now';
  if (diffSec >= 60) {
    text = `${minutes}m ago`;
  } else if (diffSec >= 15) {
    const rounded = Math.floor(diffSec / 5) * 5;
    text = `~${rounded}s ago`;
  }
  return { text, minutes, isStale };
}

export const QueueStatusBanner: React.FC<QueueStatusBannerProps> = React.memo(({
  snapshot,
  isConnected,
  isLoading,
}) => {
  const [timeState, setTimeState] = useState<{ text: string; minutes: number; isStale: boolean }>(() => {
    const ts = snapshot?.updatedAt ? new Date(snapshot.updatedAt).getTime() : NaN;
    return computeTimeAgo(ts);
  });

  useEffect(() => {
    if (!snapshot?.updatedAt) return;
    const ts = new Date(snapshot.updatedAt).getTime();

    const update = () => {
      const next = computeTimeAgo(ts);
      setTimeState((prev) => {
        if (prev.text === next.text && prev.isStale === next.isStale && prev.minutes === next.minutes) {
          return prev; // Preserve identity to prevent re-render
        }
        return next;
      });
    };

    update();
    // 5-second tick interval dramatically reduces CPU and mobile battery consumption
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [snapshot?.updatedAt]);

  if (isLoading && !snapshot) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs animate-pulse">
        <div className="h-6 bg-slate-200 rounded-md w-1/3 mb-4"></div>
        <div className="h-4 bg-slate-100 rounded-md w-1/2 mb-2"></div>
        <div className="h-20 bg-slate-50 rounded-xl"></div>
      </div>
    );
  }

  if (!snapshot) return null;

  const { text: timeAgoText, minutes: minutesAgo, isStale } = timeState;

  const displayPeople = Number.isFinite(snapshot.peopleAhead) ? Math.max(0, snapshot.peopleAhead) : 0;
  const displayActive = Number.isFinite(snapshot.activeCounters) ? Math.max(0, snapshot.activeCounters) : 0;
  const displayAvg = Number.isFinite(snapshot.averageServiceMinutes) ? Math.max(1, snapshot.averageServiceMinutes) : 5;
  const displayUnavailable = Number.isFinite(snapshot.unavailableCounters) ? Math.max(0, snapshot.unavailableCounters) : 0;

  const defaultStatusConfig = {
    label: 'Open & Serving',
    bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  };

  const statusConfig = {
    OPEN: defaultStatusConfig,
    PAUSED: {
      label: 'Temporarily Paused',
      bg: 'bg-amber-50 border-amber-200 text-amber-800',
      dot: 'bg-amber-500',
      icon: PauseCircle,
    },
    CLOSED: {
      label: 'Closed for Today',
      bg: 'bg-slate-100 border-slate-200 text-slate-700',
      dot: 'bg-slate-500',
      icon: XCircle,
    },
  }[snapshot.status] || defaultStatusConfig;

  const StatusIcon = statusConfig.icon;

  return (
    <section
      aria-labelledby="queue-status-heading"
      className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/90 shadow-xs transition-all"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600 shrink-0" aria-hidden="true" />
            <h2 id="queue-status-heading" className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
              {snapshot.name}
            </h2>
          </div>
          <p className="text-sm text-slate-500 mt-0.5 ml-7">{snapshot.location}</p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.bg}`}
          >
            <span className={`w-2 h-2 rounded-full ${statusConfig.dot} animate-pulse`} aria-hidden="true" />
            <StatusIcon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{statusConfig.label}</span>
          </div>

          {/* SSE Live indicator */}
          <div
            title={isConnected ? 'Real-time updates active via SSE' : 'Reconnecting to live queue feed...'}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 border border-slate-200 text-slate-600"
          >
            <Radio
              className={`w-3 h-3 ${isConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`}
              aria-hidden="true"
            />
            <span>{isConnected ? 'Live Sync' : 'Reconnecting'}</span>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 my-4">
        {/* People Ahead */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>People in Line</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{displayPeople}</div>
          <div className="text-[11px] text-slate-400">Total waiting ahead</div>
        </div>

        {/* Active Counters */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            <span>Active Windows</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{displayActive}</div>
          <div className="text-[11px] text-slate-400">Open staff stations</div>
        </div>

        {/* Unavailable Counters */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            <span>Offline Windows</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{displayUnavailable}</div>
          <div className="text-[11px] text-slate-400">
            {displayUnavailable > 0 ? 'Maintenance/outage' : 'All available'}
          </div>
        </div>

        {/* Service Pace */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Average Service</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{displayAvg}m</div>
          <div className="text-[11px] text-slate-400">Per visitor desk time</div>
        </div>
      </div>

      {/* Staff Announcement if present */}
      {snapshot.announcement ? (
        <div
          role="region"
          aria-label="Staff Announcement"
          className="mt-3 p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/80 flex items-start gap-3"
        >
          <Megaphone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            <span className="font-semibold">Counter Announcement: </span>
            <span>{snapshot.announcement}</span>
          </div>
        </div>
      ) : null}

      {/* Stale data warning if older than threshold */}
      {isStale && (
        <div
          role="alert"
          className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
          <span>
            Queue snapshot has not been updated in {minutesAgo} minutes. Wait times may have drifted; bounds have
            been widened.
          </span>
        </div>
      )}

      {/* Last Updated Timestamp Footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <div>
          Queue Code: <span className="font-mono font-semibold text-slate-600">{snapshot.queueId}</span> (v{snapshot.version})
        </div>
        <div aria-live="polite">
          Updated {timeAgoText}
        </div>
      </div>
    </section>
  );
});

QueueStatusBanner.displayName = 'QueueStatusBanner';
