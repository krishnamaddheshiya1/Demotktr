import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode } from 'lucide-react';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  queueId: string;
}

const qrDataUrlCache = new Map<string, string>();

export const QrModal: React.FC<QrModalProps> = ({ isOpen, onClose, queueId }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);

  const url = typeof window !== 'undefined' ? `${window.location.origin}/?code=${queueId}` : `https://queueless.local/?code=${queueId}`;

  useEffect(() => {
    if (isOpen) {
      setQrError(false);
      const cached = qrDataUrlCache.get(url);
      if (cached) {
        setQrDataUrl(cached);
        return;
      }
      QRCode.toDataURL(url.slice(0, 1000), {
        width: 280,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((dataUrl) => {
          qrDataUrlCache.set(url, dataUrl);
          setQrDataUrl(dataUrl);
        })
        .catch(() => setQrError(true));
    }
  }, [isOpen, url]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-600" aria-hidden="true" />
            <h2 id="qr-modal-title" className="text-lg font-semibold text-slate-900">
              Queue QR Shortcut
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close QR dialog"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center py-5">
          <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR Code for queue ${queueId}`} className="w-56 h-56 rounded-lg" />
            ) : qrError ? (
              <div className="w-56 h-56 flex flex-col items-center justify-center text-rose-600 text-xs text-center p-3">
                <span className="font-semibold">Unable to generate QR code</span>
                <span className="text-slate-500 mt-1">Please use the copy link button below</span>
              </div>
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-slate-400">Loading QR...</div>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            Scan with your mobile camera to open this queue advisor instantly on your phone.
          </p>
          <div className="mt-2 text-xs font-mono bg-slate-100 px-3 py-1 rounded-md text-slate-700 font-medium">
            Queue ID: {queueId}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Link Copied' : 'Copy Queue Link'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
