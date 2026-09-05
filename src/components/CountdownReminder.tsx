import React, { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, Volume2, Timer, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

interface CountdownReminderProps {
  initialMinutes: number;
  action: string;
  onReminderTriggered?: () => void;
}

// Synthesizes a pleasant 2-tone bell chime using Web Audio API
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    playTone(587.33, 0, 0.4); // D5
    playTone(880.0, 0.2, 0.8); // A5

    // Automatically close AudioContext after tone sequence to prevent audio resource leaks
    setTimeout(() => {
      try {
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {
        // Fallback for older browsers
      }
    }, 1200);
  } catch (err) {
    console.warn('Audio chime failed:', err);
  }
}

export const CountdownReminder: React.FC<CountdownReminderProps> = ({
  initialMinutes,
  action,
}) => {
  const safeInitialSecs = Number.isFinite(initialMinutes)
    ? Math.max(60, Math.round(initialMinutes * 60))
    : 300;

  const [secondsRemaining, setSecondsRemaining] = useState<number>(safeInitialSecs);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [permissionNotice, setPermissionNotice] = useState<string>('');
  const [hasTriggeredAlert, setHasTriggeredAlert] = useState<boolean>(false);
  const audioTested = useRef(false);

  // Synchronize when initialMinutes updates from a new or re-evaluated recommendation
  useEffect(() => {
    const updatedSecs = Number.isFinite(initialMinutes)
      ? Math.max(60, Math.round(initialMinutes * 60))
      : 300;
    setSecondsRemaining(updatedSecs);
    setIsActive(true);
    setHasTriggeredAlert(false);
  }, [initialMinutes]);

  // Check initial notification support
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Countdown timer interval
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  const handleTimeExpired = () => {
    setHasTriggeredAlert(true);
    playChime();

    // Trigger browser notification if granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('QueueLess: Your Turn is Approaching!', {
          body: 'Your estimated wait countdown has finished. Please return to Window 4 now.',
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('Notification trigger caught:', e);
      }
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionNotice('Browser notifications are not supported in this environment. In-app audio & visual alerts are active.');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === 'granted') {
        setPermissionNotice('Browser notifications enabled! You will be notified when your turn approaches.');
        try {
          new Notification('QueueLess Reminder Active', {
            body: `Countdown started for ~${initialMinutes} minutes. We will ping you before your turn.`,
          });
        } catch {
          // Iframe or preview sandbox may limit top-level notification
        }
      } else if (result === 'denied') {
        setPermissionNotice('Notification permission was denied. Don’t worry: loud visual and audio in-app alerts will notify you here.');
      }
    } catch (err) {
      setPermissionNotice('Notification request prevented by browser sandbox. In-app visual and sound alarms remain active.');
    }
  };

  const handleTestChime = () => {
    playChime();
    audioTested.current = true;
  };

  const handleResetCountdown = () => {
    setSecondsRemaining(Math.max(60, initialMinutes * 60));
    setIsActive(true);
    setHasTriggeredAlert(false);
  };

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <section
      aria-labelledby="countdown-timer-heading"
      className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/90 shadow-xs my-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Timer className="w-5 h-5 text-indigo-600" aria-hidden="true" />
          <h3 id="countdown-timer-heading" className="text-base font-bold text-slate-900">
            Turn Countdown & Return Alarm
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestChime}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            title="Play test audio chime"
          >
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Test Sound</span>
          </button>

          <button
            type="button"
            onClick={handleResetCountdown}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            title="Reset timer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Countdown Display */}
      <div className="py-5 text-center">
        <div
          role="timer"
          aria-live="polite"
          aria-atomic="true"
          className="text-5xl md:text-6xl font-black font-mono tracking-tight text-slate-900"
        >
          {formattedTime}
        </div>
        <p className="text-xs md:text-sm text-slate-500 mt-2 font-medium">
          {action === 'WAIT_HERE'
            ? 'Estimated remaining wait before your turn is called at the desk.'
            : 'Safe countdown until you should begin walking back to Window 4.'}
        </p>

        {hasTriggeredAlert && (
          <div
            role="alert"
            className="mt-4 p-4 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm md:text-base animate-bounce shadow-md flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-5 h-5 text-slate-950" aria-hidden="true" />
            <span>Time Reached! Please proceed to Window 4 now.</span>
          </div>
        )}
      </div>

      {/* Browser Notification Controls & Fallback */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          {notificationPermission === 'granted' ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Browser Notifications Enabled
            </span>
          ) : notificationPermission === 'denied' ? (
            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
              <BellOff className="w-4 h-4 text-amber-600" />
              Notifications blocked (In-app sound active)
            </span>
          ) : (
            <span className="text-slate-500">Enable alerts to get pinged on your device</span>
          )}
        </div>

        {notificationPermission !== 'granted' && (
          <button
            type="button"
            onClick={requestNotificationPermission}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Enable Reminder Alert</span>
          </button>
        )}
      </div>

      {permissionNotice && (
        <div className="mt-2.5 p-2 rounded-lg bg-slate-50 text-[11px] text-slate-600">
          {permissionNotice}
        </div>
      )}
    </section>
  );
};
