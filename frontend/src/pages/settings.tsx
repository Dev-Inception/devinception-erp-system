import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, resizeImageToDataUrl } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';

interface Settings {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  currency: string;
  invoiceNote?: string;
  logoUrl?: string;
  facebook?: string;
  instagram?: string;
  gmail?: string;
  tiktok?: string;
  website?: string;
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const storefront = useStorefrontFilter();
  const { data } = useQuery<Settings>({
    queryKey: ['settings', storefront.store],
    queryFn: async () => (await api.get('/settings', { params: storefront })).data,
  });

  const [form, setForm] = useState<Settings>({ companyName: '', currency: 'PKR' });
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.put('/settings', form, { params: storefront })).data,
    onSuccess: () => {
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('Save failed (admin only)'),
  });

  const field = (k: keyof Settings, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [logoBusy, setLogoBusy] = useState(false);

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setLogoBusy(true);
    try {
      field('logoUrl', await resizeImageToDataUrl(file));
    } catch {
      toast.error('Could not read that image');
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>
            Shown on invoices, receipts and purchase documents.{' '}
            {isSuperAdmin && !storefront.store
              ? 'These are the platform defaults — any store that has not set its own value falls back to what you enter here.'
              : 'Leave a field blank to use the default your admin has configured.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-2 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="col-span-2 space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <label
                  className={cn(
                    'relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-input bg-muted/30 text-muted-foreground hover:border-primary',
                    logoBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="" className="h-full w-full object-contain" />
                  ) : logoBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickLogo(e.target.files?.[0])}
                  />
                </label>
                {form.logoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field('logoUrl', '')}
                  >
                    <X className="h-3.5 w-3.5" /> {t('Remove')}
                  </Button>
                )}
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Company Name</Label>
              <Input
                value={form.companyName}
                onChange={(e) => field('companyName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone ?? ''} onChange={(e) => field('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => field('email', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Number (NTN)</Label>
              <Input
                value={form.taxNumber ?? ''}
                onChange={(e) => field('taxNumber', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => field('currency', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address ?? ''}
                onChange={(e) => field('address', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Invoice note</Label>
              <textarea
                dir="auto"
                rows={2}
                maxLength={1000}
                className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                value={form.invoiceNote ?? ''}
                onChange={(e) => field('invoiceNote', e.target.value)}
                placeholder={t(
                  'Printed at the bottom of every sale invoice, e.g. a return policy…',
                )}
              />
            </div>
            <div className="col-span-2 space-y-1.5 pt-2">
              <Label className="text-muted-foreground">Social & Contact Links</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Facebook</Label>
              <Input
                placeholder="facebook.com/yourpage"
                value={form.facebook ?? ''}
                onChange={(e) => field('facebook', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input
                placeholder="instagram.com/yourpage"
                value={form.instagram ?? ''}
                onChange={(e) => field('instagram', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gmail</Label>
              <Input
                type="email"
                placeholder="you@gmail.com"
                value={form.gmail ?? ''}
                onChange={(e) => field('gmail', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>TikTok</Label>
              <Input
                placeholder="tiktok.com/@yourpage"
                value={form.tiktok ?? ''}
                onChange={(e) => field('tiktok', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Website</Label>
              <Input
                placeholder="www.yourcompany.com"
                value={form.website ?? ''}
                onChange={(e) => field('website', e.target.value)}
              />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('Save changes')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Printer mapping, WhatsApp and SMTP — configured per docs/INTEGRATIONS.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Invoice/Tax/Printer/WhatsApp/Email config blocks are stored on the company record (JSON)
          and will get dedicated editors in the next iteration.
        </CardContent>
      </Card>
    </div>
  );
}
