import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useLanguage } from '@/components/language-provider';
import { PayeePayments } from '@/components/payee-payments';

interface Labour {
  id: string;
  name: string;
  phoneNumber: string;
}

/** A labourer's jobs and what we paid for each. Labour is paid from
 * Expenses (Labour category, against the sale invoice) — not from here. */
export function LabourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data: labourList = [] } = useQuery<Labour[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
  });
  const labour = labourList.find((l) => l.id === id);

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/labour')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('Back to Labour')}
      </button>

      <Card>
        <CardContent className="pt-6">
          <CardTitle className="text-xl">{labour?.name ?? '…'}</CardTitle>
          {labour?.phoneNumber && (
            <p className="mt-1 text-sm text-muted-foreground">{labour.phoneNumber}</p>
          )}
        </CardContent>
      </Card>

      <PayeePayments kind="labour" id={id} />
    </div>
  );
}
