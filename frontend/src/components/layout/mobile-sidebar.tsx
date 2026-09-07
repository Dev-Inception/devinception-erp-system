import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bell, Menu, Moon, Sun, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { SidebarNav } from './sidebar';
import { LanguageToggle } from './language-toggle';

// Below the `md` breakpoint the rail sidebar (sidebar.tsx) is hidden entirely,
// so phones/tablets need their own entry point to the same nav — a hamburger
// trigger that opens it as a left-side drawer over the page.
export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const { toggle } = useTheme();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-card shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200 md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-16 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              D
            </div>
            <DialogPrimitive.Title asChild>
              <span className="flex-1 truncate font-semibold tracking-tight">DevInception</span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Header controls that don't fit the top bar on mobile — relocated
              here instead of dropped. (The store switcher stays in the top
              bar itself since it's needed without opening the drawer.) */}
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">
            <LanguageToggle />
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
            </Button>
          </div>

          <SidebarNav collapsed={false} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
