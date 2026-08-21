import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  Printer,
  QrCode,
  Search,
  Truck,
  Trash2,
  Pencil,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Pagination } from '@/components/ui/pagination';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { RecordSupplierPaymentDialog } from '@/components/record-supplier-payment-dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { openStockReceiptInvoicePopup } from '@/lib/invoicePopup';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useWarehouses } from '@/components/layout/warehouse-switcher';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

interface Supplier {
  id: string;
  name: string;
}

interface Transporter {
  id: string;
  name: string;
  phone?: string;
  vehicleNumber?: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
}

interface ReceiptItem {
  productId: string;
  name: string;
  receivedQuantity: number;
  damagedQuantity: number;
  pricingStatus?: 'PENDING' | 'PRICED';
  purchasePrice?: number;
  lineTotal?: number;
}

interface ReceiptLabourRow {
  labourId: string;
  name: string;
  phoneNumber: string;
  rent: number;
}

interface LabourOption {
  id: string;
  name: string;
  phoneNumber: string;
}

interface StockReceipt {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  storeId?: string;
  storeName?: string;
  warehouseId: string;
  warehouseName: string;
  date: string;
  truck: { vehicleNumber: string; driverName: string; driverPhone: string };
  items: ReceiptItem[];
  labour: ReceiptLabourRow[];
  labourRent: number;
  note: string;
  gatePassId?: string;
  gatePassQrUrl?: string;
  // Supplier-payable info derived from Pending Entities — see
  // pendingEntityService.pricedTotalsByStockReceipt on the backend.
  pricedTotal: number;
  paidAmount: number;
  balanceDue: number;
  // What the truck delivery cost, and who covered it — see
  // stockReceiptService.resolveTruckFarePayment on the backend.
  truckFare: number;
  truckFarePaidBy: 'SUPPLIER' | 'US';
  truckFareMethod?: string;
  truckFareBankAccountId?: string;
  transporterId?: string;
  transporterName?: string;
}

const PAGE_SIZE = 20;
const SEARCH_FETCH_LIMIT = 200;

/* ── New/edit truck delivery: supplier, truck details, and per-product received/damaged quantities ── */
function ReceiptDialog({ receipt, onClose }: { receipt?: StockReceipt; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!receipt;
  // The backend gates labour create by role (super admin only), not a
  // permission string — see labour.tsx for the same pattern.
  const role = useAuthStore((s) => s.user?.role);
  const canCreateLabour = role === 'SUPER_ADMIN';
  const { warehouses, currentId: defaultWarehouseId } = useWarehouses();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  // A delivery is always received for one physical store — required on
  // create; an existing receipt's store never changes on edit.
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const [supplierId, setSupplierId] = useState(receipt?.supplierId ?? '');
  const [warehouseId, setWarehouseId] = useState(receipt?.warehouseId ?? '');
  const [date, setDate] = useState(
    () => receipt?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [vehicleNumber, setVehicleNumber] = useState(receipt?.truck.vehicleNumber ?? '');
  const [driverName, setDriverName] = useState(receipt?.truck.driverName ?? '');
  const [driverPhone, setDriverPhone] = useState(receipt?.truck.driverPhone ?? '');
  const [truckFare, setTruckFare] = useState<number>(receipt?.truckFare ?? 0);
  const [truckFarePaidBy, setTruckFarePaidBy] = useState<'SUPPLIER' | 'US'>(
    receipt?.truckFarePaidBy ?? 'SUPPLIER',
  );
  const [truckFareMethod, setTruckFareMethod] = useState(receipt?.truckFareMethod ?? 'CASH');
  const [truckFareBankAccountId, setTruckFareBankAccountId] = useState(
    receipt?.truckFareBankAccountId ?? '',
  );
  const [transporterId, setTransporterId] = useState(receipt?.transporterId ?? '');
  // Only meaningful once a transporter is picked — otherwise 'US' still
  // means "pay now", exactly as before this feature existed. Defaults to
  // "pay now" unless editing a receipt that was left owed to a transporter.
  const [payTruckFareNow, setPayTruckFareNow] = useState(
    !receipt?.transporterId || !!receipt?.truckFareMethod,
  );
  const [note, setNote] = useState(receipt?.note ?? '');
  const [items, setItems] = useState<ReceiptItem[]>(
    () =>
      receipt?.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        receivedQuantity: it.receivedQuantity,
        damagedQuantity: it.damagedQuantity,
      })) ?? [],
  );
  const [labourRows, setLabourRows] = useState<ReceiptLabourRow[]>(receipt?.labour ?? []);
  const [labourSearch, setLabourSearch] = useState('');
  const [labourPickerOpen, setLabourPickerOpen] = useState(false);
  const labourSearchRef = useRef<HTMLInputElement>(null);
  const [creatingLabour, setCreatingLabour] = useState(false);
  const [newLabour, setNewLabour] = useState({ name: '', phoneNumber: '' });
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    purchasePrice: 0,
  });

  useEffect(() => {
    if (!editing && !warehouseId && defaultWarehouseId) setWarehouseId(defaultWarehouseId);
  }, [editing, warehouseId, defaultWarehouseId]);

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers-select'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });
  const { data: transporters = [] } = useQuery<Transporter[]>({
    queryKey: ['transporters'],
    queryFn: async () => (await api.get('/transporters')).data,
  });
  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ['stock-receipt-products', productSearch],
    queryFn: async () => (await api.get('/products', { params: { search: productSearch } })).data,
  });
  const { data: labourList = [] } = useQuery<LabourOption[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
  });
  const filteredLabour = labourList.filter(
    (l) =>
      !labourRows.some((r) => r.labourId === l.id) &&
      (l.name.toLowerCase().includes(labourSearch.toLowerCase()) ||
        l.phoneNumber.includes(labourSearch)),
  );
  const truckFarePaidNow = truckFarePaidBy === 'US' && (!transporterId || payTruckFareNow);
  const needsTruckFareBank =
    truckFarePaidNow && (truckFareMethod === 'BANK_TRANSFER' || truckFareMethod === 'ONLINE');
  const { data: bankAccounts = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bank-accounts'],
    queryFn: async () => (await api.get('/bank/accounts')).data,
    enabled: needsTruckFareBank,
  });

  const addItem = (p: ProductOption) => {
    setProductSearch('');
    setProductPickerOpen(false);
    productSearchRef.current?.blur();
    setItems((rows) => {
      if (rows.some((r) => r.productId === p.id)) return rows;
      return [...rows, { productId: p.id, name: p.name, receivedQuantity: 1, damagedQuantity: 0 }];
    });
  };
  const patchItem = (productId: string, patch: Partial<ReceiptItem>) =>
    setItems((rows) => rows.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));

  const addLabour = (l: LabourOption) => {
    setLabourSearch('');
    setLabourPickerOpen(false);
    labourSearchRef.current?.blur();
    setLabourRows((rows) => {
      if (rows.some((r) => r.labourId === l.id)) return rows;
      return [...rows, { labourId: l.id, name: l.name, phoneNumber: l.phoneNumber, rent: 0 }];
    });
  };
  const setLabourRent = (labourId: string, rent: number) =>
    setLabourRows((rows) => rows.map((r) => (r.labourId === labourId ? { ...r, rent } : r)));
  const removeLabour = (labourId: string) =>
    setLabourRows((rows) => rows.filter((r) => r.labourId !== labourId));
  const labourRentTotal = labourRows.reduce((s, r) => s + (r.rent || 0), 0);

  // Quick-add a product straight from the receipt when it isn't in the
  // catalog yet, instead of forcing a trip to the Products page and back.
  // Owned by the receiving warehouse — purchase price matters here since
  // that's the cost this receipt's stock-in gets valued at (see
  // stockReceiptService, which uses the product's own purchasePrice).
  const createProduct = useMutation({
    mutationFn: async () =>
      (
        await api.post('/products', {
          name: newProduct.name,
          sku: newProduct.sku,
          purchasePrice: newProduct.purchasePrice,
          warehouseId,
        })
      ).data,
    onSuccess: (p: ProductOption) => {
      toast.success(`Product added — ${p.name}`);
      qc.invalidateQueries({ queryKey: ['stock-receipt-products'] });
      // So it shows up on the Inventory page immediately too, not just here.
      qc.invalidateQueries({ queryKey: ['products'] });
      addItem(p);
      setCreatingProduct(false);
      setNewProduct({ name: '', sku: '', purchasePrice: 0 });
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Could not add product',
      ),
  });
  const removeItem = (productId: string) =>
    setItems((rows) => rows.filter((r) => r.productId !== productId));

  const createLabour = useMutation({
    mutationFn: async () =>
      (
        await api.post('/labour', {
          name: newLabour.name,
          phoneNumber: newLabour.phoneNumber,
        })
      ).data,
    onSuccess: (l: LabourOption) => {
      toast.success(`Labour added — ${l.name}`);
      qc.invalidateQueries({ queryKey: ['labour'] });
      addLabour(l);
      setCreatingLabour(false);
      setNewLabour({ name: '', phoneNumber: '' });
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Could not add labour',
      ),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing && !hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a receipt.');
      }
      const payload = {
        storeId: currentStoreId,
        supplierId,
        warehouseId,
        date,
        truck: {
          vehicleNumber,
          driverName: driverName || undefined,
          driverPhone: driverPhone || undefined,
        },
        items: items.map((r) => ({
          productId: r.productId,
          receivedQuantity: r.receivedQuantity || 0,
          damagedQuantity: r.damagedQuantity || 0,
        })),
        truckFare: truckFare || 0,
        truckFarePaidBy,
        truckFareMethod: truckFarePaidNow ? truckFareMethod : undefined,
        truckFareBankAccountId: needsTruckFareBank
          ? truckFareBankAccountId || undefined
          : undefined,
        transporterId: transporterId || undefined,
        labour: labourRows.map((r) => ({ labourId: r.labourId, rent: r.rent || 0 })),
        note: note || undefined,
      };
      return (
        editing
          ? await api.patch(`/stock-receipts/${receipt!.id}`, payload)
          : await api.post('/stock-receipts', payload)
      ).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Stock receipt updated' : 'Stock receipt recorded');
      qc.invalidateQueries({ queryKey: ['stock-receipts'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ??
          e?.response?.data?.message ??
          e?.message ??
          'Could not save',
      ),
  });

  const canSubmit =
    (editing || hasSpecificStore) &&
    supplierId &&
    warehouseId &&
    vehicleNumber.trim() &&
    items.length > 0 &&
    items.every((r) => r.receivedQuantity > 0 || r.damagedQuantity > 0) &&
    (!needsTruckFareBank || truckFareBankAccountId);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> {editing ? 'Edit Stock Receipt' : 'New Stock Receipt'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update this truck delivery — quantities are reconciled against current stock.'
              : "Record a truck delivery from a supplier — how much of each product arrived good versus damaged. Damaged quantities are logged for tracking only; they don't add to stock."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          {!editing && !hasSpecificStore && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Select a specific store from the header before recording a receipt — "All Stores"
              can't be recorded on a delivery.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Receiving Warehouse *</Label>
              <select
                required
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Truck / Vehicle Number *</Label>
              <Input
                required
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. LEA-1234"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Driver Name</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Driver Phone</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Transporter (optional)</Label>
              <select
                value={transporterId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTransporterId(id);
                  const tr = transporters.find((t) => t.id === id);
                  if (tr) {
                    setDriverName(tr.name);
                    setDriverPhone(tr.phone || '');
                    setVehicleNumber(tr.vehicleNumber || '');
                  } else {
                    setPayTruckFareNow(true);
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">One-off driver (no roster entry)</option>
                {transporters.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Truck Fare</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={truckFare || ''}
                onChange={(e) => setTruckFare(Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fare Covered By</Label>
              <select
                value={truckFarePaidBy}
                onChange={(e) => setTruckFarePaidBy(e.target.value as 'SUPPLIER' | 'US')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="SUPPLIER">Supplier (already paid)</option>
                <option value="US">Us (pay the driver)</option>
              </select>
            </div>
            {truckFarePaidBy === 'US' && truckFare > 0 && transporterId && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={payTruckFareNow}
                    onChange={(e) => setPayTruckFareNow(e.target.checked)}
                  />
                  Pay driver now
                </label>
                {!payTruckFareNow && (
                  <p className="text-xs text-muted-foreground">
                    The fare will be owed to this transporter — pay them later from their profile.
                  </p>
                )}
              </div>
            )}
            {truckFarePaidBy === 'US' && truckFare > 0 && truckFarePaidNow && (
              <>
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <select
                    value={truckFareMethod}
                    onChange={(e) => setTruckFareMethod(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="ONLINE">Online</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                {needsTruckFareBank && (
                  <div className="space-y-1.5">
                    <Label>Bank Account *</Label>
                    <select
                      required
                      value={truckFareBankAccountId}
                      onChange={(e) => setTruckFareBankAccountId(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">Select account…</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Labour</Label>
              {labourRentTotal > 0 && (
                <span className="text-xs font-medium text-muted-foreground">
                  {t('Total')} {formatCurrency(labourRentTotal)}
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={labourSearchRef}
                value={labourSearch}
                onChange={(e) => setLabourSearch(e.target.value)}
                onFocus={() => setLabourPickerOpen(true)}
                onBlur={() => setTimeout(() => setLabourPickerOpen(false), 150)}
                placeholder="Click to browse, or type to search labour…"
                className="pl-8"
              />
              {labourPickerOpen && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {filteredLabour.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No labour found{labourSearch ? ` for "${labourSearch}"` : ''}.
                    </p>
                  ) : (
                    filteredLabour.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addLabour(l)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{l.name}</span>
                        <span className="text-xs text-muted-foreground">{l.phoneNumber}</span>
                      </button>
                    ))
                  )}
                  {canCreateLabour && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setNewLabour((f) => ({ ...f, name: labourSearch.trim() }));
                        setCreatingLabour(true);
                        setLabourPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                    >
                      <Plus className="h-4 w-4" /> {t('Add new labour')}
                      {labourSearch.trim() ? ` "${labourSearch.trim()}"` : ''}
                    </button>
                  )}
                </div>
              )}
            </div>

            {creatingLabour && (
              // A plain div, not a <form> — this already sits inside the
              // receipt's own <form>, and HTML forms can't nest. A nested
              // <form>'s submit bubbles up as a plain DOM event and fires the
              // outer form's onSubmit too, saving (and closing) the whole
              // receipt. Enter-to-submit is wired manually below instead.
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newLabour.name && newLabour.phoneNumber) createLabour.mutate();
                    }
                  }}
                >
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Name *')}</Label>
                    <Input
                      required
                      autoFocus
                      minLength={2}
                      maxLength={100}
                      value={newLabour.name}
                      onChange={(e) => setNewLabour((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Phone Number *')}</Label>
                    <Input
                      required
                      value={newLabour.phoneNumber}
                      onChange={(e) => setNewLabour((f) => ({ ...f, phoneNumber: e.target.value }))}
                      placeholder="e.g. 0300-1234567"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setCreatingLabour(false)}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={createLabour.isPending || !newLabour.name || !newLabour.phoneNumber}
                    onClick={() => createLabour.mutate()}
                  >
                    {createLabour.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('Add')}
                  </Button>
                </div>
              </div>
            )}

            {labourRows.length > 0 && (
              <div className="space-y-2 rounded-md border p-2">
                {labourRows.map((r) => (
                  <div key={r.labourId} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      {r.phoneNumber && (
                        <p className="truncate text-xs text-muted-foreground">{r.phoneNumber}</p>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Rent"
                      className="h-9 w-28 text-right"
                      value={r.rent || ''}
                      onChange={(e) => setLabourRent(r.labourId, Number(e.target.value))}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLabour(r.labourId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Products</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={productSearchRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => setProductPickerOpen(true)}
                onBlur={() => setTimeout(() => setProductPickerOpen(false), 150)}
                placeholder="Click to browse, or type to search products…"
                className="pl-8"
              />
              {productPickerOpen && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {products.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No products found{productSearch ? ` for "${productSearch}"` : ''}.
                    </p>
                  ) : (
                    products.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addItem(p)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.sku}</span>
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={!warehouseId}
                    title={!warehouseId ? t('Select a receiving warehouse first') : undefined}
                    onClick={() => {
                      setNewProduct((f) => ({ ...f, name: productSearch.trim() }));
                      setCreatingProduct(true);
                      setProductPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> {t('Add new product')}
                    {productSearch.trim() ? ` "${productSearch.trim()}"` : ''}
                  </button>
                </div>
              )}
            </div>

            {creatingProduct && (
              // A plain div, not a <form> — see the same note on the labour
              // quick-create block above for why nesting forms here breaks
              // the receipt dialog.
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newProduct.name && newProduct.sku) createProduct.mutate();
                    }
                  }}
                >
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Name *')}</Label>
                    <Input
                      required
                      autoFocus
                      value={newProduct.name}
                      onChange={(e) => setNewProduct((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('SKU *')}</Label>
                    <Input
                      required
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct((f) => ({ ...f, sku: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('Purchase Price')}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newProduct.purchasePrice || ''}
                      onChange={(e) =>
                        setNewProduct((f) => ({
                          ...f,
                          purchasePrice: Math.max(0, Number(e.target.value)),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setCreatingProduct(false)}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={createProduct.isPending || !newProduct.name || !newProduct.sku}
                    onClick={() => createProduct.mutate()}
                  >
                    {createProduct.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('Add')}
                  </Button>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('Product')}</th>
                      <th className="px-3 py-2 font-medium">{t('Qty Received')}</th>
                      <th className="px-3 py-2 font-medium">{t('Qty Damaged')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.productId} className="border-b last:border-0">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-24"
                            value={r.receivedQuantity || ''}
                            onChange={(e) =>
                              patchItem(r.productId, { receivedQuantity: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-24"
                            value={r.damagedQuantity || ''}
                            onChange={(e) =>
                              patchItem(r.productId, { damagedQuantity: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeItem(r.productId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
              {editing ? t('Save Changes') : t('Save Receipt')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Read-only breakdown of one truck's delivery — every product it brought,
   how much arrived good versus damaged. ── */
function ReceiptDetailDialog({
  receipt,
  onClose,
  onViewGatePass,
  onPrintInvoice,
  onRecordPayment,
  canManage,
}: {
  receipt: StockReceipt;
  onClose: () => void;
  onViewGatePass: (receipt: StockReceipt) => void;
  onPrintInvoice: (receipt: StockReceipt) => void;
  onRecordPayment: (receipt: StockReceipt) => void;
  canManage: boolean;
}) {
  const { t } = useLanguage();
  const totalReceived = receipt.items.reduce((s, it) => s + it.receivedQuantity, 0);
  const totalDamaged = receipt.items.reduce((s, it) => s + it.damagedQuantity, 0);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> {receipt.number}
          </DialogTitle>
          <DialogDescription>
            {new Date(receipt.date).toLocaleDateString()} · {receipt.supplierName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t('Store')}: </span>
            {receipt.storeName ?? '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Warehouse')}: </span>
            {receipt.warehouseName}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Vehicle #')}: </span>
            {receipt.truck.vehicleNumber}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Driver')}: </span>
            {receipt.truck.driverName || '—'}
            {receipt.truck.driverPhone ? ` (${receipt.truck.driverPhone})` : ''}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Truck Fare')}: </span>
            {receipt.truckFare > 0 ? (
              <>
                {formatCurrency(receipt.truckFare)}{' '}
                <span className="text-xs text-muted-foreground">
                  ({receipt.truckFarePaidBy === 'US' ? t('paid by us') : t('covered by supplier')})
                </span>
              </>
            ) : (
              '—'
            )}
          </div>
        </div>

        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('Product')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Qty Received')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Qty Damaged')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Purchase Price')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Line Total')}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((it) => (
                <tr key={it.productId} className="border-b last:border-0">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.receivedQuantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.damagedQuantity > 0 ? (
                      <span className="text-destructive">{it.damagedQuantity}</span>
                    ) : (
                      it.damagedQuantity
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.pricingStatus === 'PRICED' ? (
                      formatCurrency(it.purchasePrice ?? 0)
                    ) : (
                      <span className="text-muted-foreground">{t('Awaiting price')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.pricingStatus === 'PRICED' ? formatCurrency(it.lineTotal ?? 0) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2">{t('Total')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totalReceived}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totalDamaged}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(receipt.pricedTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {receipt.labour.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('Labour')}</th>
                  <th className="px-3 py-2 font-medium">{t('Phone')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Rent')}</th>
                </tr>
              </thead>
              <tbody>
                {receipt.labour.map((l) => (
                  <tr key={l.labourId} className="border-b last:border-0">
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.phoneNumber || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.rent)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={2}>
                    {t('Total')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(receipt.labourRent)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="grid grid-cols-3 gap-x-4 rounded-md border p-3 text-sm">
          <div>
            <p className="text-muted-foreground">{t('Priced Total')}</p>
            <p className="font-medium">{formatCurrency(receipt.pricedTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('Paid')}</p>
            <p className="font-medium">{formatCurrency(receipt.paidAmount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('Balance Due')}</p>
            <p className="font-medium text-primary">{formatCurrency(receipt.balanceDue)}</p>
          </div>
        </div>

        {receipt.note && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t('Note')}: </span>
            {receipt.note}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onPrintInvoice(receipt)}>
            <Printer className="h-4 w-4" /> {t('Print Invoice')}
          </Button>
          {canManage && receipt.balanceDue > 0 && (
            <Button type="button" variant="outline" onClick={() => onRecordPayment(receipt)}>
              <Wallet className="h-4 w-4" /> {t('Record Payment')}
            </Button>
          )}
          {receipt.gatePassId && (
            <Button type="button" variant="outline" onClick={() => onViewGatePass(receipt)}>
              <QrCode className="h-4 w-4" /> {t('View Gate Pass')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StockReceiptsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManage = grantsPermission(authUser?.permissions, 'inventory:manage');

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<StockReceipt | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<StockReceipt | null>(null);
  const [viewingGatePass, setViewingGatePass] = useState<StockReceipt | null>(null);
  const [payingReceipt, setPayingReceipt] = useState<StockReceipt | null>(null);
  const storefront = useStorefrontFilter();

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [from, to, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-receipts', from, to, search, fetchPage, fetchLimit, storefront.store],
    queryFn: async () =>
      (
        await api.get('/stock-receipts', {
          params: {
            from,
            to,
            search: search || undefined,
            page: fetchPage,
            limit: fetchLimit,
            ...storefront,
          },
        })
      ).data as { receipts: StockReceipt[]; total: number },
  });
  const receipts = data?.receipts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/stock-receipts/${id}`)).data,
    onSuccess: () => {
      toast.success('Stock receipt deleted');
      qc.invalidateQueries({ queryKey: ['stock-receipts'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete this receipt'),
  });

  const removeReceipt = (r: StockReceipt) => {
    if (
      window.confirm(
        `Delete receipt ${r.number}? This reverses the stock it added and cannot be undone.`,
      )
    ) {
      del.mutate(r.id);
    }
  };

  const handlePrintInvoice = async (r: StockReceipt) => {
    // Open synchronously so the browser ties the popup to this click rather
    // than treating it as an unrequested popup.
    const win = window.open('', '_blank', 'width=850,height=1000');
    win?.document.write(
      '<p style="font-family:sans-serif;padding:24px;color:#666">Preparing invoice…</p>',
    );
    try {
      await openStockReceiptInvoicePopup(
        {
          receiptNumber: r.number,
          date: r.date,
          storeName: r.storeName,
          supplierName: r.supplierName,
          items: r.items.map((it) => ({
            name: it.name,
            quantity: it.receivedQuantity,
            purchasePrice: it.purchasePrice,
            lineTotal: it.lineTotal,
            pricingStatus: it.pricingStatus,
          })),
          pricedTotal: r.pricedTotal,
          paidAmount: r.paidAmount,
          balanceDue: r.balanceDue,
          truckFare: r.truckFare,
          truckFarePaidBy: r.truckFarePaidBy,
          truck: r.truck,
          labour: r.labour.map((l) => ({ name: l.name, phone: l.phoneNumber, rent: l.rent })),
          labourRentTotal: r.labourRent,
        },
        win,
      );
    } catch {
      toast.error('Enable popups to view the printable invoice');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {total} truck {total === 1 ? 'delivery' : 'deliveries'}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="w-64 space-y-1.5">
            <Label>{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by receipt #, supplier or truck…')}
                className="pl-8"
              />
            </div>
          </div>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> {t('New Receipt')}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Receipt #')}</th>
              <th className="px-4 py-3 font-medium">{t('Date')}</th>
              <th className="px-4 py-3 font-medium">{t('Supplier')}</th>
              <th className="px-4 py-3 font-medium">{t('Store')}</th>
              <th className="px-4 py-3 font-medium">{t('Warehouse')}</th>
              <th className="px-4 py-3 font-medium">{t('Truck')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Items')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Qty Received')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Qty Damaged')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              receipts.map((receipt) => {
                const totalReceived = receipt.items.reduce((s, it) => s + it.receivedQuantity, 0);
                const totalDamaged = receipt.items.reduce((s, it) => s + it.damagedQuantity, 0);
                return (
                  <tr
                    key={receipt.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setViewingReceipt(receipt)}
                  >
                    <td className="px-4 py-3 font-medium">{receipt.number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(receipt.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{receipt.supplierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{receipt.storeName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{receipt.warehouseName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {receipt.truck.vehicleNumber}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {receipt.items.length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {totalReceived}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totalDamaged > 0 ? (
                        <span className="font-medium text-destructive">{totalDamaged}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={t('Actions')}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setViewingReceipt(receipt)}>
                            <Eye className="h-4 w-4" /> {t('View Details')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handlePrintInvoice(receipt)}>
                            <Printer className="h-4 w-4" /> {t('Print Invoice')}
                          </DropdownMenuItem>
                          {receipt.gatePassId && (
                            <DropdownMenuItem onSelect={() => setViewingGatePass(receipt)}>
                              <QrCode className="h-4 w-4" /> {t('View Gate Pass')}
                            </DropdownMenuItem>
                          )}
                          {canManage && receipt.balanceDue > 0 && (
                            <DropdownMenuItem onSelect={() => setPayingReceipt(receipt)}>
                              <Wallet className="h-4 w-4" /> {t('Record Payment')}
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <>
                              <DropdownMenuItem onSelect={() => setEditingReceipt(receipt)}>
                                <Pencil className="h-4 w-4" /> {t('Edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={del.isPending}
                                onSelect={() => removeReceipt(receipt)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4" /> {t('Delete')}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            {!isLoading && receipts.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  No stock receipts recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!isSearching && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="border-t"
          />
        )}
      </Card>

      {creating && <ReceiptDialog onClose={() => setCreating(false)} />}
      {editingReceipt && (
        <ReceiptDialog receipt={editingReceipt} onClose={() => setEditingReceipt(null)} />
      )}
      {viewingReceipt && (
        <ReceiptDetailDialog
          receipt={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
          onViewGatePass={setViewingGatePass}
          onPrintInvoice={handlePrintInvoice}
          onRecordPayment={setPayingReceipt}
          canManage={canManage}
        />
      )}

      <GatePassDialog
        gatePassId={viewingGatePass?.gatePassId}
        gatePassQrUrl={viewingGatePass?.gatePassQrUrl}
        title={viewingGatePass?.number}
        open={viewingGatePass !== null}
        onOpenChange={(o) => !o && setViewingGatePass(null)}
      />

      <RecordSupplierPaymentDialog
        receipt={
          payingReceipt
            ? {
                id: payingReceipt.id,
                receiptNumber: payingReceipt.number,
                balanceDue: payingReceipt.balanceDue,
              }
            : null
        }
        open={payingReceipt !== null}
        onOpenChange={(o) => !o && setPayingReceipt(null)}
      />
    </div>
  );
}
