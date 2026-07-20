import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingCart, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { openSaleInvoicePopup } from '@/lib/invoicePopup';

interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: string | number;
  amount: string | number;
}

interface Sale {
  id: string;
  saleNumber: string;
  date: string;
  grandTotal: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  paidCash: string;
  paidBank: string;
  paymentMethod: string;
  status: string;
  customer?: { name: string };
  items: SaleItem[];
  gatePassQrUrl?: string;
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Online',
  MIXED: 'Mixed',
  CARD: 'Card',
  CREDIT: 'Credit',
};

export function SalesPage() {
  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ['sales'],
    queryFn: async () => (await api.get('/sales')).data,
  });

  const handleViewInvoice = async (s: Sale) => {
    // Open synchronously so the browser ties the popup to this click, not to
    // the async gate-pass QR fetch that happens before it's filled in.
    const win = window.open('', '_blank', 'width=850,height=1000');
    win?.document.write(
      '<p style="font-family:sans-serif;padding:24px;color:#666">Preparing invoice…</p>',
    );
    try {
      await openSaleInvoicePopup(s, win);
    } catch {
      toast.error('Enable popups to view the printable invoice');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{sales.length} sale(s)</p>
        <Button asChild>
          <Link to="/pos">
            <ShoppingCart className="h-4 w-4" /> New Sale (POS)
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Sale #</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Cash</th>
              <th className="px-4 py-3 text-right font-medium">Online</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              sales.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.saleNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(s.date).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.customer?.name ?? 'Walk-in'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {Number(s.paidCash) > 0 ? formatCurrency(Number(s.paidCash)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {Number(s.paidBank) > 0 ? formatCurrency(Number(s.paidBank)) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(Number(s.grandTotal))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="View invoice"
                      onClick={() => handleViewInvoice(s)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            {!isLoading && sales.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No sales yet — ring one up in the POS.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
