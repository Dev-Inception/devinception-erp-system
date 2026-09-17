import { create } from 'zustand';

/** Global, transient holder for whatever printable document (invoice, GRN,
 * estimate, ...) is currently being previewed — see PrintPreviewDialog,
 * mounted once in AppLayout. Plain functions that aren't React components
 * (lib/invoicePopup.ts) open it via `usePrintPreviewStore.getState().open`. */
interface PrintPreviewState {
  html: string | null;
  open: (html: string) => void;
  close: () => void;
}

export const usePrintPreviewStore = create<PrintPreviewState>((set) => ({
  html: null,
  open: (html) => set({ html }),
  close: () => set({ html: null }),
}));
