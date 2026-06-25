import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Scaffolded module screen — wired into routing/nav, pending full implementation. */
export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">
          API contract &amp; data model are ready — see <code>docs/API.md</code> and the roadmap.
        </p>
      </CardContent>
    </Card>
  );
}
