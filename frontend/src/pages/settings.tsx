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
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpPassSet?: boolean;
  smtpFrom?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioAuthTokenSet?: boolean;
  twilioWhatsAppFrom?: string;
  labourPricingMode?: LabourPricingMode;
}

type LabourPricingMode = 'DIRECT' | 'PENDING';

const LABOUR_PRICING_OPTIONS: { value: LabourPricingMode; title: string; description: string }[] = [
  {
    value: 'DIRECT',
    title: 'Direct from sale',
    description:
      'The labour amount charged on the sale invoice is owed to the labourer in full, straight away.',
  },
  {
    value: 'PENDING',
    title: 'Decide later in Pending Entities',
    description:
      'The customer is still charged the labour amount on the invoice, but each labour line goes to Pending Entities. Whoever can price pending entities enters what was agreed with the labourer; only that amount goes to the labour ledger, and the rest stays with the store.',
  },
];

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
    // Labour pricing is saved on its own by LabourPricingCard — never
    // resend it from here, or a stale copy could undo that change.
    mutationFn: async () =>
      (
        await api.put(
          '/settings',
          { ...form, labourPricingMode: undefined },
          { params: storefront },
        )
      ).data,
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

      <LabourPricingCard isSuperAdmin={isSuperAdmin} storefrontStore={storefront.store} />

      <Card>
        <CardHeader>
          <CardTitle>{t('Notifications')}</CardTitle>
          <CardDescription>
            {t(
              'Lets staff send a sale invoice straight to a customer by email or WhatsApp from the Sales list. Optional — sales work fine without either configured.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-3">
              <Label className="text-muted-foreground">{t('Email (SMTP)')}</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('SMTP Host')}</Label>
                  <Input
                    placeholder="smtp.gmail.com"
                    value={form.smtpHost ?? ''}
                    onChange={(e) => field('smtpHost', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('SMTP Port')}</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={form.smtpPort ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, smtpPort: Number(e.target.value) || undefined }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('SMTP Username')}</Label>
                  <Input
                    value={form.smtpUser ?? ''}
                    onChange={(e) => field('smtpUser', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('SMTP Password')}</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder={form.smtpPassSet ? '••••••••  (saved — leave blank to keep)' : ''}
                    value={form.smtpPass ?? ''}
                    onChange={(e) => field('smtpPass', e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t('From Address')}</Label>
                  <Input
                    placeholder="MyStore <billing@mystore.com>"
                    value={form.smtpFrom ?? ''}
                    onChange={(e) => field('smtpFrom', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'Using Gmail: create an "App Password" (Google Account → Security → 2-Step Verification → App passwords) — a normal Gmail password will not work. Host smtp.gmail.com, port 587. Any other provider (business email, Outlook, Zoho…) works too — use the SMTP details they give you. Leave blank to send from the platform default address instead.',
                )}
              </p>
            </div>

            <div className="space-y-3 border-t pt-4">
              <Label className="text-muted-foreground">{t('WhatsApp (Twilio)')}</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('Twilio Account SID')}</Label>
                  <Input
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={form.twilioAccountSid ?? ''}
                    onChange={(e) => field('twilioAccountSid', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('Twilio Auth Token')}</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      form.twilioAuthTokenSet ? '••••••••  (saved — leave blank to keep)' : ''
                    }
                    value={form.twilioAuthToken ?? ''}
                    onChange={(e) => field('twilioAuthToken', e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t('WhatsApp-enabled number')}</Label>
                  <Input
                    placeholder="whatsapp:+14155238886"
                    value={form.twilioWhatsAppFrom ?? ''}
                    onChange={(e) => field('twilioWhatsAppFrom', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Sign up at twilio.com → Console gives you the Account SID and Auth Token right on the dashboard. For testing, join Twilio's WhatsApp Sandbox (Messaging → Try it out → Send a WhatsApp message) and use its sandbox number — free, but customers must first send your sandbox its join code. For real customers, apply for a Twilio WhatsApp Sender with your own business number (takes Meta a few days to approve).",
                )}
              </p>
            </div>

            <div className="flex justify-end">
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
    </div>
  );
}

interface StoreOption {
  id: string;
  name: string;
}

/** Per-store labour pricing mode. A store admin edits their own store's; a
 * super admin edits whichever store the header switcher is on, or — under
 * "All Stores" — picks one right here, since this setting has no platform
 * default. Saves only this field, independent of the other settings forms. */
function LabourPricingCard({
  isSuperAdmin,
  storefrontStore,
}: {
  isSuperAdmin: boolean;
  storefrontStore?: string;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const needsPicker = isSuperAdmin && !storefrontStore;

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
    enabled: needsPicker,
  });
  const [pickedStore, setPickedStore] = useState('');
  useEffect(() => {
    if (needsPicker && !pickedStore && stores.length > 0) setPickedStore(stores[0].id);
  }, [needsPicker, pickedStore, stores]);

  const targetStore = needsPicker ? pickedStore || undefined : storefrontStore;
  const params = targetStore ? { store: targetStore } : {};

  const { data } = useQuery<Settings>({
    queryKey: ['settings', targetStore],
    queryFn: async () => (await api.get('/settings', { params })).data,
    enabled: !needsPicker || !!targetStore,
  });

  const [mode, setMode] = useState<LabourPricingMode>('DIRECT');
  useEffect(() => {
    if (data) setMode(data.labourPricingMode ?? 'DIRECT');
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.put('/settings', { labourPricingMode: mode }, { params })).data,
    onSuccess: () => {
      toast.success(t('Labour pricing saved'));
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? t('Could not save labour pricing')),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Labour pricing')}</CardTitle>
        <CardDescription>
          {t(
            'How labour charged on a POS sale is paid out to the labourer. Applies to new sales only — existing sales keep the mode they were made under.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsPicker && (
          <div className="space-y-1.5">
            <Label>{t('Store')}</Label>
            <select
              value={pickedStore}
              onChange={(e) => setPickedStore(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:w-64"
            >
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {LABOUR_PRICING_OPTIONS.map((opt) => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(opt.value)}
                className={cn(
                  'rounded-lg border p-3 text-left transition',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-muted/40',
                )}
              >
                <p className="text-sm font-medium">{t(opt.title)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t(opt.description)}</p>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={save.isPending || (needsPicker && !targetStore)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('Save changes')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
