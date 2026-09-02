import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Chrome/Edge (desktop + Android) fire `beforeinstallprompt` when the PWA
 * criteria are met (manifest + registered service worker + secure context);
 * we capture it so "Install" can be a single in-app button instead of
 * waiting on the browser's own UI. iOS Safari never fires that event or
 * shows any install prompt — Add to Home Screen is manual-only there, so we
 * just point people at it.
 */
export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === '1');

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    if (isIos()) setShowIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, [dismissed]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  if (dismissed || (!installEvent && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
        {installEvent ? (
          <>
            <Download className="h-5 w-5 shrink-0 text-primary" />
            <p className="flex-1 text-sm">
              Install this app for quick access from your home screen.
            </p>
            <Button size="sm" onClick={install}>
              Install
            </Button>
          </>
        ) : (
          <>
            <Share className="h-5 w-5 shrink-0 text-primary" />
            <p className="flex-1 text-sm">
              To install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
