import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useLanguage } from '@/components/language-provider';

interface LinkStatus {
  status: 'connecting' | 'qr' | 'open' | 'closed';
  qr?: string;
  phone?: string;
  name?: string;
  error?: string;
}

/** Links a store's own WhatsApp number to the server the way WhatsApp Web
 * does (Linked devices → scan a QR code), so invoices go out from that
 * number. Polls while a QR code is showing or the link is (re)connecting.
 * Buttons are type="button" — this sits inside the Settings form. */
export function WhatsAppLinkPanel({ store }: { store?: string }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const params = store ? { store } : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-link', store],
    queryFn: async () => (await api.get('/whatsapp-link', { params })).data as LinkStatus,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'qr' || status === 'connecting' ? 2000 : false;
    },
  });

  // The Sales list shows "Send via WhatsApp" from settings' whatsappConfigured,
  // so refresh settings whenever the link status changes — including when a
  // scan completes while polling, not just on a button click.
  const status = data?.status;
  useEffect(() => {
    if (status) qc.invalidateQueries({ queryKey: ['settings'] });
  }, [status, qc]);

  const onChanged = (next: LinkStatus) => qc.setQueryData(['whatsapp-link', store], next);

  const connect = useMutation({
    mutationFn: async () =>
      (await api.post('/whatsapp-link/connect', undefined, { params })).data as LinkStatus,
    onSuccess: onChanged,
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('Could not start linking')),
  });
  const unlink = useMutation({
    mutationFn: async () =>
      (await api.post('/whatsapp-link/unlink', undefined, { params })).data as LinkStatus,
    onSuccess: (next) => {
      onChanged(next);
      toast.success(t('WhatsApp unlinked'));
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('Could not unlink')),
  });

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      {status === 'open' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span>
              {t('Linked')}: <span className="font-medium">+{data?.phone}</span>
              {data?.name ? <span className="text-muted-foreground"> ({data.name})</span> : null}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unlink.isPending}
            onClick={() => {
              if (
                window.confirm(
                  t('Unlink this WhatsApp number? Invoices will stop sending from it.'),
                )
              )
                unlink.mutate();
            }}
          >
            <Unlink className="h-4 w-4" /> {t('Unlink')}
          </Button>
        </div>
      )}

      {status === 'qr' && (
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
          {data?.qr && (
            <img
              src={data.qr}
              alt={t('WhatsApp link QR code')}
              className="h-48 w-48 rounded bg-white p-2"
            />
          )}
          <div className="space-y-2 text-sm">
            <p className="font-medium">{t('Scan with the phone you want to send invoices from')}</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>{t('Open WhatsApp on the phone')}</li>
              <li>{t('Go to Settings → Linked devices → Link a device')}</li>
              <li>{t('Point the camera at this code')}</li>
            </ol>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              {t('Cancel')}
            </Button>
          </div>
        </div>
      )}

      {status === 'connecting' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Connecting to WhatsApp…')}
        </div>
      )}

      {(status === 'closed' || !status) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {data?.error ?? t('No WhatsApp number linked.')}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={connect.isPending}
            onClick={() => connect.mutate()}
          >
            {connect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {t('Link WhatsApp')}
          </Button>
        </div>
      )}
    </div>
  );
}
