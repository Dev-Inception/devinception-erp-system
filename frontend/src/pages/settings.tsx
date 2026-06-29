import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

interface Settings {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  currency: string;
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  const [form, setForm] = useState<Settings>({ companyName: '', currency: 'PKR' });
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.put('/settings', form)).data,
    onSuccess: () => {
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('Save failed (admin only)'),
  });

  const field = (k: keyof Settings, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Shown on invoices, receipts and purchase documents.</CardDescription>
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
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
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
