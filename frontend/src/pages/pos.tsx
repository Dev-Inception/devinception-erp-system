import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Trash2,
  ShoppingCart,
  Loader2,
  User,
  Check,
  HardHat,
  Truck,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  NotepadTextDashed,
  AlertTriangle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { useWarehouseStore } from '@/store/warehouse';
import { useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { openSaleInvoicePopup, type SaleForInvoice } from '@/lib/invoicePopup';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { useLanguage } from '@/components/language-provider';

interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  currentStock: number;
  taxRate: string;
  warehouseId?: string;
}
type CartSource = 'WAREHOUSE' | 'VENDOR';
interface CartLine {
  /** Stable row id (sku or name, lowercased) — shared by every warehouse
   * variant of the same product, so switching variants stays the same row. */
  key: string;
  /** All warehouse-specific stock records for this product (from search). */
  variants: Product[];
  /** Currently selected variant — id/name/sku/stock. Stays pointed at
   * wherever this product is actually stocked even if `desiredWarehouseId`
   * (below) picks a warehouse with no stock record for it yet. */
  product: Product;
  /** Warehouse chosen in the dropdown — every warehouse is selectable, not
   * just the ones this product already has stock in. */
  desiredWarehouseId: string | undefined;
  /** Selected vendor (Vendor dropdown), if buying this line specially
   * instead of pulling it from the warehouse above. Independent choice. */
  vendorId: string | null;
  vendorName: string;
  /** Editable unit sale price — defaults to the variant's catalog price. */
  price: number;
  qty: number;
}
interface WarehouseLite {
  id: string;
  name: string;
}
interface VendorLite {
  id: string;
  name: string;
}
interface TransporterLite {
  id: string;
  name: string;
  phone?: string;
  vehicleNumber?: string;
}
interface BankAccountLite {
  id: string;
  name: string;
}
const groupKey = (p: Product) => (p.sku || p.name).trim().toLowerCase();
const lineSource = (l: CartLine): CartSource => (l.vendorId ? 'VENDOR' : 'WAREHOUSE');

interface CustomerLite {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

interface LabourLite {
  id: string;
  name: string;
  phoneNumber: string;
}
/** A labourer picked for this sale, with what they're being paid for it. */
interface SelectedLabour extends LabourLite {
  rent: number;
}

interface CompletedSale extends SaleForInvoice {
  id: string;
  gatePassId?: string;
  gatePassQrUrl?: string;
  // One gate pass per warehouse the sale actually drew stock from.
  warehouseGatePasses?: { warehouseId: string; gatePassId: string; gatePassQrUrl?: string }[];
  vendorGatePassId?: string;
  vendorGatePassQrUrl?: string;
}

/** A parked, in-progress sale — autosaved on the backend (private to the
 * cashier who parked it) so it can be resumed later, even from a different
 * session, without losing progress. */
interface DraftSale {
  id: string;
  savedAt: string;
  step: Step;
  customer: CustomerLite;
  cart: CartLine[];
  selectedLabour: SelectedLabour[];
  driver: { name: string; phone: string; vehicleNumber: string };
  transportFare: number;
  discountValue: number;
  discountType: 'amount' | 'percent';
  taxPct: number;
  advanceAmount: number;
}

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Products' },
  { n: 3, label: 'Labour & Transport' },
  { n: 4, label: 'Payment' },
  { n: 5, label: 'Done' },
];

export function PosPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canTakeAdvance = grantsPermission(authUser?.permissions, 'finance:manage');
  const defaultWarehouseId = useWarehouseStore((s) => s.currentId);
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  // The checkout response's `store` isn't populated, so look the name/address
  // up client-side for the invoice popup shown immediately after checkout
  // (any later reprint from the Sales list gets it from the server instead).
  const { data: stores = [] } = useQuery<{ id: string; name: string; address?: string }[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
  });
  const currentStore = stores.find((s) => s.id === currentStoreId);
  // A real customer is always physically in one specific shop — "All Stores"
  // is a reporting view, not a place a sale can happen at.
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  const [step, setStep] = useState<Step>(1);

  // Converting an estimate (see estimates.tsx "Convert" action) — the query
  // param carries which one, so its customer/items can pre-fill this sale.
  // Sent back on checkout so the backend marks the estimate CONVERTED once
  // the sale actually posts (see saleService.createSale).
  const [searchParams] = useSearchParams();
  const estimateId = searchParams.get('estimateId') || undefined;
  const estimateHydrated = useRef(false);
  const [pendingEstimateItems, setPendingEstimateItems] = useState<
    { productId: string; quantity: number; unitPrice: number }[] | null
  >(null);

  // Step 1 — customer (required, no walk-in)
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', address: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  // Step 2 — products (list)
  const [search, setSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  // Pull the estimate's customer + items in once, on arrival — a registered
  // lead goes straight to step 2, an ad-hoc one leaves the name/phone/address
  // pre-filled on step 1 so the cashier can create the real customer record
  // a sale requires (an estimate allows a lead with no Customer at all).
  useEffect(() => {
    if (!estimateId || estimateHydrated.current) return;
    estimateHydrated.current = true;
    (async () => {
      try {
        const estimate = await api.get(`/estimates/${estimateId}`);
        const data = estimate.data;
        if (data.customerId) {
          setCustomer({
            id: data.customerId,
            name: data.customerName,
            phone: data.customerPhone,
            address: data.customerAddress,
          });
          setStep(2);
        } else {
          setCustomerForm({
            name: data.customerName || '',
            phone: data.customerPhone || '',
            address: data.customerAddress || '',
          });
        }
        setPendingEstimateItems(
          (data.items ?? []).map((it: any) => ({
            productId: it.productId,
            quantity: it.quantity,
            unitPrice: Number(it.unitPrice),
          })),
        );
        toast.success(`Loaded estimate ${data.number} — review and complete the sale`);
      } catch {
        toast.error('Could not load that estimate');
      }
    })();
  }, [estimateId]);

  // Step 3 — labour & transport
  const [labourSearch, setLabourSearch] = useState('');
  const [labourPickerOpen, setLabourPickerOpen] = useState(false);
  // The picker (search + dropdown) only appears once "Add Labour" is
  // clicked, so the section opens on a clear, prominent action rather than
  // an always-visible search box.
  const [addingLabour, setAddingLabour] = useState(false);
  const labourSearchRef = useRef<HTMLInputElement>(null);
  const [selectedLabour, setSelectedLabour] = useState<SelectedLabour[]>([]);
  const [driver, setDriver] = useState({
    name: '',
    phone: '',
    vehicleNumber: '',
  });
  const [transportFare, setTransportFare] = useState<number>(0);
  const [transporterId, setTransporterId] = useState<string | null>(null);
  const [payTransportNow, setPayTransportNow] = useState(false);
  const [transportFareMethod, setTransportFareMethod] = useState('CASH');
  const [transportFareBankAccountId, setTransportFareBankAccountId] = useState('');

  // Step 4 — payment
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [taxPct, setTaxPct] = useState<number>(0);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);

  // Step 5 — result
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);

  // Parked sales — autosaved on the backend as the cashier moves through
  // steps, so nothing is lost even if they never click Draft explicitly.
  const [draftId, setDraftId] = useState<string | null>(null);
  const { data: drafts = [] } = useQuery<DraftSale[]>({
    queryKey: ['sale-drafts', hasSpecificStore ? currentStoreId : undefined],
    queryFn: async () =>
      (
        await api.get('/sale-drafts', {
          params: { store: hasSpecificStore ? currentStoreId : undefined },
        })
      ).data,
    enabled: step === 1,
  });

  const createCustomer = useMutation({
    mutationFn: async () =>
      (
        await api.post('/customers', {
          ...customerForm,
          storeId: hasSpecificStore ? currentStoreId : undefined,
        })
      ).data,
    onSuccess: (c) => {
      toast.success('Customer added');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setCustomer({ id: c.id, name: c.name, phone: c.phone, address: c.address });
      setStep(2);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not add customer'),
  });

  const customerSearchTerm = customerSearch.trim();
  const { data: customerMatches = [] } = useQuery<CustomerLite[]>({
    queryKey: ['pos-customer-search', customerSearchTerm, hasSpecificStore ? currentStoreId : null],
    queryFn: async () =>
      (
        await api.get('/customers', {
          params: {
            search: customerSearchTerm,
            store: hasSpecificStore ? currentStoreId : undefined,
          },
        })
      ).data,
    enabled: step === 1 && !customer && customerSearchTerm.length > 0,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['pos-products', search],
    // One row per warehouse actually stocking the product, not one row
    // totalled across all of them — the per-line warehouse picker needs real
    // per-warehouse availability.
    queryFn: async () =>
      (await api.get('/products', { params: { search, perWarehouse: true } })).data,
    enabled: step === 2,
  });
  const { data: warehouses = [] } = useQuery<WarehouseLite[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
    enabled: step === 2,
  });
  const { data: vendors = [] } = useQuery<VendorLite[]>({
    queryKey: ['vendors'],
    queryFn: async () => (await api.get('/vendors')).data,
    enabled: step === 2,
  });
  const { data: transporters = [] } = useQuery<TransporterLite[]>({
    queryKey: ['transporters'],
    queryFn: async () => (await api.get('/transporters')).data,
    enabled: step === 3,
  });
  const needsTransportFareBank =
    payTransportNow &&
    (transportFareMethod === 'BANK_TRANSFER' || transportFareMethod === 'ONLINE');
  const { data: transportBankAccounts = [] } = useQuery<BankAccountLite[]>({
    queryKey: ['bank-accounts'],
    queryFn: async () => (await api.get('/bank/accounts')).data,
    enabled: step === 3 && needsTransportFareBank,
  });

  // Search results grouped by product identity (sku/name) — the same
  // product stocked at several warehouses shows as one suggestion with a
  // warehouse picker inside its row, instead of duplicate rows.
  const groupedMatches = (() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const k = groupKey(p);
      const arr = map.get(k);
      if (arr) arr.push(p);
      else map.set(k, [p]);
    }
    return Array.from(map.values());
  })();

  // Once the estimate's items are known (previous effect) and the product
  // catalog has loaded, turn each one into a real cart line at the same
  // warehouse-picking logic addRow below uses — but at the estimate's
  // quantity/price, not defaulted to 1 and the catalog price.
  useEffect(() => {
    if (!pendingEstimateItems || products.length === 0) return;
    const newLines: CartLine[] = [];
    const missing: string[] = [];
    for (const item of pendingEstimateItems) {
      const variants = groupedMatches.find((vs) => vs.some((v) => v.id === item.productId));
      if (!variants) {
        missing.push(item.productId);
        continue;
      }
      const key = groupKey(variants[0]);
      const preferred =
        variants.find((v) => v.warehouseId === defaultWarehouseId && v.currentStock > 0) ||
        variants.find((v) => v.currentStock > 0) ||
        variants[0];
      newLines.push({
        key,
        variants,
        product: preferred,
        desiredWarehouseId: preferred.warehouseId,
        vendorId: null,
        vendorName: '',
        price: item.unitPrice,
        qty: item.quantity,
      });
    }
    if (newLines.length > 0) setCart(newLines);
    if (missing.length > 0) {
      toast.error(`${missing.length} item(s) from the estimate could no longer be found`);
    }
    setPendingEstimateItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEstimateItems, products]);

  const addRow = (variants: Product[]) => {
    const key = groupKey(variants[0]);
    setCart((c) => {
      if (c.some((l) => l.key === key)) {
        return c.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      }
      const preferred =
        variants.find((v) => v.warehouseId === defaultWarehouseId && v.currentStock > 0) ||
        variants.find((v) => v.currentStock > 0) ||
        variants[0];
      return [
        ...c,
        {
          key,
          variants,
          product: preferred,
          desiredWarehouseId: preferred.warehouseId,
          vendorId: null,
          vendorName: '',
          price: Number(preferred.salePrice),
          qty: 1,
        },
      ];
    });
    setSearch('');
    setProductPickerOpen(false);
    productSearchRef.current?.blur();
  };

  // Only updates the quantity — never removes the row, so clearing the input
  // to retype a value (e.g. backspacing "100") doesn't drop the line. Rows
  // are only removed via the explicit trash button.
  const setLineQty = (key: string, qty: number) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty } : l)));
  const setLinePrice = (key: string, price: number) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, price: Math.max(0, price) } : l)));
  // Warehouse dropdown: which stock-backed variant of this product to use.
  const setLineWarehouse = (key: string, warehouseId: string) =>
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l;
        // Every warehouse is selectable, but only one with a real stock
        // record for this product can back it — otherwise `product` stays
        // put (wherever it's actually stocked) and the row flags the gap.
        const variant = l.variants.find((v) => v.warehouseId === warehouseId);
        return variant
          ? {
              ...l,
              product: variant,
              price: Number(variant.salePrice),
              desiredWarehouseId: warehouseId,
            }
          : { ...l, desiredWarehouseId: warehouseId };
      }),
    );
  // Vendor dropdown: independent choice — selecting a vendor means this line
  // is procured from them instead of pulled from the warehouse above.
  const setLineVendor = (key: string, vendorId: string) =>
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l;
        const vendor = vendors.find((v) => v.id === vendorId);
        return { ...l, vendorId: vendor ? vendor.id : null, vendorName: vendor ? vendor.name : '' };
      }),
    );
  // Source selector: switching to Warehouse clears any vendor; switching to
  // Vendor defaults to the first vendor so the row stays in a valid state
  // until the cashier picks a different one.
  const setLineSource = (key: string, source: CartSource) =>
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l;
        if (source === 'WAREHOUSE') return { ...l, vendorId: null, vendorName: '' };
        const first = vendors[0];
        return { ...l, vendorId: first ? first.id : null, vendorName: first ? first.name : '' };
      }),
    );
  const removeLine = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  const { data: labourList = [] } = useQuery<LabourLite[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
    enabled: step === 3,
  });
  const filteredLabour = labourList.filter((l) => {
    const q = labourSearch.trim().toLowerCase();
    if (!q) return true;
    return l.name.toLowerCase().includes(q) || l.phoneNumber.includes(q);
  });
  const toggleLabour = (l: LabourLite) =>
    setSelectedLabour((sel) =>
      sel.some((s) => s.id === l.id)
        ? sel.filter((s) => s.id !== l.id)
        : [...sel, { ...l, rent: 0 }],
    );
  const setLabourRent = (id: string, rent: number) =>
    setSelectedLabour((sel) =>
      sel.map((s) => (s.id === id ? { ...s, rent: Math.max(0, rent) } : s)),
    );

  const [labourCreating, setLabourCreating] = useState(false);
  const [labourForm, setLabourForm] = useState({ name: '', phoneNumber: '' });
  const createLabour = useMutation({
    mutationFn: async () => (await api.post('/labour', labourForm)).data,
    onSuccess: (l: LabourLite) => {
      toast.success('Labour added');
      qc.invalidateQueries({ queryKey: ['labour'] });
      setSelectedLabour((sel) => [...sel, { ...l, rent: 0 }]);
      setLabourCreating(false);
      setLabourForm({ name: '', phoneNumber: '' });
      setLabourSearch('');
      setAddingLabour(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not add labour'),
  });

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const discountAmount = Math.min(
    subtotal,
    discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue,
  );
  const taxTotal = ((subtotal - discountAmount) * taxPct) / 100;
  const transportFareAmount = Math.max(0, transportFare);
  const labourRentTotal = selectedLabour.reduce((s, l) => s + (l.rent || 0), 0);
  const grandTotal = Math.max(
    0,
    subtotal - discountAmount + taxTotal + transportFareAmount + labourRentTotal,
  );
  const advance = canTakeAdvance ? Math.min(Math.max(0, advanceAmount), grandTotal) : 0;

  const resetAll = () => {
    setStep(1);
    setCustomer(null);
    setCustomerForm({ name: '', phone: '', address: '' });
    setSearch('');
    setCart([]);
    setLabourSearch('');
    setSelectedLabour([]);
    setDriver({ name: '', phone: '', vehicleNumber: '' });
    setTransportFare(0);
    setTransporterId(null);
    setPayTransportNow(false);
    setTransportFareMethod('CASH');
    setTransportFareBankAccountId('');
    setDiscountValue(0);
    setDiscountType('amount');
    setTaxPct(0);
    setAdvanceAmount(0);
    setCompletedSale(null);
    setDraftId(null);
  };

  // Autosave the in-progress sale as a draft — silent, no toast, so it
  // doesn't interrupt the cashier. Backend PATCHes the same draft once one
  // exists; otherwise a new one is created and its id remembered.
  const autosaveDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        storeId: hasSpecificStore ? currentStoreId : undefined,
        step,
        customer,
        cart,
        selectedLabour,
        driver,
        transportFare,
        discountValue,
        discountType,
        taxPct,
        advanceAmount,
      };
      return draftId
        ? (await api.patch(`/sale-drafts/${draftId}`, payload)).data
        : (await api.post('/sale-drafts', payload)).data;
    },
    onSuccess: (draft: DraftSale) => {
      setDraftId(draft.id);
      qc.invalidateQueries({ queryKey: ['sale-drafts'] });
    },
  });

  useEffect(() => {
    // Step 5 (Done) is terminal — the sale is already real, don't re-create
    // a draft for it.
    if (customer && step < 5) autosaveDraft.mutate();
    // Autosave on every step change, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const parkSale = () => {
    if (!customer) return;
    autosaveDraft.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Parked sale for ${customer.name}`);
        resetAll();
      },
    });
  };

  const resumeDraft = (draft: DraftSale) => {
    setDraftId(draft.id);
    // The parked customer reference can go stale (e.g. deleted since this
    // sale was parked) — checkout requires a *live* customer, so don't trust
    // a broken reference silently. Surfacing it here, at resume time, avoids
    // a confusing "customer is required" failure at the very last step after
    // the cashier has already gone through the whole sale again.
    const hasLiveCustomer = Boolean(draft.customer?.id);
    if (hasLiveCustomer) {
      setCustomer(draft.customer);
    } else {
      setCustomer(null);
      setCustomerForm({
        name: draft.customer?.name ?? '',
        phone: draft.customer?.phone ?? '',
        address: '',
      });
      toast.error(
        "This parked sale's customer could not be found — please select the customer again.",
      );
    }
    setCart(draft.cart);
    setSelectedLabour(draft.selectedLabour);
    setDriver(draft.driver);
    setTransportFare(draft.transportFare);
    setDiscountValue(draft.discountValue);
    setDiscountType(draft.discountType);
    setTaxPct(draft.taxPct);
    setAdvanceAmount(draft.advanceAmount);
    setStep(hasLiveCustomer ? draft.step : 1);
  };

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/sale-drafts/${id}`),
    onSuccess: (_data, id) => {
      if (draftId === id) setDraftId(null);
      qc.invalidateQueries({ queryKey: ['sale-drafts'] });
    },
  });

  const saleWarehouseId = cart.find((l) => !l.vendorId)?.desiredWarehouseId ?? defaultWarehouseId;

  const completeSale = useMutation({
    mutationFn: async (): Promise<CompletedSale> => {
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before completing a sale.');
      }
      // Every sale is booked on account first (see the advance-payment note
      // below), so it always needs a live customer to owe the balance to.
      if (!customer?.id) {
        throw new Error('Select or re-add the customer before completing this sale.');
      }
      const sale: CompletedSale = (
        await api.post('/sales', {
          paymentMethod: 'CREDIT',
          storeId: currentStoreId,
          warehouseId: saleWarehouseId,
          customerId: customer!.id,
          estimateId,
          labour: selectedLabour.map((l) => ({ labour: l.id, rent: l.rent || 0 })),
          discountTotal: discountAmount,
          transportFare: transportFareAmount,
          transport: {
            driverName: driver.name,
            driverPhone: driver.phone,
            vehicleNumber: driver.vehicleNumber,
          },
          transporterId: transporterId || undefined,
          transportFareMethod: transporterId && payTransportNow ? transportFareMethod : undefined,
          transportFareBankAccountId:
            transporterId && payTransportNow ? transportFareBankAccountId || undefined : undefined,
          items: cart.map((l) => {
            const gross = l.price * l.qty;
            const lineDiscount = subtotal > 0 ? (discountAmount * gross) / subtotal : 0;
            return {
              productId: l.product.id,
              quantity: l.qty,
              unitPrice: l.price,
              discount: lineDiscount,
              taxRate: taxPct,
              source: lineSource(l),
              vendor: l.vendorId || undefined,
              // Each line keeps its own warehouse — a sale can mix items
              // from several warehouses, each getting its own gate pass.
              warehouseId: l.vendorId ? undefined : l.desiredWarehouseId,
            };
          }),
        })
      ).data;

      // Record the optional advance payment against this specific sale (not
      // just a generic customer receipt) so it actually shows up as this
      // sale's Advance Payment / Remaining Amount in the sales list.
      if (advance > 0) {
        await api.post(`/sales/${sale.id}/payments`, {
          amount: advance,
          method: 'CASH',
          note: `Advance for sale ${sale.saleNumber}`,
        });
      }

      return {
        ...sale,
        customer: { name: customer!.name, phone: customer!.phone },
        storeName: currentStore?.name,
        storeAddress: currentStore?.address,
        labour: selectedLabour.map((l) => ({ name: l.name })),
        labourRentTotal,
        paidAmount: advance,
        balanceDue: Math.max(0, grandTotal - advance),
        // The advance was recorded against AR after the sale itself posted,
        // so subtract it from the snapshot the create-sale response carried —
        // the customer's remaining balance is lower by exactly that amount.
        totalRemaining:
          sale.totalRemaining != null ? Math.max(0, Number(sale.totalRemaining) - advance) : null,
      };
    },
    onSuccess: (sale) => {
      toast.success(`Sale ${sale.saleNumber} completed`);
      qc.invalidateQueries({ queryKey: ['pos-products'] });
      // The draft became a real sale — it's no longer a work in progress.
      if (draftId) {
        api.delete(`/sale-drafts/${draftId}`).catch(() => {});
        qc.invalidateQueries({ queryKey: ['sale-drafts'] });
      }
      setDraftId(null);
      setCompletedSale(sale);
      setStep(5);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Checkout failed'),
  });

  // Gate pass detail/QR is only fetched once the cashier asks to see it —
  // GatePassDialog does its own querying, scoped to whichever pass is open.
  const [openGatePass, setOpenGatePass] = useState<{
    id: string;
    qrUrl?: string;
    title: string;
  } | null>(null);

  const canStep3 = Boolean(
    driver.name.trim() && driver.vehicleNumber.trim() && driver.phone.trim(),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold leading-tight">{t('Point of Sale')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(STEPS.find((s) => s.n === step)?.label ?? '')} — step {step} of {STEPS.length}
          </p>
        </div>
        {/* <Button variant="outline" onClick={resetAll}>
          New Sale
        </Button> */}
        <Button onClick={resetAll}>
          <ShoppingCart className="h-4 w-4" /> {t('New Sale (POS)')}
        </Button>
      </div>

      <Card className="flex flex-col p-6">
        {/* Stepper */}
        <div className="mb-6 flex items-start">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="flex items-start"
              style={i < STEPS.length - 1 ? { flex: '1 1 0%' } : { flex: '0 0 auto' }}
            >
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    step === s.n
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : step > s.n
                        ? 'border-success bg-success text-success-foreground'
                        : 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap text-[11px] font-medium',
                    step === s.n ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(s.label)}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mt-4 h-0.5 flex-1 rounded-full transition-colors',
                    step > s.n ? 'bg-success' : 'bg-border',
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="py-2">
          {step === 1 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {/* Center: selected customer or the add-new-customer form */}
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-full max-w-md space-y-5">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-6 w-6" />
                    </div>
                    <h2 className="text-base font-semibold">{t('Who is this sale for?')}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("Enter the customer's details to start.")}
                    </p>
                  </div>

                  {customer ? (
                    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{customer.name}</p>
                        {customer.phone && (
                          <p className="text-sm text-muted-foreground">{customer.phone}</p>
                        )}
                        {customer.address && (
                          <p className="truncate text-xs text-muted-foreground">
                            {customer.address}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-medium text-primary underline underline-offset-2"
                        onClick={() => setCustomer(null)}
                      >
                        {t('Change')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          onFocus={() => setCustomerPickerOpen(true)}
                          // delay so a click on a result registers before closing
                          onBlur={() => setTimeout(() => setCustomerPickerOpen(false), 150)}
                          placeholder={t('Search by name, phone, or address…')}
                          className="pl-9"
                        />
                        {customerPickerOpen && customerSearchTerm && (
                          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                            {customerMatches.length === 0 && (
                              <p className="p-3 text-center text-sm text-muted-foreground">
                                {t('No matching customers')}
                              </p>
                            )}
                            {customerMatches.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                                onClick={() => {
                                  setCustomer(c);
                                  setCustomerSearch('');
                                  setCustomerPickerOpen(false);
                                }}
                              >
                                <span className="font-medium">{c.name}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {[c.phone, c.address].filter(Boolean).join(' · ')}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-background px-2 text-muted-foreground">
                            {t('or add new')}
                          </span>
                        </div>
                      </div>
                      <form
                        className="space-y-4 rounded-xl border bg-muted/20 p-5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          createCustomer.mutate();
                        }}
                      >
                        <div className="space-y-1.5">
                          <Label>{t('Name *')}</Label>
                          <Input
                            required
                            autoFocus
                            value={customerForm.name}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t('Phone *')}</Label>
                          <Input
                            required
                            value={customerForm.phone}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, phone: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t('Address')}</Label>
                          <Input
                            value={customerForm.address}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, address: e.target.value })
                            }
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={createCustomer.isPending}
                        >
                          {createCustomer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          {t('Add & continue')}
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: parked (drafted) sales */}
              <Card className="flex flex-col overflow-hidden">
                <div className="border-b p-4">
                  <h2 className="font-semibold">{t('Parked Sales')}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t('Resume a customer you set aside earlier')}
                  </span>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
                  {drafts.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t('No parked sales')}
                    </p>
                  )}
                  {drafts.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {d.customer.name}
                          {d.customer.phone ? ` · ${d.customer.phone}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {d.cart.length} item(s) · {new Date(d.savedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => resumeDraft(d)}>
                        {t('Resume')}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteDraftMutation.mutate(d.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {step === 2 && (
            <div className="mx-auto max-w-full space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  ref={productSearchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setProductPickerOpen(true)}
                  // delay so a click on a result registers before closing
                  onBlur={() => setTimeout(() => setProductPickerOpen(false), 150)}
                  placeholder={t('Scan barcode, click to browse, or search product…')}
                  className="h-11 pl-9"
                />
                {productPickerOpen && (
                  <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                    {groupedMatches.length === 0 && (
                      <p className="p-3 text-center text-sm text-muted-foreground">
                        {t('No products found')}
                      </p>
                    )}
                    {groupedMatches.map((variants) => {
                      const p = variants[0];
                      return (
                        <button
                          key={groupKey(p)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addRow(variants)}
                          className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.sku}
                              {variants.length > 1
                                ? ` · ${variants.length} ${t('warehouses')}`
                                : ''}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold text-primary">
                            {formatCurrency(Number(p.salePrice))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('Product')}</th>
                      <th className="px-3 py-2 font-medium">{t('Source')}</th>
                      <th className="px-3 py-2 font-medium">{t('Warehouse / Vendor')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Price')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Total')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                          {t('Search and select a product to add it here')}
                        </td>
                      </tr>
                    )}
                    {cart.map((l) => {
                      const desiredVariant = l.variants.find(
                        (v) => v.warehouseId === l.desiredWarehouseId,
                      );
                      const notStockedHere = !desiredVariant;
                      return (
                        <tr key={l.key} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium">{l.product.name}</p>
                            <p className="text-xs text-muted-foreground">{l.product.sku}</p>
                            {notStockedHere && !l.vendorId && (
                              <p className="mt-0.5 text-xs text-destructive">
                                {t('Not stocked here — pick a vendor')}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="h-9 w-full min-w-[130px] rounded-md border bg-transparent px-2 text-sm"
                              value={lineSource(l)}
                              onChange={(e) => setLineSource(l.key, e.target.value as CartSource)}
                            >
                              <option value="WAREHOUSE">{t('Warehouse')}</option>
                              <option value="VENDOR">{t('Vendor')}</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {lineSource(l) === 'WAREHOUSE' ? (
                              <select
                                className="h-9 w-full min-w-[180px] rounded-md border bg-transparent px-2 text-sm"
                                value={l.desiredWarehouseId ?? ''}
                                onChange={(e) => setLineWarehouse(l.key, e.target.value)}
                              >
                                {warehouses.map((w) => {
                                  const variant = l.variants.find((v) => v.warehouseId === w.id);
                                  return (
                                    <option key={w.id} value={w.id}>
                                      {w.name} —{' '}
                                      {variant
                                        ? `${variant.currentStock} ${t('in stock')}`
                                        : t('not stocked here')}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <select
                                className="h-9 w-full min-w-[180px] rounded-md border bg-transparent px-2 text-sm"
                                value={l.vendorId ?? ''}
                                onChange={(e) => setLineVendor(l.key, e.target.value)}
                              >
                                {vendors.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              className="h-9 w-full min-w-[90px] text-right"
                              value={l.price || ''}
                              onChange={(e) => setLinePrice(l.key, Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              className={cn(
                                'h-9 w-full min-w-[70px] text-right',
                                (!l.qty || l.qty <= 0) && 'border-destructive',
                              )}
                              value={l.qty || ''}
                              onChange={(e) => setLineQty(l.key, Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatCurrency(l.price * l.qty)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeLine(l.key)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {cart.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                          {t('Subtotal')}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatCurrency(subtotal)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <HardHat className="h-4 w-4" /> {t('Labour')}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('Optionally select who is loading the goods.')}
                  </p>

                  {/* Top action — opens the picker below. Kept as the single
                      entry point instead of an always-visible search box, so
                      it's obvious what to click first. */}
                  {!addingLabour && (
                    <Button
                      type="button"
                      size="lg"
                      className="w-full text-base"
                      onClick={() => {
                        setAddingLabour(true);
                        setLabourPickerOpen(true);
                        setTimeout(() => labourSearchRef.current?.focus(), 0);
                      }}
                    >
                      <Plus className="h-5 w-5" /> {t('Add Labour')}
                    </Button>
                  )}

                  {addingLabour && !labourCreating && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={labourSearchRef}
                        value={labourSearch}
                        onChange={(e) => setLabourSearch(e.target.value)}
                        onFocus={() => setLabourPickerOpen(true)}
                        // delay so a click on a result registers before closing
                        onBlur={() => setTimeout(() => setLabourPickerOpen(false), 150)}
                        placeholder={t('Search labour by name or phone…')}
                        className="h-11 pl-10 pr-10 text-base"
                      />
                      <button
                        type="button"
                        aria-label={t('Cancel')}
                        onClick={() => {
                          setLabourSearch('');
                          setLabourPickerOpen(false);
                          setAddingLabour(false);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {labourPickerOpen && (
                        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                          {filteredLabour.length === 0 && (
                            <p className="p-3 text-center text-sm text-muted-foreground">
                              {t('No labour found')}
                            </p>
                          )}
                          {filteredLabour.map((l) => {
                            const isSelected = selectedLabour.some((s) => s.id === l.id);
                            return (
                              <button
                                key={l.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  toggleLabour(l);
                                  setLabourSearch('');
                                  setLabourPickerOpen(false);
                                  setAddingLabour(false);
                                }}
                                className="flex w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-accent"
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <HardHat className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{l.name}</span>
                                </span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {l.phoneNumber}
                                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                                </span>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setLabourForm({ name: labourSearch.trim(), phoneNumber: '' });
                              setLabourCreating(true);
                              setLabourPickerOpen(false);
                            }}
                            className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-accent"
                          >
                            <Plus className="h-4 w-4" /> {t('Add new labourer')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {labourCreating && (
                    <form
                      className="space-y-2 rounded-lg border bg-muted/20 p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        createLabour.mutate();
                      }}
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">{t('Name *')}</Label>
                        <Input
                          required
                          autoFocus
                          value={labourForm.name}
                          onChange={(e) => setLabourForm({ ...labourForm, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('Phone *')}</Label>
                        <Input
                          required
                          value={labourForm.phoneNumber}
                          onChange={(e) =>
                            setLabourForm({ ...labourForm, phoneNumber: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setLabourCreating(false);
                            setLabourPickerOpen(true);
                          }}
                        >
                          {t('Cancel')}
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          className="flex-1"
                          disabled={createLabour.isPending}
                        >
                          {createLabour.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          {t('Add')}
                        </Button>
                      </div>
                    </form>
                  )}

                  {selectedLabour.length > 0 ? (
                    <div className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('Assigned')} ({selectedLabour.length})
                        </p>
                        {labourRentTotal > 0 && (
                          <p className="text-sm font-semibold text-muted-foreground">
                            {t('Total')} {formatCurrency(labourRentTotal)}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        {selectedLabour.map((l) => (
                          <div
                            key={l.id}
                            className="flex items-center gap-3 rounded-md border bg-card px-3 py-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <HardHat className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-medium">{l.name}</p>
                              {l.phoneNumber && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {l.phoneNumber}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                              <Input
                                id={`labour-fare-${l.id}`}
                                type="number"
                                min={0}
                                placeholder="Fare"
                                className="h-10 w-28 text-right text-base font-medium"
                                value={l.rent || ''}
                                onChange={(e) => setLabourRent(l.id, Number(e.target.value))}
                              />
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={`${t('Remove')} ${l.name}`}
                              onClick={() => toggleLabour(l)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    !addingLabour && (
                      <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                        {t('No labour selected yet — click "Add Labour" above.')}
                      </p>
                    )
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <Truck className="h-4 w-4" /> {t('Transport')}
                  </div>
                  <div className="space-y-1">
                    <Label>{t('Transporter (optional)')}</Label>
                    <select
                      value={transporterId ?? ''}
                      onChange={(e) => {
                        const id = e.target.value || null;
                        setTransporterId(id);
                        const t = transporters.find((tr) => tr.id === id);
                        if (t) {
                          setDriver({
                            name: t.name,
                            phone: t.phone || '',
                            vehicleNumber: t.vehicleNumber || '',
                          });
                        } else {
                          setPayTransportNow(false);
                        }
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">{t('One-off driver (no roster entry)')}</option>
                      {transporters.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>{t('Driver name *')}</Label>
                      <Input
                        value={driver.name}
                        onChange={(e) => setDriver({ ...driver, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('Vehicle number *')}</Label>
                      <Input
                        value={driver.vehicleNumber}
                        onChange={(e) => setDriver({ ...driver, vehicleNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('Driver phone *')}</Label>
                      <Input
                        value={driver.phone}
                        onChange={(e) => setDriver({ ...driver, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('Transport fare')}</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={transportFare || ''}
                        onChange={(e) => setTransportFare(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  {transporterId && transportFare > 0 && (
                    <div className="space-y-3 rounded-md border p-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={payTransportNow}
                          onChange={(e) => setPayTransportNow(e.target.checked)}
                        />
                        {t('Pay driver now')}
                      </label>
                      {!payTransportNow && (
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'The fare will be owed to this transporter — pay them later from their profile.',
                          )}
                        </p>
                      )}
                      {payTransportNow && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label>{t('Method')}</Label>
                            <select
                              value={transportFareMethod}
                              onChange={(e) => setTransportFareMethod(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            >
                              <option value="CASH">{t('Cash')}</option>
                              <option value="BANK_TRANSFER">{t('Bank transfer')}</option>
                              <option value="ONLINE">{t('Online')}</option>
                              <option value="CARD">{t('Card')}</option>
                            </select>
                          </div>
                          {needsTransportFareBank && (
                            <div className="space-y-1">
                              <Label>{t('Bank account')} *</Label>
                              <select
                                required
                                value={transportFareBankAccountId}
                                onChange={(e) => setTransportFareBankAccountId(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                              >
                                <option value="">{t('Select account…')}</option>
                                {transportBankAccounts.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">{t('Items to load')}</p>
                {cart.map((l) => (
                  <div key={l.product.id} className="flex justify-between text-muted-foreground">
                    <span>{l.product.name}</span>
                    <span className="tabular-nums">
                      {t('Qty')} {l.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mx-auto max-w-md space-y-3">
              {!hasSpecificStore && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t(
                    'Select a specific store from the header before completing this sale — "All Stores" can\'t be recorded on an invoice.',
                  )}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">
                    {t('Discount')}
                  </span>
                  <div className="flex overflow-hidden rounded-md border">
                    <button
                      type="button"
                      onClick={() => setDiscountType('amount')}
                      className={cn(
                        'px-2.5 text-xs font-medium',
                        discountType === 'amount'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      Rs
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percent')}
                      className={cn(
                        'px-2.5 text-xs font-medium',
                        discountType === 'percent'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      %
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="h-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">{t('Tax %')}</span>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={taxPct || ''}
                    onChange={(e) => setTaxPct(Number(e.target.value))}
                    className="h-8"
                  />
                </div>
              </div>

              <div className="space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('Subtotal')}</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {t('Discount')}
                      {discountType === 'percent' ? ` (${discountValue}%)` : ''}
                    </span>
                    <span>−{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {t('Tax')}
                    {taxPct > 0 ? ` (${taxPct}%)` : ''}
                  </span>
                  <span>{formatCurrency(taxTotal)}</span>
                </div>
                {transportFareAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Transport Fare')}</span>
                    <span>{formatCurrency(transportFareAmount)}</span>
                  </div>
                )}
                {labourRentTotal > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Labour Fare')}</span>
                    <span>{formatCurrency(labourRentTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold">
                  <span>{t('Total')}</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {canTakeAdvance ? (
                <div className="space-y-1 border-t pt-3">
                  <Label>{t('Advance payment (cash, optional)')}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={advanceAmount || ''}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {advance <= 0
                      ? t("No advance — the full amount goes on the customer's account.")
                      : advance >= grandTotal
                        ? t('Paid in full now.')
                        : `${formatCurrency(grandTotal - advance)} ${t("remains on the customer's account.")}`}
                  </p>
                </div>
              ) : (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("This sale will be invoiced on the customer's account.")}
                </p>
              )}
            </div>
          )}

          {step === 5 && completedSale && (
            <div className="mx-auto max-w-md space-y-4">
              <div className="flex flex-col items-center gap-1 rounded-lg bg-success/10 p-4 text-center text-success">
                <CheckCircle2 className="h-7 w-7" />
                <span className="font-medium">
                  {t('Sale')} {completedSale.saleNumber} {t('completed')}
                </span>
              </div>

              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('Customer')}</span>
                  <span className="font-medium">{completedSale.customer?.name ?? '—'}</span>
                </div>

                <div className="mt-1 space-y-1 border-t pt-2">
                  {completedSale.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between gap-3 text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        {it.name} × {it.quantity}
                      </span>
                      <span className="shrink-0 font-medium text-foreground">
                        {formatCurrency(Number(it.amount))}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-1 space-y-1 border-t pt-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Subtotal')}</span>
                    <span>{formatCurrency(Number(completedSale.subtotal))}</span>
                  </div>
                  {Number(completedSale.discountTotal) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('Discount')}</span>
                      <span>−{formatCurrency(Number(completedSale.discountTotal))}</span>
                    </div>
                  )}
                  {Number(completedSale.taxTotal) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('Tax')}</span>
                      <span>{formatCurrency(Number(completedSale.taxTotal))}</span>
                    </div>
                  )}
                  {Number(completedSale.transportFare ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('Transport Fare')}</span>
                      <span>{formatCurrency(Number(completedSale.transportFare))}</span>
                    </div>
                  )}
                  {Number(completedSale.labourRentTotal ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('Labour Fare')}</span>
                      <span>{formatCurrency(Number(completedSale.labourRentTotal))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold">
                    <span>{t('Total')}</span>
                    <span>{formatCurrency(Number(completedSale.grandTotal))}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Paid')}</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(Number(completedSale.paidAmount ?? 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t('Remaining')}</span>
                    <span
                      className={cn(
                        'font-medium',
                        Number(completedSale.balanceDue ?? 0) > 0
                          ? 'text-destructive'
                          : 'text-success',
                      )}
                    >
                      {formatCurrency(Number(completedSale.balanceDue ?? 0))}
                    </span>
                  </div>
                </div>

                {(completedSale.labour?.length || completedSale.transport?.driverName) && (
                  <div className="mt-1 space-y-1 border-t pt-2">
                    {completedSale.labour && completedSale.labour.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="shrink-0 text-muted-foreground">{t('Labour')}</span>
                        <span className="text-right font-medium">
                          {completedSale.labour.map((l) => l.name).join(', ')}
                        </span>
                      </div>
                    )}
                    {completedSale.transport?.driverName && (
                      <div className="flex justify-between gap-4">
                        <span className="shrink-0 text-muted-foreground">{t('Transport')}</span>
                        <span className="text-right font-medium">
                          {completedSale.transport.driverName}
                          {completedSale.transport.vehicleNumber
                            ? ` (${completedSale.transport.vehicleNumber})`
                            : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                variant="outline"
                onClick={() =>
                  openSaleInvoicePopup(completedSale).catch(() =>
                    toast.error('Enable popups to view the printable invoice'),
                  )
                }
              >
                {t('View / Print Invoice')}
              </Button>

              {(completedSale.warehouseGatePasses?.length || completedSale.vendorGatePassId) && (
                <div className="flex flex-col gap-2">
                  {completedSale.warehouseGatePasses?.map((g) => {
                    const wh = warehouses.find((w) => w.id === g.warehouseId);
                    const multiple = (completedSale.warehouseGatePasses?.length ?? 0) > 1;
                    const label = multiple
                      ? `${t('Gate Pass')} — ${wh?.name ?? t('Warehouse')}`
                      : t('Gate Pass');
                    return (
                      <Button
                        key={g.gatePassId}
                        className="w-full"
                        variant="outline"
                        onClick={() =>
                          setOpenGatePass({
                            id: g.gatePassId,
                            qrUrl: g.gatePassQrUrl,
                            title: label,
                          })
                        }
                      >
                        <span className="min-w-0 truncate">
                          {t('View / Print')} {label}
                        </span>
                      </Button>
                    );
                  })}
                  {completedSale.vendorGatePassId && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() =>
                        setOpenGatePass({
                          id: completedSale.vendorGatePassId!,
                          qrUrl: completedSale.vendorGatePassQrUrl,
                          title: t('Vendor Gate Pass'),
                        })
                      }
                    >
                      {t('View / Print Gate Pass (Vendor)')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <Button
              disabled={step === 1 || step === 5 || completeSale.isPending}
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              <ArrowLeft className="h-4 w-4" /> {t('Back')}
            </Button>
            {step > 1 && step < 5 && (
              <Button
                variant="destructive"
                disabled={!customer || autosaveDraft.isPending}
                onClick={parkSale}
              >
                <NotepadTextDashed className="h-4 w-4" /> {t('Save as Draft')}
              </Button>
            )}
          </div>
          {step === 1 && (
            <Button
              disabled={
                customer
                  ? false
                  : !customerForm.name.trim() ||
                    !customerForm.phone.trim() ||
                    createCustomer.isPending
              }
              onClick={() => (customer ? setStep(2) : createCustomer.mutate())}
            >
              {createCustomer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button
              disabled={cart.length === 0 || cart.some((l) => !l.qty || l.qty <= 0)}
              onClick={() => setStep(3)}
            >
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button disabled={!canStep3} onClick={() => setStep(4)}>
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 4 && (
            <Button
              disabled={completeSale.isPending || !hasSpecificStore}
              onClick={() => {
                if (window.confirm(t('Are you sure you want to complete this sale?'))) {
                  completeSale.mutate();
                }
              }}
            >
              {completeSale.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Complete Sale')}
            </Button>
          )}
          {step === 5 && (
            <Button
              onClick={() => {
                resetAll();
              }}
            >
              {t('New Sale')}
            </Button>
          )}
        </div>
      </Card>

      <GatePassDialog
        gatePassId={openGatePass?.id}
        gatePassQrUrl={openGatePass?.qrUrl}
        title={openGatePass?.title}
        open={!!openGatePass}
        onOpenChange={(o) => !o && setOpenGatePass(null)}
      />
    </div>
  );
}
