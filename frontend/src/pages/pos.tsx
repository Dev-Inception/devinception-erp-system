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
import { useConfirm, useConfirmDelete } from '@/components/confirm-provider';
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
import { Combobox, ProductCombobox } from '@/components/product-combobox';
import { useBankAccounts } from '@/lib/bankAccounts';
import { AddProductDialog, type CreatedProduct } from '@/components/add-product-dialog';
import { useLanguage } from '@/components/language-provider';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  salePrice: string;
  currentStock: number;
  taxRate: string;
  warehouseId?: string;
  /** A vendor product — bought from the row's vendor, no stock. */
  isVendorProduct?: boolean;
  image?: string;
}
type CartSource = 'WAREHOUSE' | 'VENDOR';
interface CartLine {
  /** Stable, unique row id — rows are added empty ("Add Row") and the same
   * product may appear on more than one row. */
  key: string;
  /** All warehouse-specific stock records for this product (from search). */
  variants: Product[];
  /** Currently selected variant — id/name/sku/stock. Stays pointed at
   * wherever this product is actually stocked even if `desiredWarehouseId`
   * (below) picks a warehouse with no stock record for it yet. Null until a
   * product is picked on the row. */
  product: Product | null;
  /** Warehouse chosen in the dropdown — every warehouse is selectable, not
   * just the ones this product already has stock in. */
  desiredWarehouseId: string | undefined;
  /** Where this line comes from. New rows default to VENDOR. */
  source: CartSource;
  /** Selected vendor (Vendor dropdown) when source is VENDOR — null until
   * one is picked. */
  vendorId: string | null;
  vendorName: string;
  /** Free-text note for this line (sent as the sale item's remarks). */
  remarks: string;
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
const groupKey = (p: Product) => (p.sku || p.name).trim().toLowerCase();
const lineSource = (l: CartLine): CartSource => l.source;
type FilledLine = CartLine & { product: Product };
const isFilled = (l: CartLine): l is FilledLine => l.product !== null;
// Resets a row's product (variants/product/price) when its source or vendor
// changes and the old pick no longer belongs to that inventory.
const clearedProduct = { variants: [] as Product[], product: null, price: 0 };
const newRowKey = () => `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
interface LabourServiceLite {
  id: string;
  name: string;
}
/** One billable labour service charged on this sale, and its amount. */
interface SelectedLabourService {
  serviceId: string;
  serviceName: string;
  amount: number;
}
/** Draft shape for the sale's labour. The POS no longer picks a labourer
 * (the crew often changes after the sale), so new drafts hold a single entry
 * with id '' — just the optional contact number and the services. Older
 * drafts may still carry named labourers; they're flattened on resume. */
interface SelectedLabour extends LabourLite {
  services: SelectedLabourService[];
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

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Products' },
  { n: 3, label: 'Labour' },
  { n: 4, label: 'Transport' },
  { n: 5, label: 'Payment' },
  { n: 6, label: 'Done' },
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

  // Step 2 — products (rows added with "Add Row", product picked per row)
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

  // Step 3 — labour & transport. Labour is just the services charged and
  // their amounts, plus an optional contact number — who actually does the
  // job is settled later, in Pending Entities.
  const [addingLabour, setAddingLabour] = useState(false);
  const [labourPhone, setLabourPhone] = useState('');
  const [labourServices, setLabourServices] = useState<SelectedLabourService[]>([]);
  // Transport is only the fare now — no transporter/driver is picked at
  // the POS. Kept (always empty) for the draft payload's shape.
  const [driver, setDriver] = useState({
    name: '',
    phone: '',
    vehicleNumber: '',
  });
  const [transportFare, setTransportFare] = useState<number>(0);

  // Step 4 — payment
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [taxPct, setTaxPct] = useState<number>(0);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [advanceMethod, setAdvanceMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [advanceBankAccountId, setAdvanceBankAccountId] = useState('');
  const [advanceTransactionId, setAdvanceTransactionId] = useState('');

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

  // The whole catalog, searched locally by each row's product picker. One
  // row per warehouse actually stocking the product, not one row totalled
  // across all of them — the per-line warehouse picker needs real
  // per-warehouse availability.
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['pos-products'],
    queryFn: async () => (await api.get('/products', { params: { perWarehouse: true } })).data,
    enabled: step === 2,
  });
  const { data: warehouses = [] } = useQuery<WarehouseLite[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
    enabled: step === 2,
  });
  const { data: vendors = [] } = useQuery<VendorLite[]>({
    queryKey: ['vendors', hasSpecificStore ? currentStoreId : null],
    queryFn: async () =>
      (
        await api.get('/vendors', {
          params: { store: hasSpecificStore ? currentStoreId : undefined },
        })
      ).data,
    enabled: step === 2,
  });
  // Vendor Products — what a Vendor-sourced row searches (the vendor itself
  // is picked on the row). Warehouse rows search the stocked catalog above.
  const { data: vendorProducts = [] } = useQuery<Product[]>({
    queryKey: ['pos-vendor-products', hasSpecificStore ? currentStoreId : null],
    queryFn: async () =>
      (
        await api.get('/products', {
          params: { kind: 'vendor', store: hasSpecificStore ? currentStoreId : undefined },
        })
      ).data,
    enabled: step === 2,
  });
  const vendorProductGroups = vendorProducts.map((p) => [p]);
  const needsAdvanceBank = advanceMethod === 'BANK_TRANSFER';
  const { data: advanceBankAccountsRaw = [] } = useBankAccounts(
    hasSpecificStore ? currentStoreId : undefined,
    step === 5 && needsAdvanceBank,
  );
  const advanceBankAccounts = advanceBankAccountsRaw.filter((b) => b.isActive);

  // Catalog grouped by product identity (sku/name) — the same product
  // stocked at several warehouses shows as one option with a warehouse
  // picker inside its row, instead of duplicate options.
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

  // Prefer the default warehouse's stock, then any stocked warehouse.
  const preferredVariant = (variants: Product[]) =>
    variants.find((v) => v.warehouseId === defaultWarehouseId && v.currentStock > 0) ||
    variants.find((v) => v.currentStock > 0) ||
    variants[0];

  // Once the estimate's items are known (previous effect) and the product
  // catalog has loaded, turn each one into a real cart line at the same
  // warehouse-picking logic setLineProduct below uses — but at the estimate's
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
      const preferred = preferredVariant(variants);
      newLines.push({
        key: `${key}-${newLines.length}`,
        variants,
        product: preferred,
        desiredWarehouseId: preferred.warehouseId,
        source: 'WAREHOUSE',
        vendorId: null,
        vendorName: '',
        remarks: '',
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

  // "Add Row": a blank line, sourced from a vendor by default (auto-picked
  // when the store only has one).
  const addRow = () =>
    setCart((c) => [
      ...c,
      {
        key: newRowKey(),
        variants: [],
        product: null,
        desiredWarehouseId: defaultWarehouseId ?? undefined,
        source: 'VENDOR',
        vendorId: vendors.length === 1 ? vendors[0].id : null,
        vendorName: vendors.length === 1 ? vendors[0].name : '',
        remarks: '',
        price: 0,
        qty: 1,
      },
    ]);
  // Step 2 always opens with a row ready to fill.
  useEffect(() => {
    if (step === 2 && cart.length === 0 && !pendingEstimateItems) addRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cart.length, pendingEstimateItems]);
  // The vendor list can arrive after the first row was added — fill a
  // single-vendor store's vendor into rows still waiting for one.
  useEffect(() => {
    if (vendors.length !== 1) return;
    setCart((c) =>
      c.some((l) => l.source === 'VENDOR' && !l.vendorId)
        ? c.map((l) =>
            l.source === 'VENDOR' && !l.vendorId
              ? { ...l, vendorId: vendors[0].id, vendorName: vendors[0].name }
              : l,
          )
        : c,
    );
  }, [vendors]);

  // Product picked in a row's dropdown: point the row at the best-stocked
  // variant and its catalog price. Source/vendor/remarks are kept.
  const setLineProduct = (key: string, variants: Product[]) =>
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l;
        const preferred = preferredVariant(variants);
        return {
          ...l,
          variants,
          product: preferred,
          desiredWarehouseId: preferred.warehouseId ?? l.desiredWarehouseId,
          price: Number(preferred.salePrice) || 0,
        };
      }),
    );

  // A name typed in a row's dropdown that isn't in its list opens the Add
  // Product form (prefilled with that name) for the row's inventory —
  // Warehouse Inventory or Vendor Products — and the new product is put on
  // the row once saved. Same permission the backend checks.
  const canCreateProduct = grantsPermission(authUser?.permissions, 'inventory:manage');
  const [addingProduct, setAddingProduct] = useState<{ key: string; name: string } | null>(null);
  const addingLine = addingProduct ? cart.find((l) => l.key === addingProduct.key) : undefined;
  const putCreatedProductOnRow = (key: string, p: CreatedProduct) =>
    setLineProduct(key, [
      {
        id: p.id,
        name: p.name,
        sku: p.sku,
        salePrice: String(p.salePrice ?? 0),
        currentStock: 0,
        taxRate: String(p.taxRate ?? 0),
        warehouseId: p.warehouseId,
        isVendorProduct: p.isVendorProduct,
        image: p.image,
      },
    ]);

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
  const setLineRemarks = (key: string, remarks: string) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, remarks } : l)));
  // Vendor dropdown: which vendor a VENDOR-sourced line is procured from.
  const setLineVendor = (key: string, vendor: VendorLite) =>
    setCart((c) =>
      c.map((l) => (l.key === key ? { ...l, vendorId: vendor.id, vendorName: vendor.name } : l)),
    );

  // A vendor name typed in a row's dropdown that isn't on the list is
  // created on the spot (name only — details can be filled in under
  // Vendors later) and picked for that row. Same permission the backend
  // checks on POST /vendors.
  const canCreateVendor = grantsPermission(authUser?.permissions, 'vendors:create');
  const [creatingVendorKey, setCreatingVendorKey] = useState<string | null>(null);
  const createVendor = useMutation({
    mutationFn: async ({ name }: { key: string; name: string }) =>
      (
        await api.post('/vendors', {
          name,
          store: hasSpecificStore ? currentStoreId : undefined,
        })
      ).data as VendorLite,
    onMutate: ({ key }) => setCreatingVendorKey(key),
    onSuccess: (v, { key }) => {
      toast.success(`${t('Vendor added')} — ${v.name}`);
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setLineVendor(key, v);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? t('Could not add the vendor')),
    onSettled: () => setCreatingVendorKey(null),
  });
  // Source selector — the row's first column, since it decides which
  // inventory the product search shows (warehouse stock, or the vendor's
  // Vendor Products). Switching it clears the product, which came from the
  // other inventory. Switching to Warehouse clears any vendor; switching to
  // Vendor leaves it for the cashier to pick (auto-picked when the store has
  // only one).
  const setLineSource = (key: string, source: CartSource) =>
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key || l.source === source) return l;
        if (source === 'WAREHOUSE') {
          return { ...l, ...clearedProduct, source, vendorId: null, vendorName: '' };
        }
        const only = vendors.length === 1 ? vendors[0] : null;
        return {
          ...l,
          ...clearedProduct,
          source,
          vendorId: only?.id ?? null,
          vendorName: only?.name ?? '',
        };
      }),
    );
  const removeLine = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  // Billable service types (Ceiling, Panel, UV Sheet, ...) a selected
  // labourer can be assigned to and paid for individually on this sale.
  const { data: labourServicesList = [] } = useQuery<LabourServiceLite[]>({
    queryKey: ['labour-services', hasSpecificStore ? currentStoreId : null],
    queryFn: async () =>
      (
        await api.get('/labour-services', {
          params: { store: hasSpecificStore ? currentStoreId : undefined },
        })
      ).data,
    enabled: step === 3,
  });
  const addLabourService = (service: LabourServiceLite) =>
    setLabourServices((svs) =>
      svs.some((sv) => sv.serviceId === service.id)
        ? svs
        : [...svs, { serviceId: service.id, serviceName: service.name, amount: 0 }],
    );
  const removeLabourService = (serviceId: string) =>
    setLabourServices((svs) => svs.filter((sv) => sv.serviceId !== serviceId));
  const setLabourServiceAmount = (serviceId: string, amount: number) =>
    setLabourServices((svs) =>
      svs.map((sv) => (sv.serviceId === serviceId ? { ...sv, amount: Math.max(0, amount) } : sv)),
    );
  const clearLabour = () => {
    setLabourServices([]);
    setLabourPhone('');
    setAddingLabour(false);
    setCreatingService(false);
    setNewServiceName('');
  };

  // A missing service can be created right here instead of leaving the
  // sale for the Labour Services page. Same permission the backend checks
  // on POST /labour-services (services are a catalog entity).
  const canCreateService = grantsPermission(authUser?.permissions, 'inventory:manage');
  const [creatingService, setCreatingService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const createLabourService = useMutation({
    mutationFn: async (name: string): Promise<LabourServiceLite> =>
      (
        await api.post('/labour-services', {
          name,
          store: hasSpecificStore ? currentStoreId : undefined,
        })
      ).data,
    onSuccess: (svc) => {
      toast.success(`${t('Service added')} — ${svc.name}`);
      qc.invalidateQueries({ queryKey: ['labour-services'] });
      addLabourService(svc);
      setCreatingService(false);
      setNewServiceName('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('Could not add the service')),
  });
  const submitNewService = () => {
    const name = newServiceName.trim();
    if (!name) return;
    // Typed a name that already exists — just use that one.
    const existing = labourServicesList.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      addLabourService(existing);
      setCreatingService(false);
      setNewServiceName('');
      return;
    }
    createLabourService.mutate(name);
  };

  const filledCart = cart.filter(isFilled);
  const subtotal = filledCart.reduce((s, l) => s + l.price * l.qty, 0);
  // Why "Next" on Products is blocked, if it is.
  const productsBlocker =
    filledCart.length === 0
      ? t('Add at least one product')
      : cart.some((l) => !l.product)
        ? t('Pick a product on every row, or remove the empty row')
        : cart.some((l) => l.source === 'VENDOR' && !l.vendorId)
          ? t('Select a vendor on every vendor row')
          : cart.some((l) => !l.qty || l.qty <= 0)
            ? t('Enter a quantity on every row')
            : null;
  const discountAmount = Math.min(
    subtotal,
    discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue,
  );
  const taxTotal = ((subtotal - discountAmount) * taxPct) / 100;
  const transportFareAmount = Math.max(0, transportFare);
  const labourRentTotal = labourServices.reduce((s, sv) => s + (sv.amount || 0), 0);
  const grandTotal = Math.max(
    0,
    subtotal - discountAmount + taxTotal + transportFareAmount + labourRentTotal,
  );
  const advance = canTakeAdvance ? Math.min(Math.max(0, advanceAmount), grandTotal) : 0;

  const resetAll = () => {
    setStep(1);
    setCustomer(null);
    setCustomerForm({ name: '', phone: '', address: '' });
    setCart([]);
    clearLabour();
    setDriver({ name: '', phone: '', vehicleNumber: '' });
    setTransportFare(0);
    setDiscountValue(0);
    setDiscountType('amount');
    setTaxPct(0);
    setAdvanceAmount(0);
    setAdvanceMethod('CASH');
    setAdvanceBankAccountId('');
    setAdvanceTransactionId('');
    setCompletedSale(null);
    setDraftId(null);
  };

  // Autosave the in-progress sale as a draft — silent, no toast, so it
  // doesn't interrupt the cashier. Backend PATCHes the same draft once one
  // exists; otherwise a new one is created and its id remembered.
  const autosaveDraft = useMutation({
    // Saving a draft cart doesn't move any money — skip the app-wide
    // day-figures refresh (see App.tsx).
    meta: { skipDayRefresh: true },
    mutationFn: async () => {
      const payload = {
        storeId: hasSpecificStore ? currentStoreId : undefined,
        step,
        customer,
        cart: filledCart,
        selectedLabour:
          labourServices.length > 0 || labourPhone.trim()
            ? [{ id: '', name: '', phoneNumber: labourPhone.trim(), services: labourServices }]
            : [],
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
    // Step 6 (Done) is terminal — the sale is already real, don't re-create
    // a draft for it.
    if (customer && step < 6) autosaveDraft.mutate();
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
    // Flatten into one services list (older drafts may hold several named
    // labourers); the first contact number found becomes the labour number.
    const draftServices: SelectedLabourService[] = [];
    for (const l of draft.selectedLabour ?? []) {
      for (const sv of l.services) {
        if (!draftServices.some((d) => d.serviceId === sv.serviceId)) draftServices.push(sv);
      }
    }
    setLabourServices(draftServices);
    setLabourPhone(draft.selectedLabour?.find((l) => l.phoneNumber)?.phoneNumber ?? '');
    setAddingLabour(draftServices.length > 0);
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
  const confirmDelete = useConfirmDelete();
  const confirm = useConfirm();
  const removeDraft = async (id: string) => {
    if (await confirmDelete('this saved draft')) deleteDraftMutation.mutate(id);
  };

  const saleWarehouseId =
    cart.find((l) => l.source === 'WAREHOUSE')?.desiredWarehouseId ?? defaultWarehouseId;

  // Stock shortfalls found by the Products → Next check, keyed by cart line.
  // Cleared whenever the cart changes, so a fixed row stops showing its
  // error straight away (the next Next re-checks everything anyway).
  const [stockIssues, setStockIssues] = useState<
    Record<string, { available: number; warehouseName: string } | 'NO_WAREHOUSE'>
  >({});
  useEffect(() => {
    setStockIssues({});
  }, [cart]);

  // Before leaving Products, confirm every warehouse-sourced line can
  // actually be filled from its warehouse right now — the same check
  // checkout does, just early, so the cashier doesn't find out on the
  // Payment step. Vendor-sourced lines don't draw on stock and are skipped.
  // Each line is checked against exactly what checkout will send for it.
  const checkStockAndContinue = useMutation({
    mutationFn: async () => {
      const warehouseLines = filledCart.filter((l) => l.source === 'WAREHOUSE');
      const issues: Record<string, { available: number; warehouseName: string } | 'NO_WAREHOUSE'> =
        {};
      const toCheck = warehouseLines.flatMap((l) => {
        const warehouseId = l.desiredWarehouseId ?? saleWarehouseId;
        if (!warehouseId) {
          issues[l.key] = 'NO_WAREHOUSE';
          return [];
        }
        return [{ line: l, productId: l.product.id, warehouseId, quantity: l.qty }];
      });
      if (toCheck.length > 0) {
        const result = (
          await api.post('/sales/stock-check', {
            store: hasSpecificStore ? currentStoreId : undefined,
            items: toCheck.map(({ productId, warehouseId, quantity }) => ({
              productId,
              warehouseId,
              quantity,
            })),
          })
        ).data as {
          lines: {
            productId: string;
            warehouseId: string;
            warehouseName: string;
            available: number;
            ok: boolean;
          }[];
        };
        for (const { line, productId, warehouseId } of toCheck) {
          const row = result.lines.find(
            (r) => r.productId === productId && r.warehouseId === warehouseId,
          );
          if (row && !row.ok) {
            issues[line.key] = { available: row.available, warehouseName: row.warehouseName };
          }
        }
      }
      return issues;
    },
    onSuccess: (issues) => {
      const count = Object.keys(issues).length;
      if (count === 0) {
        setStep(3);
        return;
      }
      setStockIssues(issues);
      toast.error(
        count === 1
          ? t('Not enough stock for 1 item — reduce the quantity or switch it to a vendor')
          : `${t('Not enough stock for')} ${count} ${t('items — reduce the quantity or switch them to a vendor')}`,
      );
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? t('Could not check stock')),
  });

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
          // One line per service, with no labourer named — they're assigned
          // later in Pending Entities. The optional number rides on each line.
          labour: labourServices.map((sv) => ({
            service: sv.serviceId,
            rent: sv.amount || 0,
            phoneNumber: labourPhone.trim() || undefined,
          })),
          discountTotal: discountAmount,
          transportFare: transportFareAmount,
          transport: {
            driverName: driver.name,
            driverPhone: driver.phone,
            vehicleNumber: driver.vehicleNumber,
          },
          items: filledCart.map((l) => {
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
              warehouseId: l.source === 'VENDOR' ? undefined : l.desiredWarehouseId,
              remarks: l.remarks.trim() || undefined,
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
          method: advanceMethod,
          bankAccount: needsAdvanceBank ? advanceBankAccountId || undefined : undefined,
          transactionId: needsAdvanceBank ? advanceTransactionId || undefined : undefined,
          note: `Advance for sale ${sale.saleNumber}`,
        });
      }

      return {
        ...sale,
        customer: { name: customer!.name, phone: customer!.phone },
        storeName: currentStore?.name,
        storeAddress: currentStore?.address,
        labour: labourServices.map((sv) => ({
          name: '',
          phone: labourPhone.trim() || undefined,
          serviceName: sv.serviceName,
          rent: sv.amount || 0,
        })),
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
      setStep(6);
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
                        onClick={() => removeDraft(d.id)}
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
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-2 text-center font-medium">#</th>
                      <th className="px-3 py-2 font-medium">{t('Source')}</th>
                      <th className="px-3 py-2 font-medium">{t('Product')}</th>
                      <th className="px-3 py-2 font-medium">{t('Warehouse / Vendor')}</th>
                      <th className="px-3 py-2 font-medium">{t('Remarks')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Amount')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('Total')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                          {t('Click "Add Row" to add a product')}
                        </td>
                      </tr>
                    )}
                    {cart.map((l, index) => {
                      const desiredVariant = l.variants.find(
                        (v) => v.warehouseId === l.desiredWarehouseId,
                      );
                      const notStockedHere = !!l.product && !desiredVariant;
                      const stockIssue = stockIssues[l.key];
                      const isWarehouse = lineSource(l) === 'WAREHOUSE';
                      return (
                        <tr key={l.key} className="border-b align-top last:border-0">
                          <td className="px-3 py-3 text-center text-xs text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="h-9 w-full min-w-[120px] rounded-md border bg-transparent px-2 text-sm"
                              value={lineSource(l)}
                              onChange={(e) => setLineSource(l.key, e.target.value as CartSource)}
                            >
                              <option value="VENDOR">{t('Vendor')}</option>
                              <option value="WAREHOUSE">{t('Warehouse')}</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <ProductCombobox
                              groups={isWarehouse ? groupedMatches : vendorProductGroups}
                              selected={l.product}
                              autoFocus={!l.product && index === cart.length - 1 && index > 0}
                              onSelect={(variants) => setLineProduct(l.key, variants)}
                              onCreate={
                                canCreateProduct
                                  ? (name) => setAddingProduct({ key: l.key, name })
                                  : undefined
                              }
                            />
                            {l.product?.sku && (
                              <p className="mt-1 text-xs text-muted-foreground">{l.product.sku}</p>
                            )}
                            {isWarehouse &&
                              (stockIssue === 'NO_WAREHOUSE' ? (
                                <p className="mt-0.5 text-xs text-destructive">
                                  {t('Pick a warehouse or a vendor')}
                                </p>
                              ) : stockIssue ? (
                                <p className="mt-0.5 text-xs text-destructive">
                                  {stockIssue.available > 0
                                    ? `${t('Only')} ${stockIssue.available} ${t('in stock at')} ${stockIssue.warehouseName} — ${t('reduce the quantity or pick a vendor')}`
                                    : `${t('Out of stock at')} ${stockIssue.warehouseName} — ${t('pick another warehouse or a vendor')}`}
                                </p>
                              ) : (
                                notStockedHere && (
                                  <p className="mt-0.5 text-xs text-destructive">
                                    {t('Not stocked here — pick a vendor')}
                                  </p>
                                )
                              ))}
                          </td>
                          <td className="px-3 py-2">
                            {isWarehouse ? (
                              <select
                                className="h-9 w-full min-w-[180px] rounded-md border bg-transparent px-2 text-sm"
                                value={l.desiredWarehouseId ?? ''}
                                onChange={(e) => setLineWarehouse(l.key, e.target.value)}
                              >
                                {warehouses.map((w) => {
                                  const variant = l.variants.find((v) => v.warehouseId === w.id);
                                  return (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                      {l.product &&
                                        ` — ${
                                          variant
                                            ? `${variant.currentStock} ${t('in stock')}`
                                            : t('not stocked here')
                                        }`}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <Combobox<VendorLite>
                                options={vendors}
                                getKey={(v) => v.id}
                                getLabel={(v) => v.name}
                                selectedLabel={l.vendorName}
                                onSelect={(v) => setLineVendor(l.key, v)}
                                onCreate={
                                  canCreateVendor
                                    ? (name) => createVendor.mutate({ key: l.key, name })
                                    : undefined
                                }
                                createNoun={t('vendor')}
                                creating={creatingVendorKey === l.key}
                                placeholder={t('Search or type a vendor…')}
                                emptyText={t('No vendors found')}
                                className="min-w-[180px]"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              maxLength={255}
                              placeholder={t('Remarks')}
                              className="h-9 w-full min-w-[160px] text-sm"
                              value={l.remarks}
                              onChange={(e) => setLineRemarks(l.key, e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              className={cn(
                                'h-9 w-full min-w-[70px] text-right',
                                (!l.qty || l.qty <= 0 || !!stockIssue) && 'border-destructive',
                              )}
                              value={l.qty || ''}
                              onChange={(e) => setLineQty(l.key, Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              placeholder="0"
                              className="h-9 w-full min-w-[90px] text-right"
                              value={l.price || ''}
                              onChange={(e) => setLinePrice(l.key, Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">
                            {formatCurrency(l.price * l.qty)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              aria-label={t('Remove row')}
                              onClick={() => removeLine(l.key)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filledCart.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={7} className="px-3 py-2 text-right font-semibold">
                          {t('Subtotal')}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {formatCurrency(subtotal)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {addingProduct && addingLine && (
                <AddProductDialog
                  kind={addingLine.source === 'VENDOR' ? 'vendor' : 'warehouse'}
                  initialName={addingProduct.name}
                  storeId={hasSpecificStore ? currentStoreId : undefined}
                  warehouses={warehouses}
                  defaultWarehouseId={
                    addingLine.desiredWarehouseId ?? defaultWarehouseId ?? undefined
                  }
                  onCreated={(p) => putCreatedProductOnRow(addingProduct.key, p)}
                  onClose={() => setAddingProduct(null)}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" onClick={addRow}>
                  <Plus className="h-4 w-4" /> {t('Add Row')}
                </Button>
                {productsBlocker && cart.length > 0 && (
                  <p className="text-xs text-muted-foreground">{productsBlocker}</p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-semibold">
                  <HardHat className="h-4 w-4" /> {t('Labour')}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('Optionally add the labour services on this sale and what each one costs.')}
                </p>

                {!addingLabour && labourServices.length === 0 && (
                  <Button
                    type="button"
                    size="lg"
                    className="w-full text-base"
                    onClick={() => setAddingLabour(true)}
                  >
                    <Plus className="h-5 w-5" /> {t('Add Labour')}
                  </Button>
                )}

                {(addingLabour || labourServices.length > 0) && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('Labour services')}
                      </p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={t('Remove labour')}
                        onClick={clearLabour}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">{t('Labour number (optional)')}</Label>
                      <Input
                        type="tel"
                        inputMode="tel"
                        maxLength={20}
                        placeholder="03XX-XXXXXXX"
                        value={labourPhone}
                        onChange={(e) => setLabourPhone(e.target.value)}
                      />
                    </div>

                    {labourServices.length > 0 && (
                      <div className="space-y-1.5">
                        {labourServices.map((sv) => (
                          <div key={sv.serviceId} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {sv.serviceName}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              placeholder={t('Amount')}
                              className="h-9 w-28 text-right text-sm"
                              value={sv.amount || ''}
                              onChange={(e) =>
                                setLabourServiceAmount(sv.serviceId, Number(e.target.value))
                              }
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              aria-label={`${t('Remove')} ${sv.serviceName}`}
                              onClick={() => removeLabourService(sv.serviceId)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {creatingService ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitNewService();
                        }}
                      >
                        <Input
                          autoFocus
                          maxLength={80}
                          placeholder={t('New service name, e.g. Ceiling')}
                          value={newServiceName}
                          onChange={(e) => setNewServiceName(e.target.value)}
                          className="h-9 flex-1 text-sm"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCreatingService(false);
                            setNewServiceName('');
                          }}
                        >
                          {t('Cancel')}
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!newServiceName.trim() || createLabourService.isPending}
                        >
                          {createLabourService.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {t('Add')}
                        </Button>
                      </form>
                    ) : canCreateService ||
                      labourServicesList.some(
                        (svc) => !labourServices.some((sv) => sv.serviceId === svc.id),
                      ) ? (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setCreatingService(true);
                            return;
                          }
                          const svc = labourServicesList.find((s) => s.id === e.target.value);
                          if (svc) addLabourService(svc);
                        }}
                        className="flex h-9 w-full rounded-md border border-dashed border-input bg-transparent px-3 text-sm text-muted-foreground"
                      >
                        <option value="">{t('+ Add service…')}</option>
                        {labourServicesList
                          .filter((svc) => !labourServices.some((sv) => sv.serviceId === svc.id))
                          .map((svc) => (
                            <option key={svc.id} value={svc.id}>
                              {svc.name}
                            </option>
                          ))}
                        {canCreateService && (
                          <option value="__new__">{t('+ Create new service…')}</option>
                        )}
                      </select>
                    ) : (
                      labourServicesList.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t('No labour services set up for this store yet.')}
                        </p>
                      )
                    )}

                    {labourRentTotal > 0 && (
                      <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                        <span>{t('Total')}</span>
                        <span className="tabular-nums">{formatCurrency(labourRentTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-semibold">
                  <Truck className="h-4 w-4" /> {t('Transport')}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('Optionally add a transport fare for delivering the goods.')}
                </p>
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

              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">{t('Items to load')}</p>
                {filledCart.map((l) => (
                  <div key={l.key} className="flex justify-between text-muted-foreground">
                    <span>{l.product.name}</span>
                    <span className="tabular-nums">
                      {t('Qty')} {l.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
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
                <div className="space-y-2 border-t pt-3">
                  <Label>{t('Advance payment (optional)')}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={advanceAmount || ''}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                  />
                  {advance > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            { value: 'CASH', label: 'Cash' },
                            { value: 'BANK_TRANSFER', label: 'Bank' },
                          ] as const
                        ).map((m) => (
                          <Button
                            key={m.value}
                            type="button"
                            size="sm"
                            variant={advanceMethod === m.value ? 'default' : 'outline'}
                            onClick={() => setAdvanceMethod(m.value)}
                          >
                            {t(m.label)}
                          </Button>
                        ))}
                      </div>
                      {needsAdvanceBank && (
                        <>
                          <select
                            required
                            value={advanceBankAccountId}
                            onChange={(e) => setAdvanceBankAccountId(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                          >
                            <option value="">{t('Select account…')}</option>
                            {advanceBankAccounts.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                                {b.bankName ? ` (${b.bankName})` : ''}
                              </option>
                            ))}
                          </select>
                          <Input
                            required
                            value={advanceTransactionId}
                            onChange={(e) => setAdvanceTransactionId(e.target.value)}
                            placeholder={t('Transaction ID from the customer')}
                          />
                        </>
                      )}
                    </>
                  )}
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

          {step === 6 && completedSale && (
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
                          {/* One entry per (labour, service) — group back by name so
                              a labourer doing several services shows once, with all
                              their services listed together. */}
                          {Object.entries(
                            completedSale.labour.reduce<Record<string, string[]>>((acc, l) => {
                              (acc[l.name] ??= []).push(l.serviceName || '');
                              return acc;
                            }, {}),
                          )
                            .map(([name, services]) => {
                              const named = services.filter(Boolean);
                              return named.length ? `${name} (${named.join(', ')})` : name;
                            })
                            .join(', ')}
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
                    toast.error('Could not prepare the invoice'),
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
              disabled={step === 1 || step === 6 || completeSale.isPending}
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              <ArrowLeft className="h-4 w-4" /> {t('Back')}
            </Button>
            {step > 1 && step < 6 && (
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
              disabled={!!productsBlocker || checkStockAndContinue.isPending}
              title={productsBlocker ?? undefined}
              onClick={() => checkStockAndContinue.mutate()}
            >
              {checkStockAndContinue.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => setStep(4)}>
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={() => setStep(5)}>
              {t('Next')} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 5 && (
            <Button
              disabled={completeSale.isPending || !hasSpecificStore}
              onClick={async () => {
                if (
                  await confirm({
                    title: t('Complete this sale?'),
                    confirmLabel: t('Complete Sale'),
                  })
                ) {
                  completeSale.mutate();
                }
              }}
            >
              {completeSale.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Complete Sale')}
            </Button>
          )}
          {step === 6 && (
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
