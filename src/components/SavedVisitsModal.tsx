import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Ticket, X, Trash2, Clock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { QueueAction } from '../types.js';

interface SavedVisitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVisitQueue?: (queueId: string) => void;
}

export const SavedVisitsModal: React.FC<SavedVisitsModalProps> = ({
  isOpen,
  onClose,
  onSelectVisitQueue,
}) => {
  const { savedVisits, deleteVisit } = useAuth();

  if (!isOpen) return null;

  const getActionBadge = (action: QueueAction) => {
    switch (action) {
      case 'WAIT_HERE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3" /> Wait Here
          </span>
        );
      case 'WAIT_ELSEWHERE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
            <Clock className="w-3 h-3" /> Wait Elsewhere
          </span>
        );
      case 'COME_BACK_LATER':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
            <AlertTriangle className="w-3 h-3" /> Come Back Later
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-tickets-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-850 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
            <div>
              <h3 id="saved-tickets-title" className="text-sm font-bold text-slate-900 dark:text-white">
                Saved Tickets & Visits
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Synchronized with your authenticated profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {savedVisits.length === 0 ? (
            <div className="py-12 text-center">
              <Ticket className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No saved tickets yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
                When you calculate an action recommendation, click "Save Ticket" to store your reminder.
              </p>
            </div>
          ) : (
            savedVisits.map((visit) => (
              <div key={visit.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {visit.queueName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {visit.queueId}
                    </span>
                    {getActionBadge(visit.action)}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Est. Wait: <strong className="text-slate-700 dark:text-slate-300">{visit.waitMinMinutes}–{visit.waitMaxMinutes}m</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Saved: {new Date(visit.savedAt).toLocaleDateString()} {new Date(visit.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {visit.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2 rounded border border-slate-100 dark:border-slate-800">
                      {visit.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onSelectVisitQueue && (
                    <button
                      onClick={() => {
                        onSelectVisitQueue(visit.queueId);
                        onClose();
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                      title="Switch to this queue"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteVisit(visit.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Delete ticket"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
