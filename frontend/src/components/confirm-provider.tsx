import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' styles the dialog for a delete/irreversible action (red icon, red confirm button). */
  variant?: 'default' | 'destructive';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/**
 * App-wide replacement for window.confirm: a styled modal instead of the
 * bare browser dialog, used the same way — `if (await confirm({ ... }))`.
 * Mounted once near the root (see App.tsx); any component calls
 * `useConfirm()` to get the imperative confirm function.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<(value: boolean) => void>();

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = undefined;
    setOptions(null);
  };

  const destructive = options?.variant === 'destructive';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!options} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent className="max-w-sm" hideClose>
          {options && (
            <>
              <DialogHeader className="items-center text-center sm:items-center sm:text-center">
                <div
                  className={cn(
                    'mb-1 flex h-12 w-12 items-center justify-center rounded-full',
                    destructive
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {destructive ? (
                    <AlertTriangle className="h-6 w-6" />
                  ) : (
                    <HelpCircle className="h-6 w-6" />
                  )}
                </div>
                <DialogTitle>{options.title}</DialogTitle>
                {options.description && (
                  <DialogDescription>{options.description}</DialogDescription>
                )}
              </DialogHeader>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => settle(false)}
                >
                  {options.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                  type="button"
                  variant={destructive ? 'destructive' : 'default'}
                  className="flex-1"
                  onClick={() => settle(true)}
                  autoFocus
                >
                  {options.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

/** Convenience wrapper for the common case: confirming a delete. */
export function useConfirmDelete() {
  const confirm = useConfirm();
  return useMemo(
    () =>
      (subject: string, note = 'This cannot be undone.') =>
        confirm({
          title: `Delete ${subject}?`,
          description: note,
          confirmLabel: 'Delete',
          variant: 'destructive',
        }),
    [confirm],
  );
}
