import React, { useState } from 'react';
import { AdvisorRecommendation, DeterministicEstimate } from '../types.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Clock,
  Compass,
  Calendar,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Accessibility,
  ArrowRight,
  Info,
  Ticket,
  Check,
} from 'lucide-react';

interface RecommendationCardProps {
  recommendation: AdvisorRecommendation;
  deterministic?: DeterministicEstimate;
  queueName?: string;
  queueId?: string;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = React.memo(({
  recommendation,
  deterministic,
  queueName = 'Campus Registration Desk',
  queueId = 'CAMPUS-REG-1',
}) => {
  const { user, saveVisit, signInWithGoogle, savedVisits } = useAuth();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const isAlreadySaved = savedVisits.some(
    (v) => v.queueId === queueId && v.action === recommendation.action && Math.abs(v.waitMinMinutes - recommendation.waitMinMinutes) === 0
  );

  const handleSaveTicket = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }

    setSaving(true);
    try {
      await saveVisit({
        queueId,
        queueName,
        action: recommendation.action,
        waitMinMinutes: recommendation.waitMinMinutes,
        waitMaxMinutes: recommendation.waitMaxMinutes,
        notes: recommendation.nextStep,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      console.error('Error saving visit ticket:', err);
    } finally {
      setSaving(false);
    }
  };
  const fallbackDetails = {
    title: 'WAIT HERE',
    badgeClass: 'bg-emerald-600 text-white shadow-emerald-500/20',
    borderClass: 'border-emerald-200 bg-emerald-50/40',
    icon: Clock,
    subtitle: 'Immediate or short wait. Remain in the counter lobby.',
  };

  const actionDetails = {
    WAIT_HERE: fallbackDetails,
    WAIT_ELSEWHERE: {
      title: 'WAIT ELSEWHERE',
      badgeClass: 'bg-indigo-600 text-white shadow-indigo-500/20',
      borderClass: 'border-indigo-200 bg-indigo-50/40',
      icon: Compass,
      subtitle: 'Safe window to step out. Visit a nearby café or library.',
    },
    COME_BACK_LATER: {
      title: 'COME BACK LATER',
      badgeClass: 'bg-amber-600 text-white shadow-amber-500/20',
      borderClass: 'border-amber-200 bg-amber-50/40',
      icon: Calendar,
      subtitle: 'Long queue or paused counter. Return during lighter traffic.',
    },
  }[recommendation.action] || fallbackDetails;

  const ActionIcon = actionDetails.icon;

  const safeMin = Number.isFinite(recommendation.waitMinMinutes) ? Math.max(0, recommendation.waitMinMinutes) : 0;
  const safeMax = Number.isFinite(recommendation.waitMaxMinutes) ? Math.max(safeMin, recommendation.waitMaxMinutes) : safeMin + 5;

  const confidenceBadge = {
    HIGH: { label: 'High Confidence', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    MEDIUM: { label: 'Medium Confidence', class: 'bg-amber-100 text-amber-800 border-amber-200' },
    LOW: { label: 'Low Confidence (Volatile)', class: 'bg-rose-100 text-rose-800 border-rose-200' },
  }[recommendation.confidence] || {
    label: 'Calculated Estimate',
    class: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  // Calculate target return clock time if returnInMinutes is given
  const returnClockTime = recommendation.returnInMinutes
    ? new Date(Date.now() + recommendation.returnInMinutes * 60000).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <article
      id="recommendation-result"
      tabIndex={-1}
      aria-labelledby="recommendation-action-heading"
      className={`rounded-2xl p-6 md:p-7 border ${actionDetails.borderClass} shadow-xs transition-all`}
    >
      {/* Top Banner & Source Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Recommended Decision</span>
          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${confidenceBadge.class}`}>
            {confidenceBadge.label}
          </span>
        </div>

        {/* AI vs Deterministic Fallback status & Save Ticket */}
        <div className="flex items-center gap-2">
          {recommendation.source === 'gemini' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-medium">
              <Sparkles className="w-3 h-3 text-indigo-600" aria-hidden="true" />
              <span>Interpreted by Gemini Flash</span>
            </span>
          ) : (
            <span
              title={recommendation.fallbackReason}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-300 text-xs font-medium"
            >
              <ShieldCheck className="w-3 h-3 text-slate-600" aria-hidden="true" />
              <span>Deterministic Rule Engine (Fallback)</span>
            </span>
          )}

          {justSaved ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Check className="w-3 h-3 text-emerald-600" />
              Saved
            </span>
          ) : (
            <button
              id="btn-save-recommendation-ticket"
              onClick={handleSaveTicket}
              disabled={saving}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${
                isAlreadySaved
                  ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                  : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 shadow-xs'
              }`}
              title={user ? 'Save ticket to your authenticated account' : 'Sign in to save this ticket'}
            >
              <Ticket className="w-3 h-3 text-indigo-600" />
              <span>{saving ? 'Saving...' : isAlreadySaved ? 'Saved' : 'Save Ticket'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Action Header */}
      <div className="my-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-base md:text-lg font-black tracking-wide shadow-xs uppercase mb-2 ${actionDetails.badgeClass}`}>
            <ActionIcon className="w-5 h-5 text-white" aria-hidden="true" />
            <h3 id="recommendation-action-heading">{actionDetails.title}</h3>
          </div>
          <p className="text-sm font-medium text-slate-700">{actionDetails.subtitle}</p>
        </div>

        {/* Wait Range Metric */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs min-w-[200px] text-left md:text-right">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estimated Wait Range</div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            {safeMin}–{safeMax}{' '}
            <span className="text-base font-medium text-slate-500">mins</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {deterministic ? `Based on ${deterministic.formulaExplanation}` : 'Bounded interval'}
          </div>
        </div>
      </div>

      {/* Plain Language Explanation */}
      <div className="bg-white rounded-xl p-4 md:p-5 border border-slate-200/80 my-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
          Queue Analysis
        </h4>
        <p className="text-sm md:text-base text-slate-800 leading-relaxed font-normal">
          {recommendation.explanation}
        </p>

        {/* Next Step Pill */}
        {recommendation.nextStep && (
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-start gap-2 text-xs md:text-sm text-slate-700 font-medium">
            <ArrowRight className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong className="text-slate-900 font-semibold">Immediate Next Step: </strong>
              {recommendation.nextStep}
            </span>
          </div>
        )}
      </div>

      {/* Return Time Callout (if waiting elsewhere or coming back) */}
      {recommendation.returnInMinutes && (
        <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 flex flex-wrap items-center justify-between gap-2 my-3">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            <div className="text-xs md:text-sm font-semibold">
              Suggested Check-in Time: {returnClockTime}
            </div>
          </div>
          <div className="text-xs font-mono font-bold bg-indigo-200/70 text-indigo-900 px-3 py-1 rounded-lg">
            ~{recommendation.returnInMinutes} min safe away time
          </div>
        </div>
      )}

      {/* Accessibility Guidance Card */}
      {recommendation.accessibilityGuidance && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 my-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            <Accessibility className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            <span>Accessibility & Accommodation Guidance</span>
          </div>
          <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
            {recommendation.accessibilityGuidance}
          </p>
        </div>
      )}

      {/* Transparent Assumptions & Formula */}
      {recommendation.assumptions && recommendation.assumptions.length > 0 && (
        <details className="mt-4 pt-3 border-t border-slate-200/60 text-xs text-slate-500 cursor-pointer">
          <summary className="font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 list-none">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>View Calculation Assumptions & Uncertainty Factors ({recommendation.assumptions.length})</span>
          </summary>
          <ul className="mt-2.5 space-y-1.5 pl-4 list-disc text-slate-600">
            {recommendation.assumptions.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Fallback reason banner if active */}
      {recommendation.fallbackReason && recommendation.source === 'deterministic_fallback' && (
        <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1 bg-slate-100 p-2 rounded-md">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Note: {recommendation.fallbackReason}</span>
        </div>
      )}
    </article>
  );
});

RecommendationCard.displayName = 'RecommendationCard';
