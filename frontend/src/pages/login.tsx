import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, TrendingUp, Boxes, Wallet, ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';
import { landingPath } from '@/lib/modules';

/* ── Faux dashboard shown on the brand panel ── */
function DashboardPreview() {
  const kpis = [
    {
      icon: TrendingUp,
      label: "Today's Sales",
      value: '₨ 84,200',
      delta: '+12%',
      tint: 'text-indigo-600 bg-indigo-50',
    },
    {
      icon: Boxes,
      label: 'Stock Value',
      value: '₨ 1.28M',
      delta: '+3%',
      tint: 'text-blue-600 bg-blue-50',
    },
    {
      icon: Wallet,
      label: 'Net Profit',
      value: '₨ 21,400',
      delta: '+8%',
      tint: 'text-emerald-600 bg-emerald-50',
    },
  ];
  const top = [
    { name: 'Mechanical Keyboard', pct: 92 },
    { name: 'Wireless Mouse', pct: 68 },
    { name: 'USB-C Cable', pct: 41 },
  ];

  return (
    <div className="animate-float space-y-3 rounded-2xl border border-white/30 bg-white/95 p-4 text-left text-slate-900 shadow-2xl backdrop-blur-xl">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 pb-1">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 text-xs font-medium text-slate-400">DevInception · Dashboard</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2.5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm"
          >
            <div className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg ${k.tint}`}>
              <k.icon className="h-3.5 w-3.5" />
            </div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {k.label}
            </p>
            <p className="text-sm font-bold">{k.value}</p>
            <p className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
              <ArrowUpRight className="h-2.5 w-2.5" />
              {k.delta}
            </p>
          </div>
        ))}
      </div>

      {/* Sales trend chart */}
      <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold">Sales Trend</p>
          <p className="text-[10px] text-slate-400">Last 30 days</p>
        </div>
        <svg viewBox="0 0 320 90" className="h-20 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,70 C30,55 50,58 80,42 S140,22 175,34 S235,12 270,26 S310,16 320,20"
            fill="none"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M0,70 C30,55 50,58 80,42 S140,22 175,34 S235,12 270,26 S310,16 320,20 L320,90 L0,90 Z"
            fill="url(#area)"
          />
        </svg>
      </div>

      {/* Top products */}
      <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold">Top Products</p>
        <div className="space-y-2">
          {top.map((t) => (
            <div key={t.name} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{t.name}</span>
                <span className="font-medium text-slate-400">{t.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${t.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('admin@devinception.com');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // Land on the first module this user can actually see (a cashier, for
      // example, can't open the dashboard, so send them to their first module).
      const user = useAuthStore.getState().user;
      navigate(landingPath(user?.role, user?.permissions), { replace: true });
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ── Brand panel with product preview (content centered) ── */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 lg:flex lg:flex-col">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="animate-blob absolute -right-20 top-10 h-72 w-72 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="animate-blob delay-500 absolute -left-10 bottom-10 h-72 w-72 rounded-full bg-blue-300/30 blur-3xl" />

        {/* centered column within the left section */}
        <div className="relative flex h-full flex-col items-center justify-center px-12 py-10 text-center text-white">
          <div className="animate-fade-in-up flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 font-bold backdrop-blur">
              D
            </div>
            <span className="text-lg font-semibold tracking-tight">DevInception ERP</span>
          </div>

          <h2 className="animate-fade-in-up delay-100 mt-8 max-w-md text-3xl font-bold leading-tight tracking-tight">
            Everything you need, in one clean dashboard.
          </h2>
          <p className="animate-fade-in-up delay-200 mt-3 max-w-md text-base text-white/75">
            POS, inventory, purchasing, invoicing and reporting — see your whole business at a
            glance.
          </p>

          <div className="animate-fade-in-up delay-300 mt-8 w-full max-w-md">
            <DashboardPreview />
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="flex items-center justify-center bg-background p-6">
        <Card className="animate-fade-in-up w-full max-w-sm border-0 shadow-none sm:border sm:shadow-xl">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
                D
              </div>
              <span className="font-semibold">DevInception ERP</span>
            </div>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="animate-fade-in-up delay-100 space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="animate-fade-in-up delay-200 space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="animate-fade-in-up delay-300 group relative w-full overflow-hidden"
                disabled={loading}
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <p className="animate-fade-in delay-500 text-center text-xs text-muted-foreground">
                Demo: admin@devinception.com / Password123!
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
