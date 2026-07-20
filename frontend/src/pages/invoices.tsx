import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FileDown, Mail, MessageCircle, Loader2, Wallet, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  status: string;
  grandTotal: string;
  paidAmount: string;
  vendor?: { name: string };
}

const statusStyle: Record<string, string> = {
  PAID: 'bg-success/10 text-success',
  ISSUED: 'bg-blue-500/10 text-blue-500',
  OVERDUE: 'bg-destructive/10 text-destructive',
  PARTIALLY_PAID: 'bg-amber-500/10 text-amber-500',
};

function PayInvoiceDialog({
  invoice,
  balance,
  trigger,
}: {
  invoice: Invoice;
  balance: number;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance);

  useEffect(() => {
    if (open) setAmount(balance);
  }, [open, balance]);

  const pay = useMutation({
    mutationFn: async () =>
      (await api.post(`/invoices/${invoice.id}/pay`, { amount, method: 'CASH' })).data,
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not record payment'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            {invoice.invoiceNumber} — outstanding {formatCurrency(balance)}. Recorded as a cash
            receipt against the customer.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            pay.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min={0.01}
              max={balance}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pay.isPending || amount <= 0 || amount > balance}>
              {pay.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Record
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// OVERDUE is styled in statusStyle for forward-compat but the backend never
// actually computes it today, so it's left out of the filter options below.
const STATUSES = ['PAID', 'ISSUED', 'PARTIALLY_PAID'];

export function InvoicesPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const perms = useAuthStore((s) => s.user?.permissions);
  const canPay = grantsPermission(perms, 'invoices:create');

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', status, from, to],
    queryFn: async () =>
      (await api.get('/invoices', { params: { status: status || undefined, from, to } })).data,
  });

  const q = search.trim().toLowerCase();
  const filteredInvoices = q
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          inv.vendor?.name?.toLowerCase().includes(q),
      )
    : invoices;

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">{filteredInvoices.length} invoice(s)</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice # or vendor…"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Invoice #</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
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
              filteredInvoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(inv.issueDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.vendor?.name ?? '—'}</td>
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
                      {canPay && Number(inv.grandTotal) - Number(inv.paidAmount) > 0 && (
                        <PayInvoiceDialog
                          invoice={inv}
                          balance={Number(inv.grandTotal) - Number(inv.paidAmount)}
                          trigger={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-emerald-600"
                              title="Record payment"
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          }
                        />
                      )}
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
            {!isLoading && invoices.length > 0 && filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  No invoices match “{search}”.
                </td>
              </tr>
            )}
            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  No invoices yet — invoices are generated automatically from vendor purchases.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
