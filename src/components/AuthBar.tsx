import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { User, LogIn, LogOut, ShieldCheck, Ticket, KeyRound, ChevronDown } from 'lucide-react';

interface AuthBarProps {
  onOpenSavedVisits: () => void;
  onOpenStaffElevation: () => void;
  onOpenStaffConsole: () => void;
}

export const AuthBar: React.FC<AuthBarProps> = ({
  onOpenSavedVisits,
  onOpenStaffElevation,
  onOpenStaffConsole,
}) => {
  const { user, profile, isStaff, loading, signInWithGoogle, signOutUser, savedVisits } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 animate-pulse">
        <div className="w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700" />
        <span>Authenticating...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        id="btn-sign-in-google"
        onClick={signInWithGoogle}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400"
        title="Sign in with Google to save tickets and sync visit history"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Sign In</span>
      </button>
    );
  }

  const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="btn-user-profile-menu"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="w-5 h-5 rounded-full object-cover border border-slate-200 dark:border-slate-600"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-[10px]">
            {displayName[0]?.toUpperCase() || 'U'}
          </div>
        )}

        <span className="max-w-[110px] truncate">{displayName}</span>

        {isStaff ? (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
            <ShieldCheck className="w-2.5 h-2.5" />
            Staff
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            Visitor
          </span>
        )}

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white dark:bg-slate-850 shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-xs divide-y divide-slate-100 dark:divide-slate-800">
          <div className="px-3 py-2">
            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user.email || 'Google Account'}</p>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <span>Role:</span>
              <span className="font-medium text-indigo-600 dark:text-indigo-400 capitalize">
                {profile?.role || 'visitor'}
              </span>
            </div>
          </div>

          <div className="py-1">
            <button
              id="btn-menu-saved-tickets"
              onClick={() => {
                setDropdownOpen(false);
                onOpenSavedVisits();
              }}
              className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Ticket className="w-3.5 h-3.5 text-indigo-500" />
                Saved Tickets
              </span>
              {savedVisits.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  {savedVisits.length}
                </span>
              )}
            </button>

            {isStaff ? (
              <button
                id="btn-menu-staff-console"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenStaffConsole();
                }}
                className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Staff Console
              </button>
            ) : (
              <button
                id="btn-menu-elevate-staff"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenStaffElevation();
                }}
                className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                Unlock Staff Role
              </button>
            )}
          </div>

          <div className="py-1">
            <button
              id="btn-menu-signout"
              onClick={() => {
                setDropdownOpen(false);
                signOutUser();
              }}
              className="w-full text-left px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
