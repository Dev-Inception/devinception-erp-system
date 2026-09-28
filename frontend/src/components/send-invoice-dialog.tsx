import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { sendSaleInvoiceEmail, sendSaleInvoiceWhatsApp } from '@/lib/invoicePopup';
import { useLanguage } from '@/components/language-provider';

interface SaleForSend {
  id: string;
  saleNumber: string;
  date: string;
  storeId?: string;
  storeName?: string;
  customer?: { name: string; phone?: string; email?: string };
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: string | number;
    amount: string | number;
  }[];
  subtotal: string | number;
  taxTotal: string | number;
  discountTotal: string | number;
  transportFare?: string | number;
  labourRentTotal?: string | number;
  grandTotal: string | number;
  paidAmount?: string | number;
  balanceDue?: string | number;
  previousBalance?: number | null;
  totalRemaining?: number | null;
  returnedTotal?: number;
  paymentMethod: string;
}

/** Sends the same invoice "Print Invoice" would produce (or, over WhatsApp, a
 * plain-text summary of it — see sendSaleInvoiceWhatsApp) to the customer on
 * file, defaulting to their saved email/phone but editable in case this sale
 * needs to go somewhere else just this once. */
export function SendInvoiceDialog({
  sale,
  channel,
  onClose,
}: {
  sale: SaleForSend;
  channel: 'email' | 'whatsapp';
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [to, setTo] = useState('');

  useEffect(() => {
    setTo((channel === 'email' ? sale.customer?.email : sale.customer?.phone) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale.id, channel]);

  const send = useMutation({
    mutationFn: async () => {
      // Only sales with returns need the extra round trip — everything else
      // sends immediately with no returns section, same as printing.
      const returns =
        Number(sale.returnedTotal) > 0
          ? ((await api.get(`/sales/${sale.id}/returns`)).data as {
              number: string;
              date: string;
              items: { name: string; quantity: number; lineTotal: number }[];
            }[])
          : [];
      const payload = {
        ...sale,
        returns: returns.map((r) => ({
          number: r.number,
          date: r.date,
          items: r.items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            amount: it.lineTotal,
          })),
        })),
      };
      if (channel === 'email') {
        await sendSaleInvoiceEmail(payload, to.trim());
      } else {
        await sendSaleInvoiceWhatsApp(payload, to.trim());
      }
    },
    onSuccess: () => {
      toast.success(channel === 'email' ? 'Invoice emailed' : 'Invoice sent over WhatsApp');
      onClose();
    },
    onError: (e: any) => {
      // The backend sends `message` as an array only for field-level
      // validation errors — a plain ApiError (e.g. "WhatsApp is not
      // configured...") comes back as a single string, and `message[0]`
      // on a string silently grabs its first character instead of falling
      // through, so the array case has to be checked explicitly.
      const msg = e?.response?.data?.message;
      toast.error((Array.isArray(msg) ? msg[0] : msg) || 'Send failed');
    },
  });

  const canSubmit = to.trim().length > 0 && !send.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channel === 'email' ? (
              <Mail className="h-4 w-4" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            {channel === 'email' ? t('Send via Email') : t('Send via WhatsApp')}
          </DialogTitle>
          <DialogDescription>{sale.saleNumber}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) send.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>{channel === 'email' ? t('Recipient email') : t('Recipient phone')}</Label>
            <Input
              type={channel === 'email' ? 'email' : 'tel'}
              required
              autoFocus
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={channel === 'email' ? 'customer@example.com' : '+92 300 1234567'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {send.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t('Send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
