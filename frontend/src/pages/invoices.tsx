import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FileDown, Mail, MessageCircle, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  status: string;
  grandTotal: string;
  paidAmount: string;
  customer?: { name: string };
}
interface Sale {
  id: string;
  saleNumber: string;
  grandTotal: string;
  customer?: { name: string };
}

const statusStyle: Record<string, string> = {
  PAID: 'bg-success/10 text-success',
  ISSUED: 'bg-blue-500/10 text-blue-500',
  OVERDUE: 'bg-destructive/10 text-destructive',
  PARTIALLY_PAID: 'bg-amber-500/10 text-amber-500',
};

function CreateInvoiceDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: sales = [] } = useQuery<Sale[]>({
    queryKey: ['sales'],
    queryFn: async () => (await api.get('/sales')).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async (saleId: string) => (await api.post('/invoices', { saleId })).data,
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.invoiceNumber} created`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not create invoice'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invoice from Sale</DialogTitle>
          <DialogDescription>
            Pick a completed sale to generate an invoice. Walk-in sales are billed to “Walk-in
            Customer”.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {sales.map((s) => (
            <button
              key={s.id}
              disabled={create.isPending}
              onClick={() => create.mutate(s.id)}
              className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span>
                <span className="font-medium">{s.saleNumber}</span>
                <span className="ml-2 text-muted-foreground">{s.customer?.name ?? 'Walk-in'}</span>
              </span>
              <span className="font-medium">{formatCurrency(Number(s.grandTotal))}</span>
            </button>
          ))}
          {sales.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No sales available.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => (await api.get('/invoices')).data,
  });

  const viewPdf = async (id: string) => {
    setBusy(id + 'pdf');
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('Could not generate PDF');
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = async (id: string) => {
    setBusy(id + 'mail');
    try {
      const { data } = await api.post(`/invoices/${id}/send-email`);
      if (data.sent) toast.success(data.message);
      else toast.warning(data.message);
      qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Email failed');
    } finally {
      setBusy(null);
    }
  };

  const sendWhatsapp = async (id: string) => {
    setBusy(id + 'wa');
    try {
      const { data } = await api.post(`/invoices/${id}/send-whatsapp`);
      if (!data.hasPhone)
        toast.warning('Customer has no phone — opening WhatsApp without a recipient.');
      window.open(data.url, '_blank');
    } catch {
      toast.error('Could not open WhatsApp');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{invoices.length} invoice(s)</p>
        <CreateInvoiceDialog />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Invoice #</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              invoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(inv.issueDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.customer?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        statusStyle[inv.status] ?? 'bg-muted',
                      )}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(Number(inv.grandTotal))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="View PDF"
                        disabled={busy === inv.id + 'pdf'}
                        onClick={() => viewPdf(inv.id)}
                      >
                        {busy === inv.id + 'pdf' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Send Email"
                        disabled={busy === inv.id + 'mail'}
                        onClick={() => sendEmail(inv.id)}
                      >
                        {busy === inv.id + 'mail' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-success"
                        title="Send on WhatsApp"
                        disabled={busy === inv.id + 'wa'}
                        onClick={() => sendWhatsapp(inv.id)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  No invoices yet — click “New Invoice” to generate one from a sale.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
