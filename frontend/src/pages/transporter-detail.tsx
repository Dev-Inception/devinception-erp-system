import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { PayeePayments } from '@/components/payee-payments';

interface Transporter {
  id: string;
  name: string;
  phone?: string;
  vehicleNumber?: string;
  address?: string;
}

/** A transporter's jobs and what we paid for each. Transport is paid from
 * Expenses (Transport category, against the sale invoice) — not from here. */
export function TransporterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const storefront = useStorefrontFilter();

  const { data: transporters = [] } = useQuery<Transporter[]>({
    queryKey: ['transporters', storefront.store],
    queryFn: async () => (await api.get('/transporters', { params: storefront })).data,
  });
  const transporter = transporters.find((tr) => tr.id === id);

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/transporters')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('Back to Transporters')}
      </button>

      <Card>
        <CardContent className="pt-6">
          <CardTitle className="text-xl">{transporter?.name ?? '…'}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {[transporter?.phone, transporter?.vehicleNumber, transporter?.address]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </CardContent>
      </Card>

      <PayeePayments kind="transporters" id={id} />
    </div>
  );
}
