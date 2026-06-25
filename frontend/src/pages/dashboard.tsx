import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface Kpis {
  todaySales: number;
  monthSales: number;
  totalRevenue: number;
  totalExpenses: number;
  stockValue: number;
  outstandingReceivables: number;
  outstandingPayables: number;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${accent ?? 'bg-primary/10 text-primary'}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data: kpis } = useQuery<Kpis>({
    queryKey: ['kpis'],
    queryFn: async () => (await api.get('/dashboard/kpis')).data,
  });
  const { data: trend } = useQuery<{ date: string; total: number }[]>({
    queryKey: ['sales-trend'],
    queryFn: async () => (await api.get('/dashboard/sales-trend')).data,
  });
  const { data: top } = useQuery<{ name: string; revenue: number }[]>({
    queryKey: ['top-products'],
    queryFn: async () => (await api.get('/dashboard/top-products')).data,
  });

  const k = kpis ?? ({} as Kpis);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={formatCurrency(k.todaySales ?? 0)}
          icon={TrendingUp}
        />
        <KpiCard
          label="Monthly Sales"
          value={formatCurrency(k.monthSales ?? 0)}
          icon={DollarSign}
          accent="bg-success/10 text-success"
        />
        <KpiCard label="Total Revenue" value={formatCurrency(k.totalRevenue ?? 0)} icon={Receipt} />
        <KpiCard
          label="Stock Value"
          value={formatCurrency(k.stockValue ?? 0)}
          icon={Boxes}
          accent="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          label="Expenses"
          value={formatCurrency(k.totalExpenses ?? 0)}
          icon={Wallet}
          accent="bg-amber-500/10 text-amber-500"
        />
        <KpiCard
          label="Receivables"
          value={formatCurrency(k.outstandingReceivables ?? 0)}
          icon={ArrowDownLeft}
          accent="bg-emerald-500/10 text-emerald-500"
        />
        <KpiCard
          label="Payables"
          value={formatCurrency(k.outstandingPayables ?? 0)}
          icon={ArrowUpRight}
          accent="bg-rose-500/10 text-rose-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trend ?? []}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  fill="url(#g)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={top ?? []} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
