import { useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePrintPreviewStore } from '@/store/printPreview';
import { useLanguage } from '@/components/language-provider';

const FALLBACK_SIZE = { width: 560, height: 600 };

/** Renders whatever printable document (invoice, GRN, estimate, ...) is
 * currently in usePrintPreviewStore, in-app instead of a separate browser
 * tab — every document still uses the same INVOICE_A4 HTML template (see
 * lib/invoicePopup.ts), just shown in an iframe here rather than popped out.
 * The iframe is measured on load and sized to its actual content (the
 * template's own fixed 148mm width, whatever height the items/sections add
 * up to) so the modal hugs the document instead of leaving a big blank
 * fixed-size box around it. Mounted once in AppLayout. */
export function PrintPreviewDialog() {
  const { t } = useLanguage();
  const html = usePrintPreviewStore((s) => s.html);
  const close = usePrintPreviewStore((s) => s.close);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLoad = () => {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    setSize({ width: body.scrollWidth, height: body.scrollHeight });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      close();
      setSize(null);
    }
  };

  return (
    <Dialog open={html !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="flex w-auto max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-sm font-semibold">{t('Print Preview')}</DialogTitle>
          <Button
            size="sm"
            className="mr-6"
            onClick={() => iframeRef.current?.contentWindow?.print()}
          >
            <Printer className="h-4 w-4" /> {t('Print')}
          </Button>
        </div>
        <div className="max-h-[85vh] overflow-auto">
          {html && (
            <iframe
              ref={iframeRef}
              title="print-preview"
              srcDoc={html}
              onLoad={handleLoad}
              style={{
                width: (size ?? FALLBACK_SIZE).width,
                height: (size ?? FALLBACK_SIZE).height,
              }}
              className="block border-0 bg-white"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
