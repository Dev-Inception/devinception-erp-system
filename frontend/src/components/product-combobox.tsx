import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';

/**
 * Searchable picker for one POS row (product, vendor, …). Typing filters the
 * options; arrow keys + Enter pick one. Typing a name that isn't in the list
 * offers "Add … as a new …" (when `onCreate` is given) — the caller creates
 * it and fills the row.
 *
 * The list is rendered in a portal with fixed positioning: the POS table
 * sits in a horizontally scrolling container, which would clip an absolutely
 * positioned dropdown.
 */
export function Combobox<T>({
  options,
  getKey,
  getLabel,
  matches: matchesQuery,
  renderOption,
  selectedLabel,
  onSelect,
  onCreate,
  createNoun,
  creating,
  placeholder,
  emptyText,
  invalid,
  autoFocus,
  className,
  onEnterExact,
  onQueryChange,
}: {
  options: T[];
  getKey: (o: T) => string;
  getLabel: (o: T) => string;
  /** Extra text an option matches on besides its label (e.g. SKU, phone). */
  matches?: (o: T, query: string) => boolean;
  renderOption?: (o: T) => ReactNode;
  selectedLabel: string;
  onSelect: (o: T) => void;
  onCreate?: (name: string) => void;
  /** e.g. "product" → "Add “x” as a new product". */
  createNoun?: string;
  creating?: boolean;
  placeholder: string;
  emptyText: string;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Picks the option an Enter press should jump straight to (a scanned
   * barcode/SKU), ahead of the highlighted one. */
  onEnterExact?: (options: T[], query: string) => number;
  /** Called with the typed text, for callers that search server-side and
   * feed the results back in as `options`. */
  onQueryChange?: (query: string) => void;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = (
    q
      ? options.filter(
          (o) => getLabel(o).toLowerCase().includes(q) || (matchesQuery?.(o, q) ?? false),
        )
      : options
  ).slice(0, 50);
  const exactMatch = q !== '' && options.some((o) => getLabel(o).trim().toLowerCase() === q);
  const canCreate = Boolean(onCreate) && q !== '' && !exactMatch;
  const optionCount = filtered.length + (canCreate ? 1 : 0);

  // Keep the floating list glued under the input while it's open. Tracked
  // every frame rather than on scroll/resize alone: the input can move
  // without either firing — e.g. focused as a modal opens, while the modal
  // is still animating in — which left the list stranded where it started.
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) {
        const next = { left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260) };
        setRect((prev) =>
          prev && prev.left === next.left && prev.top === next.top && prev.width === next.width
            ? prev
            : next,
        );
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActive(0);
    onQueryChange?.(query.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [active]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (index: number) => {
    if (index < filtered.length) {
      onSelect(filtered[index]);
    } else if (canCreate && onCreate) {
      onCreate(query.trim());
    } else {
      return;
    }
    close();
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        value={open ? query : selectedLabel}
        placeholder={creating ? t('Adding…') : placeholder}
        disabled={creating}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        // Delay so a click on an option registers before the list closes.
        onBlur={() => setTimeout(close, 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(optionCount - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const exact = onEnterExact ? onEnterExact(filtered, q) : -1;
            if (exact >= 0) choose(exact);
            else if (optionCount > 0) choose(active);
          } else if (e.key === 'Escape') {
            close();
            inputRef.current?.blur();
          }
        }}
        className={cn('h-9 pr-8 text-sm', invalid && 'border-destructive', className)}
      />
      {creating ? (
        <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      )}

      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            // Lets an open modal (components/ui/dialog.tsx) recognise clicks
            // here as its own, not as "outside" clicks.
            data-combobox-list=""
            // A modal Radix dialog disables pointer events and wheel/touch
            // scrolling outside itself; this list lives in a body portal, so
            // it opts back into pointer events and scrolls itself by hand.
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              pointerEvents: 'auto',
            }}
            onWheel={(e) => {
              if (listRef.current) listRef.current.scrollTop += e.deltaY;
            }}
            onTouchStart={(e) => {
              touchY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchMove={(e) => {
              const y = e.touches[0]?.clientY;
              if (listRef.current && touchY.current !== null && y !== undefined) {
                listRef.current.scrollTop += touchY.current - y;
                touchY.current = y;
              }
            }}
            className="z-50 max-h-72 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg"
          >
            {filtered.length === 0 && !canCreate && (
              <p className="p-3 text-center text-sm text-muted-foreground">{emptyText}</p>
            )}
            {filtered.map((o, i) => (
              <button
                key={getKey(o)}
                type="button"
                data-index={i}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cn(
                  'flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0',
                  i === active && 'bg-accent',
                )}
              >
                {renderOption ? (
                  renderOption(o)
                ) : (
                  <span className="truncate font-medium">{getLabel(o)}</span>
                )}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                data-index={filtered.length}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(filtered.length)}
                onClick={() => choose(filtered.length)}
                className={cn(
                  'flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm font-medium text-primary',
                  active === filtered.length && 'bg-accent',
                )}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {t('Add')} “{query.trim()}” {t('as a new')} {createNoun}
                </span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export interface ComboProduct {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  image?: string;
}

/**
 * Product picker for a POS row. `groups` is the catalog already folded by
 * product identity (one entry per product, holding every warehouse-specific
 * variant), so the list shows each product once.
 */
export function ProductCombobox<P extends ComboProduct>({
  groups,
  selected,
  onSelect,
  onCreate,
  creating,
  invalid,
  autoFocus,
}: {
  groups: P[][];
  selected: P | null;
  onSelect: (variants: P[]) => void;
  onCreate?: (name: string) => void;
  creating?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Combobox<P[]>
      options={groups}
      getKey={(vs) => vs[0].id}
      getLabel={(vs) => vs[0].name}
      matches={(vs, q) => vs[0].sku.toLowerCase().includes(q)}
      // A scanned barcode/SKU lands here as typed text + Enter.
      onEnterExact={(vs, q) => vs.findIndex((v) => v[0].sku.toLowerCase() === q)}
      renderOption={(vs) => {
        const p = vs[0];
        return (
          <>
            {p.image ? (
              <img src={p.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.sku}</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-primary">
              {formatCurrency(Number(p.salePrice))}
            </span>
          </>
        );
      }}
      selectedLabel={selected?.name ?? ''}
      onSelect={onSelect}
      onCreate={onCreate}
      createNoun={t('product')}
      creating={creating}
      placeholder={t('Search or type a product…')}
      emptyText={t('No products found')}
      invalid={invalid}
      autoFocus={autoFocus}
      className="min-w-[220px]"
    />
  );
}
