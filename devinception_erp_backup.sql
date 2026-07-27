--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (ServBay)
-- Dumped by pg_dump version 16.9 (ServBay)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: enforce_balanced_journal_entry(); Type: FUNCTION; Schema: public; Owner: devinception
--

CREATE FUNCTION public.enforce_balanced_journal_entry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      entry_id VARCHAR(24);
      line_count BIGINT;
      debit_total NUMERIC;
      credit_total NUMERIC;
    BEGIN
      entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
      SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO line_count, debit_total, credit_total
        FROM journal_lines WHERE journal_entry_id = entry_id;
      IF line_count < 2 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'Journal entry % must have at least two balanced lines', entry_id;
      END IF;
      RETURN NULL;
    END;
    $$;


ALTER FUNCTION public.enforce_balanced_journal_entry() OWNER TO devinception;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.bank_accounts (
    id character varying(24) NOT NULL,
    name character varying(120) NOT NULL,
    bank_name character varying(120) DEFAULT ''::character varying NOT NULL,
    account_number character varying(60) DEFAULT ''::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bank_accounts OWNER TO devinception;

--
-- Name: brands; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.brands (
    id character varying(24) NOT NULL,
    name character varying(80) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.brands OWNER TO devinception;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.categories (
    id character varying(24) NOT NULL,
    name character varying(80) NOT NULL,
    description character varying(500) DEFAULT ''::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.categories OWNER TO devinception;

--
-- Name: counters; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.counters (
    key character varying(30) NOT NULL,
    scope character varying(30) DEFAULT ''::character varying NOT NULL,
    seq bigint DEFAULT 0 NOT NULL
);


ALTER TABLE public.counters OWNER TO devinception;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.customers (
    id character varying(24) NOT NULL,
    name character varying(120) NOT NULL,
    phone character varying(30) DEFAULT ''::character varying NOT NULL,
    email character varying(120) DEFAULT ''::character varying NOT NULL,
    address character varying(300) DEFAULT ''::character varying NOT NULL,
    credit_limit bigint DEFAULT 0 NOT NULL,
    outstanding bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customers_credit_limit_check CHECK ((credit_limit >= 0)),
    CONSTRAINT customers_outstanding_check CHECK ((outstanding >= 0))
);


ALTER TABLE public.customers OWNER TO devinception;

--
-- Name: gate_pass_items; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.gate_pass_items (
    id bigint NOT NULL,
    gate_pass_id character varying(24) NOT NULL,
    "position" integer NOT NULL,
    product_id character varying(24) NOT NULL,
    name character varying(160) NOT NULL,
    sku character varying(60) DEFAULT ''::character varying NOT NULL,
    barcode character varying(60) DEFAULT ''::character varying NOT NULL,
    quantity numeric(20,6) NOT NULL,
    unit_price bigint,
    line_total bigint,
    loaded_quantity numeric(20,6),
    load_confirmed boolean DEFAULT false NOT NULL,
    CONSTRAINT gate_pass_items_line_total_check CHECK ((line_total >= 0)),
    CONSTRAINT gate_pass_items_quantity_check CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT gate_pass_items_unit_price_check CHECK ((unit_price >= 0))
);


ALTER TABLE public.gate_pass_items OWNER TO devinception;

--
-- Name: gate_pass_items_id_seq; Type: SEQUENCE; Schema: public; Owner: devinception
--

CREATE SEQUENCE public.gate_pass_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gate_pass_items_id_seq OWNER TO devinception;

--
-- Name: gate_pass_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: devinception
--

ALTER SEQUENCE public.gate_pass_items_id_seq OWNED BY public.gate_pass_items.id;


--
-- Name: gate_passes; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.gate_passes (
    id character varying(24) NOT NULL,
    number character varying(100) NOT NULL,
    token character varying(255) NOT NULL,
    source_type character varying(10) NOT NULL,
    sale_id character varying(24),
    purchase_id character varying(24),
    document_number character varying(100) NOT NULL,
    warehouse_id character varying(24) NOT NULL,
    sale_date timestamp with time zone NOT NULL,
    customer_id character varying(24),
    customer_name character varying(120),
    customer_phone character varying(30) DEFAULT ''::character varying NOT NULL,
    customer_email character varying(120) DEFAULT ''::character varying NOT NULL,
    customer_address character varying(300) DEFAULT ''::character varying NOT NULL,
    vendor_id character varying(24),
    vendor_name character varying(120),
    vendor_phone character varying(30) DEFAULT ''::character varying NOT NULL,
    vendor_email character varying(120) DEFAULT ''::character varying NOT NULL,
    vendor_address character varying(300) DEFAULT ''::character varying NOT NULL,
    pricing_subtotal bigint,
    pricing_discount bigint,
    pricing_tax_percent numeric(9,4),
    pricing_tax bigint,
    pricing_total bigint,
    status character varying(10) DEFAULT 'PENDING'::character varying NOT NULL,
    created_by_id character varying(24),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    driver jsonb,
    load_notes text DEFAULT ''::text NOT NULL,
    signature_data text,
    processed_at timestamp with time zone,
    processed_by_id character varying(24),
    last_edited_at timestamp with time zone,
    last_edited_by_id character varying(24),
    CONSTRAINT gate_passes_check CHECK (((((source_type)::text = 'SALE'::text) AND (sale_id IS NOT NULL) AND (purchase_id IS NULL)) OR (((source_type)::text = 'PURCHASE'::text) AND (purchase_id IS NOT NULL) AND (sale_id IS NULL)))),
    CONSTRAINT gate_passes_pricing_discount_check CHECK ((pricing_discount >= 0)),
    CONSTRAINT gate_passes_pricing_subtotal_check CHECK ((pricing_subtotal >= 0)),
    CONSTRAINT gate_passes_pricing_tax_check CHECK ((pricing_tax >= 0)),
    CONSTRAINT gate_passes_pricing_tax_percent_check CHECK ((pricing_tax_percent >= (0)::numeric)),
    CONSTRAINT gate_passes_pricing_total_check CHECK ((pricing_total >= 0)),
    CONSTRAINT gate_passes_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['SALE'::character varying, 'PURCHASE'::character varying])::text[]))),
    CONSTRAINT gate_passes_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSED'::character varying, 'CANCELLED'::character varying])::text[])))
);


ALTER TABLE public.gate_passes OWNER TO devinception;

--
-- Name: goods_purchase_items; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.goods_purchase_items (
    id bigint NOT NULL,
    purchase_id character varying(24) NOT NULL,
    "position" integer NOT NULL,
    product_id character varying(24) NOT NULL,
    name character varying(160) NOT NULL,
    quantity numeric(20,6) NOT NULL,
    unit_cost bigint NOT NULL,
    tax_percent numeric(9,4) DEFAULT 0 NOT NULL,
    tax bigint DEFAULT 0 NOT NULL,
    line_total bigint NOT NULL,
    CONSTRAINT goods_purchase_items_line_total_check CHECK ((line_total >= 0)),
    CONSTRAINT goods_purchase_items_quantity_check CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT goods_purchase_items_tax_check CHECK ((tax >= 0)),
    CONSTRAINT goods_purchase_items_tax_percent_check CHECK ((tax_percent >= (0)::numeric)),
    CONSTRAINT goods_purchase_items_unit_cost_check CHECK ((unit_cost >= 0))
);


ALTER TABLE public.goods_purchase_items OWNER TO devinception;

--
-- Name: goods_purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: devinception
--

CREATE SEQUENCE public.goods_purchase_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.goods_purchase_items_id_seq OWNER TO devinception;

--
-- Name: goods_purchase_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: devinception
--

ALTER SEQUENCE public.goods_purchase_items_id_seq OWNED BY public.goods_purchase_items.id;


--
-- Name: goods_purchases; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.goods_purchases (
    id character varying(24) NOT NULL,
    number character varying(100) NOT NULL,
    vendor_invoice_no character varying(100) DEFAULT ''::character varying NOT NULL,
    vendor_id character varying(24) NOT NULL,
    vendor_name character varying(120) DEFAULT ''::character varying NOT NULL,
    warehouse_id character varying(24) NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    subtotal bigint DEFAULT 0 NOT NULL,
    discount bigint DEFAULT 0 NOT NULL,
    tax bigint DEFAULT 0 NOT NULL,
    total bigint NOT NULL,
    paid bigint DEFAULT 0 NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    payment_method character varying(30),
    bank_account_id character varying(24),
    notes text DEFAULT ''::text NOT NULL,
    created_by_id character varying(24),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gate_pass_id character varying(24),
    CONSTRAINT goods_purchases_discount_check CHECK ((discount >= 0)),
    CONSTRAINT goods_purchases_paid_check CHECK ((paid >= 0)),
    CONSTRAINT goods_purchases_subtotal_check CHECK ((subtotal >= 0)),
    CONSTRAINT goods_purchases_tax_check CHECK ((tax >= 0)),
    CONSTRAINT goods_purchases_total_check CHECK ((total >= 0))
);


ALTER TABLE public.goods_purchases OWNER TO devinception;

--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.invoice_items (
    id bigint NOT NULL,
    invoice_id character varying(24) NOT NULL,
    "position" integer NOT NULL,
    product_id character varying(24) NOT NULL,
    name character varying(160) NOT NULL,
    quantity numeric(20,6) NOT NULL,
    unit_cost bigint NOT NULL,
    tax_percent numeric(9,4) DEFAULT 0 NOT NULL,
    tax bigint DEFAULT 0 NOT NULL,
    line_total bigint NOT NULL,
    CONSTRAINT invoice_items_line_total_check CHECK ((line_total >= 0)),
    CONSTRAINT invoice_items_quantity_check CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT invoice_items_tax_check CHECK ((tax >= 0)),
    CONSTRAINT invoice_items_tax_percent_check CHECK ((tax_percent >= (0)::numeric)),
    CONSTRAINT invoice_items_unit_cost_check CHECK ((unit_cost >= 0))
);


ALTER TABLE public.invoice_items OWNER TO devinception;

--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: devinception
--

CREATE SEQUENCE public.invoice_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_items_id_seq OWNER TO devinception;

--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: devinception
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.invoices (
    id character varying(24) NOT NULL,
    type character varying(20) DEFAULT 'PURCHASE'::character varying NOT NULL,
    purchase_id character varying(24) NOT NULL,
    number character varying(100) NOT NULL,
    vendor_invoice_no character varying(100) DEFAULT ''::character varying NOT NULL,
    vendor_id character varying(24) NOT NULL,
    vendor_name character varying(120) DEFAULT ''::character varying NOT NULL,
    warehouse_id character varying(24) NOT NULL,
    date timestamp with time zone NOT NULL,
    subtotal bigint NOT NULL,
    discount bigint DEFAULT 0 NOT NULL,
    tax bigint DEFAULT 0 NOT NULL,
    total bigint NOT NULL,
    paid bigint DEFAULT 0 NOT NULL,
    balance bigint DEFAULT 0 NOT NULL,
    status character varying(10) DEFAULT 'UNPAID'::character varying NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_by_id character varying(24),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gate_pass_id character varying(24),
    CONSTRAINT invoices_balance_check CHECK ((balance >= 0)),
    CONSTRAINT invoices_discount_check CHECK ((discount >= 0)),
    CONSTRAINT invoices_paid_check CHECK ((paid >= 0)),
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying])::text[]))),
    CONSTRAINT invoices_subtotal_check CHECK ((subtotal >= 0)),
    CONSTRAINT invoices_tax_check CHECK ((tax >= 0)),
    CONSTRAINT invoices_total_check CHECK ((total >= 0)),
    CONSTRAINT invoices_type_check CHECK (((type)::text = 'PURCHASE'::text))
);


ALTER TABLE public.invoices OWNER TO devinception;

--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.journal_entries (
    id character varying(24) NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    ref_type character varying(30) NOT NULL,
    ref_id character varying(24),
    ref_no character varying(100) DEFAULT ''::character varying NOT NULL,
    warehouse_id character varying(24),
    created_by_id character varying(24),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.journal_entries OWNER TO devinception;

--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.journal_lines (
    id bigint NOT NULL,
    journal_entry_id character varying(24) NOT NULL,
    "position" integer NOT NULL,
    account character varying(30) NOT NULL,
    ref_id character varying(24),
    debit bigint DEFAULT 0 NOT NULL,
    credit bigint DEFAULT 0 NOT NULL,
    CONSTRAINT journal_lines_check CHECK ((((debit > 0) AND (credit = 0)) OR ((credit > 0) AND (debit = 0)))),
    CONSTRAINT journal_lines_credit_check CHECK ((credit >= 0)),
    CONSTRAINT journal_lines_debit_check CHECK ((debit >= 0))
);


ALTER TABLE public.journal_lines OWNER TO devinception;

--
-- Name: journal_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: devinception
--

CREATE SEQUENCE public.journal_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.journal_lines_id_seq OWNER TO devinception;

--
-- Name: journal_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: devinception
--

ALTER SEQUENCE public.journal_lines_id_seq OWNED BY public.journal_lines.id;


--
-- Name: labour; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.labour (
    id character varying(24) NOT NULL,
    name character varying(100) NOT NULL,
    phone_number character varying(15) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.labour OWNER TO devinception;

--
-- Name: products; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.products (
    id character varying(24) NOT NULL,
    name character varying(160) NOT NULL,
    sku character varying(60) DEFAULT ''::character varying NOT NULL,
    barcode character varying(60) DEFAULT ''::character varying NOT NULL,
    warehouse_id character varying(24),
    category_id character varying(24),
    brand_id character varying(24),
    unit_id character varying(24),
    purchase_price bigint DEFAULT 0 NOT NULL,
    sale_price bigint DEFAULT 0 NOT NULL,
    tax_percent numeric(9,4) DEFAULT 0 NOT NULL,
    min_stock numeric(20,6) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_min_stock_check CHECK ((min_stock >= (0)::numeric)),
    CONSTRAINT products_purchase_price_check CHECK ((purchase_price >= 0)),
    CONSTRAINT products_sale_price_check CHECK ((sale_price >= 0)),
    CONSTRAINT products_tax_percent_check CHECK ((tax_percent >= (0)::numeric))
);


ALTER TABLE public.products OWNER TO devinception;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.roles (
    id character varying(24) NOT NULL,
    name character varying(80) NOT NULL,
    description character varying(200) DEFAULT ''::character varying NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO devinception;

--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.sale_items (
    id bigint NOT NULL,
    sale_id character varying(24) NOT NULL,
    "position" integer NOT NULL,
    product_id character varying(24) NOT NULL,
    name character varying(160) NOT NULL,
    quantity numeric(20,6) NOT NULL,
    unit_price bigint NOT NULL,
    line_total bigint NOT NULL,
    cost bigint DEFAULT 0 NOT NULL,
    CONSTRAINT sale_items_cost_check CHECK ((cost >= 0)),
    CONSTRAINT sale_items_line_total_check CHECK ((line_total >= 0)),
    CONSTRAINT sale_items_quantity_check CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT sale_items_unit_price_check CHECK ((unit_price >= 0))
);


ALTER TABLE public.sale_items OWNER TO devinception;

--
-- Name: sale_items_id_seq; Type: SEQUENCE; Schema: public; Owner: devinception
--

CREATE SEQUENCE public.sale_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sale_items_id_seq OWNER TO devinception;

--
-- Name: sale_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: devinception
--

ALTER SEQUENCE public.sale_items_id_seq OWNED BY public.sale_items.id;


--
-- Name: sale_labour; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.sale_labour (
    id bigint NOT NULL,
    sale_id character varying(24) NOT NULL,
    "position" integer NOT NULL,
    labour_id character varying(24) NOT NULL,
    name character varying(100) NOT NULL,
    phone_number character varying(30) DEFAULT ''::character varying NOT NULL
);


ALTER TABLE public.sale_labour OWNER TO devinception;

--
-- Name: sale_labour_id_seq; Type: SEQUENCE; Schema: public; Owner: devinception
--

CREATE SEQUENCE public.sale_labour_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sale_labour_id_seq OWNER TO devinception;

--
-- Name: sale_labour_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: devinception
--

ALTER SEQUENCE public.sale_labour_id_seq OWNED BY public.sale_labour.id;


--
-- Name: sales; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.sales (
    id character varying(24) NOT NULL,
    number character varying(100) NOT NULL,
    customer_id character varying(24),
    customer_name character varying(120) DEFAULT 'Walk-in'::character varying NOT NULL,
    warehouse_id character varying(24) NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    subtotal bigint NOT NULL,
    discount bigint DEFAULT 0 NOT NULL,
    tax_percent numeric(9,4) DEFAULT 0 NOT NULL,
    tax bigint DEFAULT 0 NOT NULL,
    total bigint NOT NULL,
    cost bigint DEFAULT 0 NOT NULL,
    payment_method character varying(30) NOT NULL,
    cash_amount bigint DEFAULT 0 NOT NULL,
    online_amount bigint DEFAULT 0 NOT NULL,
    credit_amount bigint DEFAULT 0 NOT NULL,
    bank_account_id character varying(24),
    transfer_receipt_ref text DEFAULT ''::text NOT NULL,
    created_by_id character varying(24),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gate_pass_id character varying(24),
    CONSTRAINT sales_cash_amount_check CHECK ((cash_amount >= 0)),
    CONSTRAINT sales_cost_check CHECK ((cost >= 0)),
    CONSTRAINT sales_credit_amount_check CHECK ((credit_amount >= 0)),
    CONSTRAINT sales_discount_check CHECK ((discount >= 0)),
    CONSTRAINT sales_online_amount_check CHECK ((online_amount >= 0)),
    CONSTRAINT sales_subtotal_check CHECK ((subtotal >= 0)),
    CONSTRAINT sales_tax_check CHECK ((tax >= 0)),
    CONSTRAINT sales_tax_percent_check CHECK ((tax_percent >= (0)::numeric)),
    CONSTRAINT sales_total_check CHECK ((total >= 0))
);


ALTER TABLE public.sales OWNER TO devinception;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.schema_migrations (
    name character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO devinception;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.settings (
    id character varying(24) NOT NULL,
    key character varying(30) DEFAULT 'app'::character varying NOT NULL,
    company_name character varying(160) DEFAULT ''::character varying NOT NULL,
    address character varying(300) DEFAULT ''::character varying NOT NULL,
    phone character varying(30) DEFAULT ''::character varying NOT NULL,
    email character varying(120) DEFAULT ''::character varying NOT NULL,
    tax_number character varying(60) DEFAULT ''::character varying NOT NULL,
    currency character varying(10) DEFAULT 'PKR'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.settings OWNER TO devinception;

--
-- Name: stock_levels; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.stock_levels (
    id character varying(24) NOT NULL,
    product_id character varying(24) NOT NULL,
    warehouse_id character varying(24) NOT NULL,
    quantity numeric(20,6) DEFAULT 0 NOT NULL,
    avg_cost numeric(30,12) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_levels_avg_cost_check CHECK ((avg_cost >= (0)::numeric))
);


ALTER TABLE public.stock_levels OWNER TO devinception;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.stock_movements (
    id character varying(24) NOT NULL,
    product_id character varying(24) NOT NULL,
    warehouse_id character varying(24) NOT NULL,
    type character varying(10) NOT NULL,
    quantity numeric(20,6) NOT NULL,
    unit_cost numeric(30,12) DEFAULT 0 NOT NULL,
    total_cost bigint,
    ref_type character varying(30) DEFAULT ''::character varying NOT NULL,
    ref_no character varying(100) DEFAULT ''::character varying NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_total_cost_check CHECK ((total_cost >= 0)),
    CONSTRAINT stock_movements_type_check CHECK (((type)::text = ANY ((ARRAY['IN'::character varying, 'OUT'::character varying, 'ADJUST'::character varying])::text[]))),
    CONSTRAINT stock_movements_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);


ALTER TABLE public.stock_movements OWNER TO devinception;

--
-- Name: units; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.units (
    id character varying(24) NOT NULL,
    name character varying(40) NOT NULL,
    abbreviation character varying(20) DEFAULT ''::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.units OWNER TO devinception;

--
-- Name: users; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.users (
    id character varying(24) NOT NULL,
    name character varying(80) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(80) DEFAULT 'cashier'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    password_reset_token character varying(255),
    password_reset_expires timestamp with time zone,
    password_changed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO devinception;

--
-- Name: vendors; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.vendors (
    id character varying(24) NOT NULL,
    name character varying(120) NOT NULL,
    phone character varying(30) DEFAULT ''::character varying NOT NULL,
    email character varying(120) DEFAULT ''::character varying NOT NULL,
    ntn character varying(40) DEFAULT ''::character varying NOT NULL,
    address character varying(300) DEFAULT ''::character varying NOT NULL,
    outstanding bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendors_outstanding_check CHECK ((outstanding >= 0))
);


ALTER TABLE public.vendors OWNER TO devinception;

--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: devinception
--

CREATE TABLE public.warehouses (
    id character varying(24) NOT NULL,
    name character varying(120) NOT NULL,
    location character varying(120) DEFAULT ''::character varying NOT NULL,
    address character varying(300) DEFAULT ''::character varying NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouses OWNER TO devinception;

--
-- Name: gate_pass_items id; Type: DEFAULT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_pass_items ALTER COLUMN id SET DEFAULT nextval('public.gate_pass_items_id_seq'::regclass);


--
-- Name: goods_purchase_items id; Type: DEFAULT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchase_items ALTER COLUMN id SET DEFAULT nextval('public.goods_purchase_items_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: journal_lines id; Type: DEFAULT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_lines_id_seq'::regclass);


--
-- Name: sale_items id; Type: DEFAULT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_items ALTER COLUMN id SET DEFAULT nextval('public.sale_items_id_seq'::regclass);


--
-- Name: sale_labour id; Type: DEFAULT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_labour ALTER COLUMN id SET DEFAULT nextval('public.sale_labour_id_seq'::regclass);


--
-- Data for Name: bank_accounts; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.bank_accounts (id, name, bank_name, account_number, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.brands (id, name, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.categories (id, name, description, is_active, created_at, updated_at) FROM stdin;
6a5683f0c6607986e7b27b5f	Electronics	Electronic products and accessories	t	2026-07-14 18:46:08.498+00	2026-07-14 18:46:08.498+00
6a57947d691626fa2e70fcae	Watches	Analog and digital watches	t	2026-07-15 14:09:01.068+00	2026-07-15 14:09:01.068+00
6a5794f9691626fa2e70fcaf	Clothing	Daily wear and essentials	t	2026-07-15 14:11:05.141+00	2026-07-15 14:11:05.141+00
6a5795de691626fa2e70fcb0	Care Accessories	Teeth care and cleaning	t	2026-07-15 14:14:54.039+00	2026-07-15 14:14:54.039+00
6a579624691626fa2e70fcb1	Utensils	Kitchen accessories	t	2026-07-15 14:16:04.16+00	2026-07-15 14:16:04.16+00
\.


--
-- Data for Name: counters; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.counters (key, scope, seq) FROM stdin;
SALE	2026	19
INV	2026	9
GP	2026	9
PAY	2026	2
GATE	2026	16
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.customers (id, name, phone, email, address, credit_limit, outstanding, created_at, updated_at) FROM stdin;
6a4e67136e5e8d7e0a2a0fbd	Jane Retail	0300 1234567	jane@buyer.com	Gulberg, Lahore	50000	0	2026-07-08 15:04:51.267+00	2026-07-08 15:04:51.267+00
\.


--
-- Data for Name: gate_pass_items; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.gate_pass_items (id, gate_pass_id, "position", product_id, name, sku, barcode, quantity, unit_price, line_total, loaded_quantity, load_confirmed) FROM stdin;
1	6a57d5cbf92ac615e2cd5ac8	0	6a565b1b8dfbd616ff814bfd	Fan	FAN-09		15.000000	100000	1500000	\N	f
2	6a58dd058fdd14dc84642e50	0	6a4e67ee6e5e8d7e0a2a0fc1	Watches	WIDG-2		1.000000	10000	10000	\N	f
3	6a58e73215aa924adbc2e311	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	WIDG-1		1.000000	20000	20000	\N	f
4	6a59082fa202fa135946dab0	0	6a565b1b8dfbd616ff814bfd	Fan	FAN-09		2.000000	100000	200000	\N	f
5	6a5f7ecf6bbcd50759eeff7b	0	6a5677374dc5ee3ab36a4847	belt	BEL-09		1.000000	3000	3000	\N	f
6	6a60d7af3e048b5f9508faa0	0	6a5677374dc5ee3ab36a4847	belt	BEL-09		1.000000	3000	3000	\N	f
7	6a60d7af3e048b5f9508faa0	1	6a4e67ee6e5e8d7e0a2a0fc1	Watches	WIDG-2		1.000000	10000	10000	\N	f
8	6a60da763e048b5f9508faa9	0	6a565ac98dfbd616ff814bf9	Shirts	SRT-06		1.000000	120000	120000	\N	f
9	6a61062ba55836126d577ab1	0	6a5677374dc5ee3ab36a4847	belt	BEL-09		40.000000	1000	40000	\N	f
10	6a611d6b45136e629d192632	0	6a4e67ee6e5e8d7e0a2a0fc1	Watches	WIDG-2		1.000000	5000	5000	\N	f
11	6a611d6b45136e629d192633	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	WIDG-1		20.000000	10950	219000	\N	f
12	6a611d6b45136e629d192634	0	6a565ac98dfbd616ff814bf9	Shirts	SRT-06		7.000000	90000	630000	\N	f
13	6a611d6b45136e629d192635	0	6a565b1b8dfbd616ff814bfd	Fan	FAN-09		12.000000	49505	594059	\N	f
14	6a611d6b45136e629d192635	1	6a5677374dc5ee3ab36a4847	belt	BEL-09		6.000000	990	5941	\N	f
15	6a611d6b45136e629d192636	0	6a565b1b8dfbd616ff814bfd	Fan	FAN-09		26.000000	48077	1250000	\N	f
16	6a611d6b45136e629d192637	0	6a5677374dc5ee3ab36a4847	belt	BEL-09		19.000000	895	17000	\N	f
17	6a611d6b45136e629d192638	0	6a56529a429c2175f39287e1	Pents	PEN-01		12.000000	320000	3840000	\N	f
18	6a611d6b45136e629d192639	0	6a565b1b8dfbd616ff814bfd	Fan	FAN-09		1.000000	50000	50000	\N	f
\.


--
-- Data for Name: gate_passes; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.gate_passes (id, number, token, source_type, sale_id, purchase_id, document_number, warehouse_id, sale_date, customer_id, customer_name, customer_phone, customer_email, customer_address, vendor_id, vendor_name, vendor_phone, vendor_email, vendor_address, pricing_subtotal, pricing_discount, pricing_tax_percent, pricing_tax, pricing_total, status, created_by_id, created_at, updated_at, driver, load_notes, signature_data, processed_at, processed_by_id, last_edited_at, last_edited_by_id) FROM stdin;
6a59082fa202fa135946dab0	GATE-2026-000004	9cab27fde578201fbbf0c1064b3516ffe623fc56b92feb49827b7366bd7d0c9a	SALE	6a59082fa202fa135946daad	\N	SALE-2026-000016	6a565b598dfbd616ff814c01	2026-07-16 16:34:55.458+00	\N	Walk-in				\N	\N				200000	20000	16.0000	28800	208800	PENDING	6a3a7edae43b8c400ca0b630	2026-07-16 16:34:55.484+00	2026-07-23 19:06:50.703+00	\N		\N	\N	\N	\N	\N
6a5f7ecf6bbcd50759eeff7b	GATE-2026-000005	7a185f3eb107931213c497c6c27e0bdc8adb4f7b925b5765e46800cfdce733b7	SALE	6a5f7ecf6bbcd50759eeff78	\N	SALE-2026-000017	6a4e684b6e5e8d7e0a2a0fc7	2026-07-21 14:14:39.287+00	\N	Walk-in				\N	\N				3000	0	0.0000	0	3000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-21 14:14:39.367+00	2026-07-23 19:06:50.705+00	\N		\N	\N	\N	\N	\N
6a60d7af3e048b5f9508faa0	GATE-2026-000006	e8cd79dfff7eadd503eb6151befb63b4c003492cd9723b28fcbfdd83b5b501e7	SALE	6a60d7af3e048b5f9508fa9d	\N	SALE-2026-000018	6a4e684b6e5e8d7e0a2a0fc7	2026-07-22 14:46:07.119+00	\N	Walk-in				\N	\N				13000	0	0.0000	0	13000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 14:46:07.172+00	2026-07-23 19:06:50.707+00	\N		\N	\N	\N	\N	\N
6a61062ba55836126d577ab1	GATE-2026-000008	647f6bd6dc77a37dc8e1ba51210749282ef4b44595d9fbb482113b0c896cf824	PURCHASE	\N	6a61062ba55836126d577aae	GP-2026-0009	6a4e684b6e5e8d7e0a2a0fc7	2026-07-22 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	40000	0	0.0000	0	40000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 18:04:27.532+00	2026-07-23 19:06:50.711+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192632	GATE-2026-000009	3c2ca34acb62826a8c4ab0f9082680e30103ddc5f4d748ecae5ee00c37038ad0	PURCHASE	\N	6a553dffc4f8d4452fc826c0	GP-2026-0001	6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	5000	0	0.0000	0	5000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.116+00	2026-07-23 19:06:50.713+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192633	GATE-2026-000010	35a9fb0b81864e9d92a57b583d4b8b3b73369cca534090b6dd178a93c39ba6d0	PURCHASE	\N	6a5546289ceacea058c4fd08	GP-2026-0002	6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	220000	1000	0.0000	35040	254040	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.119+00	2026-07-23 19:06:50.714+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192634	GATE-2026-000011	f0b7e5e3e11d29aabf8ebcfa287b097610570d0747085637f548948d63f9f712	PURCHASE	\N	6a60d8523e048b5f9508faa1	GP-2026-0007	6a565b598dfbd616ff814c01	2026-07-22 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	630000	0	0.0000	0	630000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.122+00	2026-07-23 19:06:50.717+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192635	GATE-2026-000012	947d91f22ce4c30fdc6a89a4463673afcb97ec6ab7f2b1f8747364e03fbc8edc	PURCHASE	\N	6a567fcb9fd4e9d5e315526f	GP-2026-0004	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	606000	6000	0.0000	95049	695049	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.125+00	2026-07-23 19:06:50.718+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192636	GATE-2026-000013	822737d3a8b5ac5f96c1ea5bea3a416ec287feb4a7353c78a89c6f2412e7f64a	PURCHASE	\N	6a567a1b4dc5ee3ab36a485b	GP-2026-0003	6a565b598dfbd616ff814c01	2026-07-14 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	1300000	50000	0.0000	125000	1375000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.127+00	2026-07-23 19:06:50.72+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192637	GATE-2026-000014	6e40cdcf58b3773b0cbd847115c9b1baf7de5ecfc272dbde26f0216fed95748a	PURCHASE	\N	6a5686c91cd5a63ac9e284d6	GP-2026-0005	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	19000	2000	0.0000	0	17000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.129+00	2026-07-23 19:06:50.722+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192638	GATE-2026-000015	f1c73f28ecb11efb95804e153bd2b61b02826261922f7453eca6ff72c3ae2e8c	PURCHASE	\N	6a57a5b94a7dc6a746198bea	GP-2026-0006	6a4e67266e5e8d7e0a2a0fbe	2026-07-15 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	3840000	0	0.0000	0	3840000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.142+00	2026-07-23 19:06:50.724+00	\N		\N	\N	\N	\N	\N
6a611d6b45136e629d192639	GATE-2026-000016	e049060fdd5d95b532e2f2b811f609ebb965d5f11820d349465b1159bbd6b4c7	PURCHASE	\N	6a60da833e048b5f9508faaa	GP-2026-0008	6a565b598dfbd616ff814c01	2026-07-22 00:00:00+00	\N	\N				6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	Hall Road, Lahore	50000	0	0.0000	0	50000	PENDING	6a3a7edae43b8c400ca0b630	2026-07-22 19:43:39.144+00	2026-07-23 19:06:50.726+00	\N		\N	\N	\N	\N	\N
6a57d5cbf92ac615e2cd5ac8	GATE-2026-000001	0b5217d0bd6f705835adf4526a5bef47f323bde6b830ec5d7f82a0d999a7399c	SALE	6a57d5cbf92ac615e2cd5ac5	\N	SALE-2026-000013	6a4e67266e5e8d7e0a2a0fbe	2026-07-15 18:47:39.791+00	\N	Walk-in				\N	\N				1500000	0	0.0000	0	1500000	PROCESSED	6a3a7edae43b8c400ca0b630	2026-07-15 18:47:39.827+00	2026-07-23 19:06:50.694+00	\N		\N	2026-07-16 14:16:56.403+00	6a3a7edae43b8c400ca0b630	\N	\N
6a58dd058fdd14dc84642e50	GATE-2026-000002	42240b57308ce1e24ea2a9a3ac964cc0a5a193a75ecbfc406304277f829cb99e	SALE	6a58dd058fdd14dc84642e4d	\N	SALE-2026-000014	6a4e67266e5e8d7e0a2a0fbe	2026-07-16 13:30:45.78+00	\N	Walk-in				\N	\N				10000	0	0.0000	0	10000	PROCESSED	6a3a7edae43b8c400ca0b630	2026-07-16 13:30:45.856+00	2026-07-23 19:06:50.7+00	\N		\N	2026-07-22 14:31:57.52+00	6a3a7edae43b8c400ca0b630	\N	\N
6a58e73215aa924adbc2e311	GATE-2026-000003	3341e6d5369fc108e651b356b4ce88c3a28405a3601f661da9fb9bd0ea0fc958	SALE	6a58e73215aa924adbc2e30f	\N	SALE-2026-000015	6a4e67266e5e8d7e0a2a0fbe	2026-07-16 14:14:10.608+00	\N	Walk-in				\N	\N				20000	0	0.0000	0	20000	PROCESSED	6a3a7edae43b8c400ca0b630	2026-07-16 14:14:10.631+00	2026-07-23 19:06:50.701+00	\N		\N	2026-07-16 14:17:24.349+00	6a3a7edae43b8c400ca0b630	\N	\N
6a60da763e048b5f9508faa9	GATE-2026-000007	249586cab093c7d1460a52a4c5b39f170907fafb7abbf8f8d428898a00157498	SALE	6a60da763e048b5f9508faa6	\N	SALE-2026-000019	6a565b598dfbd616ff814c01	2026-07-22 14:57:58.669+00	\N	Walk-in				\N	\N				120000	0	0.0000	0	120000	PROCESSED	6a3a7edae43b8c400ca0b630	2026-07-22 14:57:58.684+00	2026-07-23 19:06:50.709+00	\N		\N	2026-07-22 19:28:28.365+00	\N	\N	\N
\.


--
-- Data for Name: goods_purchase_items; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.goods_purchase_items (id, purchase_id, "position", product_id, name, quantity, unit_cost, tax_percent, tax, line_total) FROM stdin;
1	6a553dffc4f8d4452fc826c0	0	6a4e67ee6e5e8d7e0a2a0fc1	Watches	1.000000	5000	0.0000	0	5000
2	6a5546289ceacea058c4fd08	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	20.000000	10950	16.0000	35040	219000
3	6a567a1b4dc5ee3ab36a485b	0	6a565b1b8dfbd616ff814bfd	Fan	26.000000	48077	10.0000	125000	1250000
4	6a567fcb9fd4e9d5e315526f	0	6a565b1b8dfbd616ff814bfd	Fan	12.000000	49505	16.0000	95049	594059
5	6a567fcb9fd4e9d5e315526f	1	6a5677374dc5ee3ab36a4847	belt	6.000000	990	0.0000	0	5941
6	6a5686c91cd5a63ac9e284d6	0	6a5677374dc5ee3ab36a4847	belt	19.000000	895	0.0000	0	17000
7	6a57a5b94a7dc6a746198bea	0	6a56529a429c2175f39287e1	Pents	12.000000	320000	0.0000	0	3840000
8	6a60d8523e048b5f9508faa1	0	6a565ac98dfbd616ff814bf9	Shirts	7.000000	90000	0.0000	0	630000
9	6a60da833e048b5f9508faaa	0	6a565b1b8dfbd616ff814bfd	Fan	1.000000	50000	0.0000	0	50000
10	6a61062ba55836126d577aae	0	6a5677374dc5ee3ab36a4847	belt	40.000000	1000	0.0000	0	40000
\.


--
-- Data for Name: goods_purchases; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.goods_purchases (id, number, vendor_invoice_no, vendor_id, vendor_name, warehouse_id, date, subtotal, discount, tax, total, paid, balance, payment_method, bank_account_id, notes, created_by_id, created_at, updated_at, gate_pass_id) FROM stdin;
6a61062ba55836126d577aae	GP-2026-0009	VINV-20260722-230354	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e684b6e5e8d7e0a2a0fc7	2026-07-22 00:00:00+00	40000	0	0	40000	0	40000	\N	\N	Labour: Fahad	6a3a7edae43b8c400ca0b630	2026-07-22 18:04:27.501+00	2026-07-23 19:06:50.736+00	6a61062ba55836126d577ab1
6a553dffc4f8d4452fc826c0	GP-2026-0001	VINV-20260714-003503	6a4e67026e5e8d7e0a2a0fbc		6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 00:00:00+00	5000	0	0	5000	0	5000	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-13 19:35:27.629+00	2026-07-23 19:06:50.739+00	6a611d6b45136e629d192632
6a5546289ceacea058c4fd08	GP-2026-0002	VINV-20260714-010932	6a4e67026e5e8d7e0a2a0fbc		6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 00:00:00+00	220000	1000	35040	254040	254040	0	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-13 20:10:16.644+00	2026-07-23 19:06:50.741+00	6a611d6b45136e629d192633
6a60d8523e048b5f9508faa1	GP-2026-0007	VINV-20260722-194839	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a565b598dfbd616ff814c01	2026-07-22 00:00:00+00	630000	0	0	630000	0	630000	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-22 14:48:50.691+00	2026-07-23 19:06:50.743+00	6a611d6b45136e629d192634
6a567fcb9fd4e9d5e315526f	GP-2026-0004	VINV-20260714-232722	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 00:00:00+00	606000	6000	95049	695049	695049	0	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:28:27.965+00	2026-07-23 19:06:50.744+00	6a611d6b45136e629d192635
6a567a1b4dc5ee3ab36a485b	GP-2026-0003	VINV-20260714-230301	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a565b598dfbd616ff814c01	2026-07-14 00:00:00+00	1300000	50000	125000	1375000	1375000	0	CASH	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:04:11.101+00	2026-07-23 19:06:50.746+00	6a611d6b45136e629d192636
6a5686c91cd5a63ac9e284d6	GP-2026-0005	VINV-20260714-235748	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 00:00:00+00	19000	2000	0	17000	0	17000	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:58:17.983+00	2026-07-23 19:06:50.747+00	6a611d6b45136e629d192637
6a57a5b94a7dc6a746198bea	GP-2026-0006	VINV-20260715-202151	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e67266e5e8d7e0a2a0fbe	2026-07-15 00:00:00+00	3840000	0	0	3840000	0	3840000	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-15 15:22:33.639+00	2026-07-23 19:06:50.749+00	6a611d6b45136e629d192638
6a60da833e048b5f9508faaa	GP-2026-0008	VINV-20260722-195802	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a565b598dfbd616ff814c01	2026-07-22 00:00:00+00	50000	0	0	50000	0	50000	\N	\N		6a3a7edae43b8c400ca0b630	2026-07-22 14:58:11.288+00	2026-07-23 19:06:50.75+00	6a611d6b45136e629d192639
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.invoice_items (id, invoice_id, "position", product_id, name, quantity, unit_cost, tax_percent, tax, line_total) FROM stdin;
1	6a57a3cfcfbeb9f6704f8bae	0	6a4e67ee6e5e8d7e0a2a0fc1	Watches	1.000000	5000	0.0000	0	5000
2	6a57a3cfcfbeb9f6704f8baf	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	20.000000	10950	16.0000	35040	219000
3	6a57a3cfcfbeb9f6704f8bb0	0	6a565b1b8dfbd616ff814bfd	Fan	26.000000	48077	10.0000	125000	1250000
4	6a57a3cfcfbeb9f6704f8bb1	0	6a565b1b8dfbd616ff814bfd	Fan	12.000000	49505	16.0000	95049	594059
5	6a57a3cfcfbeb9f6704f8bb1	1	6a5677374dc5ee3ab36a4847	belt	6.000000	990	0.0000	0	5941
6	6a57a3cfcfbeb9f6704f8bb2	0	6a5677374dc5ee3ab36a4847	belt	19.000000	895	0.0000	0	17000
7	6a57a5b9cfbeb9f6704f8c7a	0	6a56529a429c2175f39287e1	Pents	12.000000	320000	0.0000	0	3840000
8	6a60d8524bdea538a5d0a12c	0	6a565ac98dfbd616ff814bf9	Shirts	7.000000	90000	0.0000	0	630000
9	6a60da834bdea538a5d0a2a6	0	6a565b1b8dfbd616ff814bfd	Fan	1.000000	50000	0.0000	0	50000
10	6a61062b4bdea538a5d0b2a3	0	6a5677374dc5ee3ab36a4847	belt	40.000000	1000	0.0000	0	40000
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.invoices (id, type, purchase_id, number, vendor_invoice_no, vendor_id, vendor_name, warehouse_id, date, subtotal, discount, tax, total, paid, balance, status, notes, created_by_id, created_at, updated_at, gate_pass_id) FROM stdin;
6a61062b4bdea538a5d0b2a3	PURCHASE	6a61062ba55836126d577aae	GP-2026-0009	VINV-20260722-230354	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e684b6e5e8d7e0a2a0fc7	2026-07-22 00:00:00+00	40000	0	0	40000	0	40000	UNPAID	Labour: Fahad	6a3a7edae43b8c400ca0b630	2026-07-22 18:04:27.519+00	2026-07-23 19:06:50.737+00	6a61062ba55836126d577ab1
6a57a3cfcfbeb9f6704f8bae	PURCHASE	6a553dffc4f8d4452fc826c0	GP-2026-0001	VINV-20260714-003503	6a4e67026e5e8d7e0a2a0fbc		6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 00:00:00+00	5000	0	0	5000	0	5000	UNPAID		6a3a7edae43b8c400ca0b630	2026-07-15 15:14:23.398+00	2026-07-23 19:06:50.74+00	6a611d6b45136e629d192632
6a57a3cfcfbeb9f6704f8baf	PURCHASE	6a5546289ceacea058c4fd08	GP-2026-0002	VINV-20260714-010932	6a4e67026e5e8d7e0a2a0fbc		6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 00:00:00+00	220000	1000	35040	254040	254040	0	PAID		6a3a7edae43b8c400ca0b630	2026-07-15 15:14:23.398+00	2026-07-23 19:06:50.742+00	6a611d6b45136e629d192633
6a60d8524bdea538a5d0a12c	PURCHASE	6a60d8523e048b5f9508faa1	GP-2026-0007	VINV-20260722-194839	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a565b598dfbd616ff814c01	2026-07-22 00:00:00+00	630000	0	0	630000	0	630000	UNPAID		6a3a7edae43b8c400ca0b630	2026-07-22 14:48:50.707+00	2026-07-23 19:06:50.743+00	6a611d6b45136e629d192634
6a57a3cfcfbeb9f6704f8bb1	PURCHASE	6a567fcb9fd4e9d5e315526f	GP-2026-0004	VINV-20260714-232722	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 00:00:00+00	606000	6000	95049	695049	695049	0	PAID		6a3a7edae43b8c400ca0b630	2026-07-15 15:14:23.398+00	2026-07-23 19:06:50.745+00	6a611d6b45136e629d192635
6a57a3cfcfbeb9f6704f8bb0	PURCHASE	6a567a1b4dc5ee3ab36a485b	GP-2026-0003	VINV-20260714-230301	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a565b598dfbd616ff814c01	2026-07-14 00:00:00+00	1300000	50000	125000	1375000	1375000	0	PAID		6a3a7edae43b8c400ca0b630	2026-07-15 15:14:23.398+00	2026-07-23 19:06:50.746+00	6a611d6b45136e629d192636
6a57a3cfcfbeb9f6704f8bb2	PURCHASE	6a5686c91cd5a63ac9e284d6	GP-2026-0005	VINV-20260714-235748	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 00:00:00+00	19000	2000	0	17000	0	17000	UNPAID		6a3a7edae43b8c400ca0b630	2026-07-15 15:14:23.398+00	2026-07-23 19:06:50.748+00	6a611d6b45136e629d192637
6a57a5b9cfbeb9f6704f8c7a	PURCHASE	6a57a5b94a7dc6a746198bea	GP-2026-0006	VINV-20260715-202151	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a4e67266e5e8d7e0a2a0fbe	2026-07-15 00:00:00+00	3840000	0	0	3840000	0	3840000	UNPAID		6a3a7edae43b8c400ca0b630	2026-07-15 15:22:33.678+00	2026-07-23 19:06:50.749+00	6a611d6b45136e629d192638
6a60da834bdea538a5d0a2a6	PURCHASE	6a60da833e048b5f9508faaa	GP-2026-0008	VINV-20260722-195802	6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	6a565b598dfbd616ff814c01	2026-07-22 00:00:00+00	50000	0	0	50000	0	50000	UNPAID		6a3a7edae43b8c400ca0b630	2026-07-22 14:58:11.297+00	2026-07-23 19:06:50.751+00	6a611d6b45136e629d192639
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.journal_entries (id, date, description, ref_type, ref_id, ref_no, warehouse_id, created_by_id, created_at, updated_at) FROM stdin;
6a4e680e6e5e8d7e0a2a0fc6	2026-07-08 15:09:02.148+00	Stock adjustment: Watches	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-08 15:09:02.156+00	2026-07-23 19:06:50.601+00
6a4e68cc6e5e8d7e0a2a0fca	2026-07-08 15:12:12.636+00	POS sale SALE-2026-000001	SALE	6a4e68cc6e5e8d7e0a2a0fc9	SALE-2026-000001	\N	6a3a7edae43b8c400ca0b630	2026-07-08 15:12:12.654+00	2026-07-23 19:06:50.604+00
6a4e7a876fc288d787353179	2026-07-08 16:27:51.296+00	Stock adjustment: Watches	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-08 16:27:51.301+00	2026-07-23 19:06:50.606+00
6a4e7a8c6fc288d78735317c	2026-07-08 16:27:56.953+00	Stock adjustment: Mobiles	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-08 16:27:56.954+00	2026-07-23 19:06:50.607+00
6a4e7b086fc288d787353180	2026-07-08 16:30:00.785+00	POS sale SALE-2026-000002	SALE	6a4e7b086fc288d78735317f	SALE-2026-000002	\N	6a3a7edae43b8c400ca0b630	2026-07-08 16:30:00.793+00	2026-07-23 19:06:50.608+00
6a4e7b086fc288d787353181	2026-07-08 16:30:00.785+00	COGS SALE-2026-000002	SALE	6a4e7b086fc288d78735317f	SALE-2026-000002	\N	6a3a7edae43b8c400ca0b630	2026-07-08 16:30:00.795+00	2026-07-23 19:06:50.61+00
6a553dffc4f8d4452fc826c2	2026-07-13 00:00:00+00	Goods purchase GP-2026-0001	PURCHASE	6a553dffc4f8d4452fc826c0	GP-2026-0001	\N	6a3a7edae43b8c400ca0b630	2026-07-13 19:35:27.647+00	2026-07-23 19:06:50.611+00
6a55410ebf73d60a6af90834	2026-07-13 19:48:30.249+00	Stock adjustment: Brush	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-13 19:48:30.255+00	2026-07-23 19:06:50.612+00
6a554138bf73d60a6af90837	2026-07-13 19:49:12.551+00	POS sale SALE-2026-000003	SALE	6a554138bf73d60a6af90836	SALE-2026-000003	\N	6a3a7edae43b8c400ca0b630	2026-07-13 19:49:12.566+00	2026-07-23 19:06:50.613+00
6a554138bf73d60a6af90838	2026-07-13 19:49:12.551+00	COGS SALE-2026-000003	SALE	6a554138bf73d60a6af90836	SALE-2026-000003	\N	6a3a7edae43b8c400ca0b630	2026-07-13 19:49:12.568+00	2026-07-23 19:06:50.614+00
6a55458fee8b6673f0ca9c77	2026-07-13 20:07:43.372+00	POS sale SALE-2026-000004	SALE	6a55458fee8b6673f0ca9c76	SALE-2026-000004	\N	6a3a7edae43b8c400ca0b630	2026-07-13 20:07:43.406+00	2026-07-23 19:06:50.616+00
6a55458fee8b6673f0ca9c78	2026-07-13 20:07:43.372+00	COGS SALE-2026-000004	SALE	6a55458fee8b6673f0ca9c76	SALE-2026-000004	\N	6a3a7edae43b8c400ca0b630	2026-07-13 20:07:43.408+00	2026-07-23 19:06:50.617+00
6a5546289ceacea058c4fd0a	2026-07-13 00:00:00+00	Goods purchase GP-2026-0002	PURCHASE	6a5546289ceacea058c4fd08	GP-2026-0002	\N	6a3a7edae43b8c400ca0b630	2026-07-13 20:10:16.657+00	2026-07-23 19:06:50.618+00
6a5546aec93cb08e85ab718b	2026-07-13 20:12:30.97+00	POS sale SALE-2026-000005	SALE	6a5546aec93cb08e85ab718a	SALE-2026-000005	\N	6a3a7edae43b8c400ca0b630	2026-07-13 20:12:30.991+00	2026-07-23 19:06:50.619+00
6a5546aec93cb08e85ab718c	2026-07-13 20:12:30.97+00	COGS SALE-2026-000005	SALE	6a5546aec93cb08e85ab718a	SALE-2026-000005	\N	6a3a7edae43b8c400ca0b630	2026-07-13 20:12:30.993+00	2026-07-23 19:06:50.62+00
6a563f9071d3685f0b3a99bf	2026-07-14 13:54:24.189+00	COGS SALE-2026-000006	SALE	6a563f9071d3685f0b3a99be	SALE-2026-000006	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 13:54:24.239+00	2026-07-23 19:06:50.622+00
6a56462371d3685f0b3a99c3	2026-07-14 14:22:27.169+00	POS sale SALE-2026-000007	SALE	6a56462371d3685f0b3a99c2	SALE-2026-000007	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 14:22:27.18+00	2026-07-23 19:06:50.623+00
6a56462371d3685f0b3a99c4	2026-07-14 14:22:27.169+00	COGS SALE-2026-000007	SALE	6a56462371d3685f0b3a99c2	SALE-2026-000007	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 14:22:27.182+00	2026-07-23 19:06:50.625+00
6a56491b36f9bfc9440cac04	2026-07-14 14:35:07.922+00	POS sale SALE-2026-000008	SALE	6a56491b36f9bfc9440cac03	SALE-2026-000008	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 14:35:07.951+00	2026-07-23 19:06:50.626+00
6a56491b36f9bfc9440cac05	2026-07-14 14:35:07.922+00	COGS SALE-2026-000008	SALE	6a56491b36f9bfc9440cac03	SALE-2026-000008	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 14:35:07.953+00	2026-07-23 19:06:50.627+00
6a565add8dfbd616ff814bfc	2026-07-14 15:50:53.528+00	Stock adjustment: Shirts	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 15:50:53.531+00	2026-07-23 19:06:50.628+00
6a565b368dfbd616ff814c00	2026-07-14 15:52:22.034+00	Stock adjustment: Fan	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 15:52:22.035+00	2026-07-23 19:06:50.63+00
6a56778b4dc5ee3ab36a484a	2026-07-14 17:53:15.607+00	Stock adjustment: belt	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:53:15.61+00	2026-07-23 19:06:50.631+00
6a5677944dc5ee3ab36a484c	2026-07-14 17:53:24.915+00	Stock adjustment: Shirts	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:53:24.916+00	2026-07-23 19:06:50.632+00
6a56779b4dc5ee3ab36a484e	2026-07-14 17:53:31.258+00	Stock adjustment: Brush	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:53:31.259+00	2026-07-23 19:06:50.634+00
6a5677a34dc5ee3ab36a4850	2026-07-14 17:53:39.976+00	Stock adjustment: Watches	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:53:39.977+00	2026-07-23 19:06:50.635+00
6a5678084dc5ee3ab36a4854	2026-07-14 17:55:20.858+00	Stock adjustment: Spoon	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:55:20.858+00	2026-07-23 19:06:50.636+00
6a5678284dc5ee3ab36a4856	2026-07-14 17:55:52.261+00	Stock adjustment: Fan	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:55:52.261+00	2026-07-23 19:06:50.637+00
6a56782d4dc5ee3ab36a4858	2026-07-14 17:55:57.592+00	Stock adjustment: Watches	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:55:57.592+00	2026-07-23 19:06:50.638+00
6a5678334dc5ee3ab36a485a	2026-07-14 17:56:03.881+00	Stock adjustment: Watches	OPENING	\N		\N	6a3a7edae43b8c400ca0b630	2026-07-14 17:56:03.881+00	2026-07-23 19:06:50.64+00
6a567a1b4dc5ee3ab36a485e	2026-07-14 00:00:00+00	Goods purchase GP-2026-0003	PURCHASE	6a567a1b4dc5ee3ab36a485b	GP-2026-0003	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-14 18:04:11.119+00	2026-07-23 19:06:50.642+00
6a567a1b4dc5ee3ab36a485f	2026-07-14 00:00:00+00	Payment for GP-2026-0003	PAYMENT	6a567a1b4dc5ee3ab36a485b	GP-2026-0003	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-14 18:04:11.122+00	2026-07-23 19:06:50.643+00
6a567c423212c0410ef0f39f	2026-07-14 18:13:22.227+00	POS sale SALE-2026-000009	SALE	6a567c423212c0410ef0f39e	SALE-2026-000009	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-14 18:13:22.256+00	2026-07-23 19:06:50.644+00
6a567c423212c0410ef0f3a0	2026-07-14 18:13:22.227+00	COGS SALE-2026-000009	SALE	6a567c423212c0410ef0f39e	SALE-2026-000009	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-14 18:13:22.26+00	2026-07-23 19:06:50.646+00
6a567e169fd4e9d5e315526c	2026-07-14 18:21:10.785+00	POS sale SALE-2026-000010	SALE	6a567e169fd4e9d5e315526b	SALE-2026-000010	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-14 18:21:10.809+00	2026-07-23 19:06:50.647+00
6a567e169fd4e9d5e315526d	2026-07-14 18:21:10.785+00	COGS SALE-2026-000010	SALE	6a567e169fd4e9d5e315526b	SALE-2026-000010	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-14 18:21:10.811+00	2026-07-23 19:06:50.649+00
6a567e2a9fd4e9d5e315526e	2026-07-14 18:21:30.285+00	Payment for VINV-20260714-010932	PAYMENT	\N	PAY-2026-0001	\N	6a3a7edae43b8c400ca0b630	2026-07-14 18:21:30.29+00	2026-07-23 19:06:50.651+00
6a567fcb9fd4e9d5e3155273	2026-07-14 00:00:00+00	Goods purchase GP-2026-0004	PURCHASE	6a567fcb9fd4e9d5e315526f	GP-2026-0004	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 18:28:27.987+00	2026-07-23 19:06:50.653+00
6a567fff9fd4e9d5e3155276	2026-07-14 18:29:19.826+00	POS sale SALE-2026-000011	SALE	6a567fff9fd4e9d5e3155275	SALE-2026-000011	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 18:29:19.834+00	2026-07-23 19:06:50.654+00
6a567fff9fd4e9d5e3155277	2026-07-14 18:29:19.826+00	COGS SALE-2026-000011	SALE	6a567fff9fd4e9d5e3155275	SALE-2026-000011	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 18:29:19.836+00	2026-07-23 19:06:50.659+00
6a56800b9fd4e9d5e315527a	2026-07-14 18:29:30.991+00	POS sale SALE-2026-000012	SALE	6a56800a9fd4e9d5e3155279	SALE-2026-000012	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 18:29:31.001+00	2026-07-23 19:06:50.66+00
6a56800b9fd4e9d5e315527b	2026-07-14 18:29:30.991+00	COGS SALE-2026-000012	SALE	6a56800a9fd4e9d5e3155279	SALE-2026-000012	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 18:29:31.003+00	2026-07-23 19:06:50.662+00
6a5686c91cd5a63ac9e284d8	2026-07-14 00:00:00+00	Goods purchase GP-2026-0005	PURCHASE	6a5686c91cd5a63ac9e284d6	GP-2026-0005	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-14 18:58:17.999+00	2026-07-23 19:06:50.663+00
6a568ed41cd5a63ac9e284d9	2026-07-14 19:32:36.969+00	Payment for VINV-20260714-232722	PAYMENT	\N	PAY-2026-0002	\N	6a3a7edae43b8c400ca0b630	2026-07-14 19:32:36.972+00	2026-07-23 19:06:50.664+00
6a57a5b94a7dc6a746198bed	2026-07-15 00:00:00+00	Goods purchase GP-2026-0006	PURCHASE	6a57a5b94a7dc6a746198bea	GP-2026-0006	6a4e67266e5e8d7e0a2a0fbe	6a3a7edae43b8c400ca0b630	2026-07-15 15:22:33.666+00	2026-07-23 19:06:50.667+00
6a57d5cbf92ac615e2cd5ac6	2026-07-15 18:47:39.791+00	POS sale SALE-2026-000013	SALE	6a57d5cbf92ac615e2cd5ac5	SALE-2026-000013	6a4e67266e5e8d7e0a2a0fbe	6a3a7edae43b8c400ca0b630	2026-07-15 18:47:39.815+00	2026-07-23 19:06:50.668+00
6a57d5cbf92ac615e2cd5ac7	2026-07-15 18:47:39.791+00	COGS SALE-2026-000013	SALE	6a57d5cbf92ac615e2cd5ac5	SALE-2026-000013	6a4e67266e5e8d7e0a2a0fbe	6a3a7edae43b8c400ca0b630	2026-07-15 18:47:39.819+00	2026-07-23 19:06:50.669+00
6a58dd058fdd14dc84642e4e	2026-07-16 13:30:45.78+00	POS sale SALE-2026-000014	SALE	6a58dd058fdd14dc84642e4d	SALE-2026-000014	6a4e67266e5e8d7e0a2a0fbe	6a3a7edae43b8c400ca0b630	2026-07-16 13:30:45.834+00	2026-07-23 19:06:50.67+00
6a58dd058fdd14dc84642e4f	2026-07-16 13:30:45.78+00	COGS SALE-2026-000014	SALE	6a58dd058fdd14dc84642e4d	SALE-2026-000014	6a4e67266e5e8d7e0a2a0fbe	6a3a7edae43b8c400ca0b630	2026-07-16 13:30:45.845+00	2026-07-23 19:06:50.671+00
6a58e73215aa924adbc2e310	2026-07-16 14:14:10.608+00	POS sale SALE-2026-000015	SALE	6a58e73215aa924adbc2e30f	SALE-2026-000015	6a4e67266e5e8d7e0a2a0fbe	6a3a7edae43b8c400ca0b630	2026-07-16 14:14:10.624+00	2026-07-23 19:06:50.672+00
6a59082fa202fa135946daae	2026-07-16 16:34:55.458+00	POS sale SALE-2026-000016	SALE	6a59082fa202fa135946daad	SALE-2026-000016	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-16 16:34:55.476+00	2026-07-23 19:06:50.675+00
6a59082fa202fa135946daaf	2026-07-16 16:34:55.458+00	COGS SALE-2026-000016	SALE	6a59082fa202fa135946daad	SALE-2026-000016	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-16 16:34:55.478+00	2026-07-23 19:06:50.676+00
6a5f7ecf6bbcd50759eeff79	2026-07-21 14:14:39.287+00	POS sale SALE-2026-000017	SALE	6a5f7ecf6bbcd50759eeff78	SALE-2026-000017	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-21 14:14:39.344+00	2026-07-23 19:06:50.678+00
6a5f7ecf6bbcd50759eeff7a	2026-07-21 14:14:39.287+00	COGS SALE-2026-000017	SALE	6a5f7ecf6bbcd50759eeff78	SALE-2026-000017	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-21 14:14:39.358+00	2026-07-23 19:06:50.679+00
6a60d7af3e048b5f9508fa9e	2026-07-22 14:46:07.119+00	POS sale SALE-2026-000018	SALE	6a60d7af3e048b5f9508fa9d	SALE-2026-000018	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-22 14:46:07.158+00	2026-07-23 19:06:50.68+00
6a60d7af3e048b5f9508fa9f	2026-07-22 14:46:07.119+00	COGS SALE-2026-000018	SALE	6a60d7af3e048b5f9508fa9d	SALE-2026-000018	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-22 14:46:07.162+00	2026-07-23 19:06:50.682+00
6a60d8523e048b5f9508faa4	2026-07-22 00:00:00+00	Goods purchase GP-2026-0007	PURCHASE	6a60d8523e048b5f9508faa1	GP-2026-0007	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-22 14:48:50.704+00	2026-07-23 19:06:50.684+00
6a60da763e048b5f9508faa7	2026-07-22 14:57:58.669+00	POS sale SALE-2026-000019	SALE	6a60da763e048b5f9508faa6	SALE-2026-000019	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-22 14:57:58.675+00	2026-07-23 19:06:50.685+00
6a60da763e048b5f9508faa8	2026-07-22 14:57:58.669+00	COGS SALE-2026-000019	SALE	6a60da763e048b5f9508faa6	SALE-2026-000019	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-22 14:57:58.676+00	2026-07-23 19:06:50.686+00
6a60da833e048b5f9508faac	2026-07-22 00:00:00+00	Goods purchase GP-2026-0008	PURCHASE	6a60da833e048b5f9508faaa	GP-2026-0008	6a565b598dfbd616ff814c01	6a3a7edae43b8c400ca0b630	2026-07-22 14:58:11.293+00	2026-07-23 19:06:50.688+00
6a61062ba55836126d577ab0	2026-07-22 00:00:00+00	Goods purchase GP-2026-0009	PURCHASE	6a61062ba55836126d577aae	GP-2026-0009	6a4e684b6e5e8d7e0a2a0fc7	6a3a7edae43b8c400ca0b630	2026-07-22 18:04:27.516+00	2026-07-23 19:06:50.689+00
\.


--
-- Data for Name: journal_lines; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.journal_lines (id, journal_entry_id, "position", account, ref_id, debit, credit) FROM stdin;
1	6a4e680e6e5e8d7e0a2a0fc6	0	INVENTORY	\N	25000	0
2	6a4e680e6e5e8d7e0a2a0fc6	1	EQUITY	\N	0	25000
3	6a4e68cc6e5e8d7e0a2a0fca	0	CASH	\N	10000	0
4	6a4e68cc6e5e8d7e0a2a0fca	1	SALES	\N	0	10000
5	6a4e7a876fc288d787353179	0	INVENTORY	\N	100000	0
6	6a4e7a876fc288d787353179	1	EQUITY	\N	0	100000
7	6a4e7a8c6fc288d78735317c	0	INVENTORY	\N	429000	0
8	6a4e7a8c6fc288d78735317c	1	EQUITY	\N	0	429000
9	6a4e7b086fc288d787353180	0	BANK	\N	60000	0
10	6a4e7b086fc288d787353180	1	SALES	\N	0	60000
11	6a4e7b086fc288d787353181	0	COGS	\N	33000	0
12	6a4e7b086fc288d787353181	1	INVENTORY	\N	0	33000
13	6a553dffc4f8d4452fc826c2	0	INVENTORY	\N	5000	0
14	6a553dffc4f8d4452fc826c2	1	AP	6a4e67026e5e8d7e0a2a0fbc	0	5000
15	6a55410ebf73d60a6af90834	0	INVENTORY	\N	500000	0
16	6a55410ebf73d60a6af90834	1	EQUITY	\N	0	500000
17	6a554138bf73d60a6af90837	0	CASH	\N	35000	0
18	6a554138bf73d60a6af90837	1	SALES	\N	0	35000
19	6a554138bf73d60a6af90838	0	COGS	\N	20000	0
20	6a554138bf73d60a6af90838	1	INVENTORY	\N	0	20000
21	6a55458fee8b6673f0ca9c77	0	CASH	\N	290000	0
22	6a55458fee8b6673f0ca9c77	1	SALES	\N	0	250000
23	6a55458fee8b6673f0ca9c77	2	TAX	\N	0	40000
24	6a55458fee8b6673f0ca9c78	0	COGS	\N	165000	0
25	6a55458fee8b6673f0ca9c78	1	INVENTORY	\N	0	165000
26	6a5546289ceacea058c4fd0a	0	INVENTORY	\N	219000	0
27	6a5546289ceacea058c4fd0a	1	TAX	\N	35040	0
28	6a5546289ceacea058c4fd0a	2	AP	6a4e67026e5e8d7e0a2a0fbc	0	254040
29	6a5546aec93cb08e85ab718b	0	BANK	\N	371200	0
30	6a5546aec93cb08e85ab718b	1	SALES	\N	0	320000
31	6a5546aec93cb08e85ab718b	2	TAX	\N	0	51200
32	6a5546aec93cb08e85ab718c	0	COGS	\N	175616	0
33	6a5546aec93cb08e85ab718c	1	INVENTORY	\N	0	175616
34	6a563f9071d3685f0b3a99bf	0	COGS	\N	100000	0
35	6a563f9071d3685f0b3a99bf	1	INVENTORY	\N	0	100000
36	6a56462371d3685f0b3a99c3	0	CASH	\N	125280	0
37	6a56462371d3685f0b3a99c3	1	SALES	\N	0	108000
38	6a56462371d3685f0b3a99c3	2	TAX	\N	0	17280
39	6a56462371d3685f0b3a99c4	0	COGS	\N	55000	0
40	6a56462371d3685f0b3a99c4	1	INVENTORY	\N	0	55000
41	6a56491b36f9bfc9440cac04	0	CASH	\N	162400	0
42	6a56491b36f9bfc9440cac04	1	SALES	\N	0	140000
43	6a56491b36f9bfc9440cac04	2	TAX	\N	0	22400
44	6a56491b36f9bfc9440cac05	0	COGS	\N	74880	0
45	6a56491b36f9bfc9440cac05	1	INVENTORY	\N	0	74880
46	6a565add8dfbd616ff814bfc	0	INVENTORY	\N	900000	0
47	6a565add8dfbd616ff814bfc	1	EQUITY	\N	0	900000
48	6a565b368dfbd616ff814c00	0	INVENTORY	\N	5000000	0
49	6a565b368dfbd616ff814c00	1	EQUITY	\N	0	5000000
50	6a56778b4dc5ee3ab36a484a	0	INVENTORY	\N	23000	0
51	6a56778b4dc5ee3ab36a484a	1	EQUITY	\N	0	23000
52	6a5677944dc5ee3ab36a484c	0	INVENTORY	\N	900000	0
53	6a5677944dc5ee3ab36a484c	1	EQUITY	\N	0	900000
54	6a56779b4dc5ee3ab36a484e	0	INVENTORY	\N	200000	0
55	6a56779b4dc5ee3ab36a484e	1	EQUITY	\N	0	200000
56	6a5677a34dc5ee3ab36a4850	0	INVENTORY	\N	150000	0
57	6a5677a34dc5ee3ab36a4850	1	EQUITY	\N	0	150000
58	6a5678084dc5ee3ab36a4854	0	INVENTORY	\N	280000	0
59	6a5678084dc5ee3ab36a4854	1	EQUITY	\N	0	280000
60	6a5678284dc5ee3ab36a4856	0	INVENTORY	\N	50000	0
61	6a5678284dc5ee3ab36a4856	1	EQUITY	\N	0	50000
62	6a56782d4dc5ee3ab36a4858	0	INVENTORY	\N	5000	0
63	6a56782d4dc5ee3ab36a4858	1	EQUITY	\N	0	5000
64	6a5678334dc5ee3ab36a485a	0	INVENTORY	\N	50000	0
65	6a5678334dc5ee3ab36a485a	1	EQUITY	\N	0	50000
66	6a567a1b4dc5ee3ab36a485e	0	INVENTORY	\N	1250000	0
67	6a567a1b4dc5ee3ab36a485e	1	TAX	\N	125000	0
68	6a567a1b4dc5ee3ab36a485e	2	AP	6a4e67026e5e8d7e0a2a0fbc	0	1375000
69	6a567a1b4dc5ee3ab36a485f	0	AP	6a4e67026e5e8d7e0a2a0fbc	1375000	0
70	6a567a1b4dc5ee3ab36a485f	1	CASH	\N	0	1375000
71	6a567c423212c0410ef0f39f	0	CASH	\N	60000	0
72	6a567c423212c0410ef0f39f	1	SALES	\N	0	60000
73	6a567c423212c0410ef0f3a0	0	COGS	\N	42000	0
74	6a567c423212c0410ef0f3a0	1	INVENTORY	\N	0	42000
75	6a567e169fd4e9d5e315526c	0	CASH	\N	2320000	0
76	6a567e169fd4e9d5e315526c	1	SALES	\N	0	2000000
77	6a567e169fd4e9d5e315526c	2	TAX	\N	0	320000
78	6a567e169fd4e9d5e315526d	0	COGS	\N	1057692	0
79	6a567e169fd4e9d5e315526d	1	INVENTORY	\N	0	1057692
80	6a567e2a9fd4e9d5e315526e	0	AP	6a4e67026e5e8d7e0a2a0fbc	254040	0
81	6a567e2a9fd4e9d5e315526e	1	CASH	\N	0	254040
82	6a567fcb9fd4e9d5e3155273	0	INVENTORY	\N	600000	0
83	6a567fcb9fd4e9d5e3155273	1	TAX	\N	95049	0
84	6a567fcb9fd4e9d5e3155273	2	AP	6a4e67026e5e8d7e0a2a0fbc	0	695049
85	6a567fff9fd4e9d5e3155276	0	CASH	\N	1200000	0
86	6a567fff9fd4e9d5e3155276	1	SALES	\N	0	1200000
87	6a567fff9fd4e9d5e3155277	0	COGS	\N	594059	0
88	6a567fff9fd4e9d5e3155277	1	INVENTORY	\N	0	594059
89	6a56800b9fd4e9d5e315527a	0	CASH	\N	30000	0
90	6a56800b9fd4e9d5e315527a	1	SALES	\N	0	30000
91	6a56800b9fd4e9d5e315527b	0	COGS	\N	9980	0
92	6a56800b9fd4e9d5e315527b	1	INVENTORY	\N	0	9980
93	6a5686c91cd5a63ac9e284d8	0	INVENTORY	\N	17000	0
94	6a5686c91cd5a63ac9e284d8	1	AP	6a4e67026e5e8d7e0a2a0fbc	0	17000
95	6a568ed41cd5a63ac9e284d9	0	AP	6a4e67026e5e8d7e0a2a0fbc	695049	0
96	6a568ed41cd5a63ac9e284d9	1	CASH	\N	0	695049
97	6a57a5b94a7dc6a746198bed	0	INVENTORY	\N	3840000	0
98	6a57a5b94a7dc6a746198bed	1	AP	6a4e67026e5e8d7e0a2a0fbc	0	3840000
99	6a57d5cbf92ac615e2cd5ac6	0	CASH	\N	1500000	0
100	6a57d5cbf92ac615e2cd5ac6	1	SALES	\N	0	1500000
101	6a57d5cbf92ac615e2cd5ac7	0	COGS	\N	750000	0
102	6a57d5cbf92ac615e2cd5ac7	1	INVENTORY	\N	0	750000
103	6a58dd058fdd14dc84642e4e	0	CASH	\N	10000	0
104	6a58dd058fdd14dc84642e4e	1	SALES	\N	0	10000
105	6a58dd058fdd14dc84642e4f	0	COGS	\N	5000	0
106	6a58dd058fdd14dc84642e4f	1	INVENTORY	\N	0	5000
107	6a58e73215aa924adbc2e310	0	CASH	\N	20000	0
108	6a58e73215aa924adbc2e310	1	SALES	\N	0	20000
109	6a59082fa202fa135946daae	0	CASH	\N	208800	0
110	6a59082fa202fa135946daae	1	SALES	\N	0	180000
111	6a59082fa202fa135946daae	2	TAX	\N	0	28800
112	6a59082fa202fa135946daaf	0	COGS	\N	96154	0
113	6a59082fa202fa135946daaf	1	INVENTORY	\N	0	96154
114	6a5f7ecf6bbcd50759eeff79	0	CASH	\N	3000	0
115	6a5f7ecf6bbcd50759eeff79	1	SALES	\N	0	3000
116	6a5f7ecf6bbcd50759eeff7a	0	COGS	\N	946	0
117	6a5f7ecf6bbcd50759eeff7a	1	INVENTORY	\N	0	946
118	6a60d7af3e048b5f9508fa9e	0	CASH	\N	13000	0
119	6a60d7af3e048b5f9508fa9e	1	SALES	\N	0	13000
120	6a60d7af3e048b5f9508fa9f	0	COGS	\N	5947	0
121	6a60d7af3e048b5f9508fa9f	1	INVENTORY	\N	0	5947
122	6a60d8523e048b5f9508faa4	0	INVENTORY	\N	630000	0
123	6a60d8523e048b5f9508faa4	1	AP	6a4e67026e5e8d7e0a2a0fbc	0	630000
124	6a60da763e048b5f9508faa7	0	CASH	\N	120000	0
125	6a60da763e048b5f9508faa7	1	SALES	\N	0	120000
126	6a60da763e048b5f9508faa8	0	COGS	\N	90000	0
127	6a60da763e048b5f9508faa8	1	INVENTORY	\N	0	90000
128	6a60da833e048b5f9508faac	0	INVENTORY	\N	50000	0
129	6a60da833e048b5f9508faac	1	AP	6a4e67026e5e8d7e0a2a0fbc	0	50000
130	6a61062ba55836126d577ab0	0	INVENTORY	\N	40000	0
131	6a61062ba55836126d577ab0	1	AP	6a4e67026e5e8d7e0a2a0fbc	0	40000
\.


--
-- Data for Name: labour; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.labour (id, name, phone_number, created_at, updated_at) FROM stdin;
6a4e65cd6e5e8d7e0a2a0fbb	Workshop Labour	0300 1234567	2026-07-08 14:59:25.68+00	2026-07-08 14:59:25.68+00
6a592dd9c8863641f838fb45	Fahad	03001111115	2026-07-16 19:15:37.61+00	2026-07-16 19:15:37.61+00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.products (id, name, sku, barcode, warehouse_id, category_id, brand_id, unit_id, purchase_price, sale_price, tax_percent, min_stock, is_active, created_at, updated_at) FROM stdin;
6a4e67346e5e8d7e0a2a0fc0	Mobiles	WIDG-1		\N	6a5683f0c6607986e7b27b5f	\N	6a568413c6607986e7b27b60	11000	20000	0.0000	0.000000	t	2026-07-08 15:05:24.998+00	2026-07-15 14:10:19.169+00
6a4e67ee6e5e8d7e0a2a0fc1	Watches	WIDG-2		\N	6a57947d691626fa2e70fcae	\N	6a568413c6607986e7b27b60	5000	10000	10.0000	10.000000	t	2026-07-08 15:08:30.695+00	2026-07-15 14:10:09.574+00
6a554104bf73d60a6af90831	Brush	BRU-01		\N	6a5795de691626fa2e70fcb0	\N	6a568413c6607986e7b27b60	20000	35000	16.0000	25.000000	t	2026-07-13 19:48:20.123+00	2026-07-15 14:15:11.27+00
6a56529a429c2175f39287e1	Pents	PEN-01		\N	6a5794f9691626fa2e70fcaf	\N	6a568413c6607986e7b27b60	320000	400000	16.0000	0.000000	t	2026-07-14 15:15:38.826+00	2026-07-16 14:53:34.913+00
6a565ac98dfbd616ff814bf9	Shirts	SRT-06		\N	6a5794f9691626fa2e70fcaf	\N	6a568413c6607986e7b27b60	90000	120000	0.0000	10.000000	t	2026-07-14 15:50:33.415+00	2026-07-22 14:48:50.702+00
6a565b1b8dfbd616ff814bfd	Fan	FAN-09		\N	6a5683f0c6607986e7b27b5f	\N	6a568413c6607986e7b27b60	50000	100000	0.0000	100.000000	t	2026-07-14 15:51:55.236+00	2026-07-22 14:58:11.292+00
6a5677374dc5ee3ab36a4847	belt	BEL-09		6a4e684b6e5e8d7e0a2a0fc7	6a5794f9691626fa2e70fcaf	\N	6a568413c6607986e7b27b60	1000	3000	0.0000	0.000000	t	2026-07-14 17:51:51.66+00	2026-07-22 18:04:27.511+00
6a5678004dc5ee3ab36a4851	Spoon	SPO-00		6a565b598dfbd616ff814c01	6a579624691626fa2e70fcb1	\N	6a568413c6607986e7b27b60	7000	10000	0.0000	0.000000	t	2026-07-14 17:55:12.159+00	2026-07-15 14:16:18.182+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.roles (id, name, description, permissions, is_system, created_at, updated_at) FROM stdin;
6a3a91c8cea6f2955e8a76ab	cashier	Point-of-sale operator	{customers:read,customers:create,inventory:read,sales:read,sales:create}	t	2026-06-23 14:01:44.674+00	2026-07-08 15:00:20.455+00
6a3a91c8cea6f2955e8a76ad	accountant	Finance / reporting	{vendors:read,customers:read,inventory:read,purchases:read,sales:read,invoices:read,finance:read,finance:manage,reports:read}	t	2026-06-23 14:01:44.694+00	2026-07-08 15:00:20.476+00
6a3a91c8cea6f2955e8a76af	manager	Can view staff and run day-to-day operations	{users:read,vendors:read,vendors:create,vendors:update,customers:read,customers:create,customers:update,inventory:read,inventory:manage,purchases:read,purchases:create,sales:read,sales:create,invoices:read,invoices:create,finance:read,reports:read}	t	2026-06-23 14:01:44.696+00	2026-07-08 15:00:20.478+00
6a3a91c8cea6f2955e8a76b1	admin	Manages staff accounts, operations and finance	{users:read,users:create,users:update_role,users:set_active,users:delete,vendors:read,vendors:create,vendors:update,vendors:delete,customers:read,customers:create,customers:update,customers:delete,inventory:read,inventory:manage,purchases:read,purchases:create,sales:read,sales:create,invoices:read,invoices:create,finance:read,finance:manage,reports:read}	t	2026-06-23 14:01:44.698+00	2026-07-08 15:00:20.48+00
6a3a91c8cea6f2955e8a76b3	super_admin	Full access, including role management	{*}	t	2026-06-23 14:01:44.7+00	2026-07-08 15:00:20.482+00
\.


--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.sale_items (id, sale_id, "position", product_id, name, quantity, unit_price, line_total, cost) FROM stdin;
1	6a4e68cc6e5e8d7e0a2a0fc9	0	6a4e67346e5e8d7e0a2a0fc0	Widget	1.000000	10000	10000	0
2	6a4e7b086fc288d78735317f	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	3.000000	20000	60000	33000
3	6a554138bf73d60a6af90836	0	6a554104bf73d60a6af90831	Brush	1.000000	35000	35000	20000
4	6a55458fee8b6673f0ca9c76	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	15.000000	20000	300000	165000
5	6a5546aec93cb08e85ab718a	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	16.000000	20000	320000	175616
6	6a563f9071d3685f0b3a99be	0	6a554104bf73d60a6af90831	Brush	5.000000	35000	175000	100000
7	6a56462371d3685f0b3a99c2	0	6a4e67ee6e5e8d7e0a2a0fc1	Watches	11.000000	10000	110000	55000
8	6a56491b36f9bfc9440cac03	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	5.000000	20000	100000	54880
9	6a56491b36f9bfc9440cac03	1	6a4e67ee6e5e8d7e0a2a0fc1	Watches	4.000000	10000	40000	20000
10	6a567c423212c0410ef0f39e	0	6a5678004dc5ee3ab36a4851	Spoon	6.000000	10000	60000	42000
11	6a567e169fd4e9d5e315526b	0	6a565b1b8dfbd616ff814bfd	Fan	22.000000	100000	2200000	1057692
12	6a567fff9fd4e9d5e3155275	0	6a565b1b8dfbd616ff814bfd	Fan	12.000000	100000	1200000	594059
13	6a56800a9fd4e9d5e3155279	0	6a5677374dc5ee3ab36a4847	belt	10.000000	3000	30000	9980
14	6a57d5cbf92ac615e2cd5ac5	0	6a565b1b8dfbd616ff814bfd	Fan	15.000000	100000	1500000	750000
15	6a58dd058fdd14dc84642e4d	0	6a4e67ee6e5e8d7e0a2a0fc1	Watches	1.000000	10000	10000	5000
16	6a58e73215aa924adbc2e30f	0	6a4e67346e5e8d7e0a2a0fc0	Mobiles	1.000000	20000	20000	0
17	6a59082fa202fa135946daad	0	6a565b1b8dfbd616ff814bfd	Fan	2.000000	100000	200000	96154
18	6a5f7ecf6bbcd50759eeff78	0	6a5677374dc5ee3ab36a4847	belt	1.000000	3000	3000	946
19	6a60d7af3e048b5f9508fa9d	0	6a5677374dc5ee3ab36a4847	belt	1.000000	3000	3000	947
20	6a60d7af3e048b5f9508fa9d	1	6a4e67ee6e5e8d7e0a2a0fc1	Watches	1.000000	10000	10000	5000
21	6a60da763e048b5f9508faa6	0	6a565ac98dfbd616ff814bf9	Shirts	1.000000	120000	120000	90000
\.


--
-- Data for Name: sale_labour; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.sale_labour (id, sale_id, "position", labour_id, name, phone_number) FROM stdin;
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.sales (id, number, customer_id, customer_name, warehouse_id, date, subtotal, discount, tax_percent, tax, total, cost, payment_method, cash_amount, online_amount, credit_amount, bank_account_id, transfer_receipt_ref, created_by_id, created_at, updated_at, gate_pass_id) FROM stdin;
6a4e68cc6e5e8d7e0a2a0fc9	SALE-2026-000001	\N	Walk-in	6a4e67266e5e8d7e0a2a0fbe	2026-07-08 15:12:12.636+00	10000	0	0.0000	0	10000	0	CASH	10000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-08 15:12:12.651+00	2026-07-23 19:06:50.521+00	\N
6a4e7b086fc288d78735317f	SALE-2026-000002	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-08 16:30:00.785+00	60000	0	0.0000	0	60000	33000	BANK_TRANSFER	0	60000	0	\N	http://localhost:5050/uploads/1783528200766-2bd44a25-e09e-41ac-a714-ad06e78ec6c0.png	6a3a7edae43b8c400ca0b630	2026-07-08 16:30:00.791+00	2026-07-23 19:06:50.529+00	\N
6a554138bf73d60a6af90836	SALE-2026-000003	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 19:49:12.551+00	35000	0	0.0000	0	35000	20000	CASH	35000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-13 19:49:12.561+00	2026-07-23 19:06:50.532+00	\N
6a55458fee8b6673f0ca9c76	SALE-2026-000004	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 20:07:43.372+00	300000	50000	16.0000	40000	290000	165000	CASH	290000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-13 20:07:43.402+00	2026-07-23 19:06:50.535+00	\N
6a5546aec93cb08e85ab718a	SALE-2026-000005	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-13 20:12:30.97+00	320000	0	16.0000	51200	371200	175616	BANK_TRANSFER	0	371200	0	\N	http://localhost:5050/uploads/1783973550939-4d574e7a-3624-4e27-87db-2891105ced5f.jpg	6a3a7edae43b8c400ca0b630	2026-07-13 20:12:30.987+00	2026-07-23 19:06:50.537+00	\N
6a563f9071d3685f0b3a99be	SALE-2026-000006	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 13:54:24.189+00	175000	175000	0.0000	0	0	100000	CASH	0	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 13:54:24.231+00	2026-07-23 19:06:50.539+00	\N
6a56462371d3685f0b3a99c2	SALE-2026-000007	6a4e67136e5e8d7e0a2a0fbd	Jane Retail	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 14:22:27.169+00	110000	2000	16.0000	17280	125280	55000	CASH	125280	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 14:22:27.176+00	2026-07-23 19:06:50.541+00	\N
6a56491b36f9bfc9440cac03	SALE-2026-000008	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 14:35:07.922+00	140000	0	16.0000	22400	162400	74880	CASH	162400	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 14:35:07.947+00	2026-07-23 19:06:50.543+00	\N
6a567c423212c0410ef0f39e	SALE-2026-000009	\N	Walk-in	6a565b598dfbd616ff814c01	2026-07-14 18:13:22.227+00	60000	0	0.0000	0	60000	42000	CASH	60000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:13:22.251+00	2026-07-23 19:06:50.545+00	\N
6a567e169fd4e9d5e315526b	SALE-2026-000010	\N	Walk-in	6a565b598dfbd616ff814c01	2026-07-14 18:21:10.785+00	2200000	200000	16.0000	320000	2320000	1057692	CASH	2320000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:21:10.804+00	2026-07-23 19:06:50.548+00	\N
6a567fff9fd4e9d5e3155275	SALE-2026-000011	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 18:29:19.826+00	1200000	0	0.0000	0	1200000	594059	CASH	1200000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:29:19.832+00	2026-07-23 19:06:50.55+00	\N
6a56800a9fd4e9d5e3155279	SALE-2026-000012	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-14 18:29:30.991+00	30000	0	0.0000	0	30000	9980	CASH	30000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-14 18:29:30.999+00	2026-07-23 19:06:50.552+00	\N
6a57d5cbf92ac615e2cd5ac5	SALE-2026-000013	\N	Walk-in	6a4e67266e5e8d7e0a2a0fbe	2026-07-15 18:47:39.791+00	1500000	0	0.0000	0	1500000	750000	CASH	1500000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-15 18:47:39.81+00	2026-07-23 19:06:50.728+00	6a57d5cbf92ac615e2cd5ac8
6a58dd058fdd14dc84642e4d	SALE-2026-000014	\N	Walk-in	6a4e67266e5e8d7e0a2a0fbe	2026-07-16 13:30:45.78+00	10000	0	0.0000	0	10000	5000	CASH	10000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-16 13:30:45.825+00	2026-07-23 19:06:50.731+00	6a58dd058fdd14dc84642e50
6a58e73215aa924adbc2e30f	SALE-2026-000015	\N	Walk-in	6a4e67266e5e8d7e0a2a0fbe	2026-07-16 14:14:10.608+00	20000	0	0.0000	0	20000	0	CASH	20000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-16 14:14:10.621+00	2026-07-23 19:06:50.732+00	6a58e73215aa924adbc2e311
6a59082fa202fa135946daad	SALE-2026-000016	\N	Walk-in	6a565b598dfbd616ff814c01	2026-07-16 16:34:55.458+00	200000	20000	16.0000	28800	208800	96154	CASH	208800	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-16 16:34:55.468+00	2026-07-23 19:06:50.733+00	6a59082fa202fa135946dab0
6a5f7ecf6bbcd50759eeff78	SALE-2026-000017	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-21 14:14:39.287+00	3000	0	0.0000	0	3000	946	CASH	3000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-21 14:14:39.335+00	2026-07-23 19:06:50.734+00	6a5f7ecf6bbcd50759eeff7b
6a60d7af3e048b5f9508fa9d	SALE-2026-000018	\N	Walk-in	6a4e684b6e5e8d7e0a2a0fc7	2026-07-22 14:46:07.119+00	13000	0	0.0000	0	13000	5947	CASH	13000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-22 14:46:07.154+00	2026-07-23 19:06:50.734+00	6a60d7af3e048b5f9508faa0
6a60da763e048b5f9508faa6	SALE-2026-000019	\N	Walk-in	6a565b598dfbd616ff814c01	2026-07-22 14:57:58.669+00	120000	0	0.0000	0	120000	90000	CASH	120000	0	0	\N		6a3a7edae43b8c400ca0b630	2026-07-22 14:57:58.673+00	2026-07-23 19:06:50.735+00	6a60da763e048b5f9508faa9
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.schema_migrations (name, applied_at) FROM stdin;
001-initial-schema	2026-07-23 18:35:02.348441+00
002-gate-pass-processing	2026-07-24 11:18:47.72558+00
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.settings (id, key, company_name, address, phone, email, tax_number, currency, created_at, updated_at) FROM stdin;
6a4e7b396fc288d787353182	app	DevInception					PKR	2026-07-08 16:30:49.47+00	2026-07-08 16:30:49.47+00
\.


--
-- Data for Name: stock_levels; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.stock_levels (id, product_id, warehouse_id, quantity, avg_cost, created_at, updated_at) FROM stdin;
6a4e68076e5e8d7e0a2a0fc2	6a4e67346e5e8d7e0a2a0fc0	6a4e67266e5e8d7e0a2a0fbe	8.000000	0.000000000000	2026-07-08 15:08:55.76+00	2026-07-16 14:14:10.612+00
6a4e680e6e5e8d7e0a2a0fc4	6a4e67ee6e5e8d7e0a2a0fc1	6a4e67266e5e8d7e0a2a0fbe	15.000000	5000.000000000000	2026-07-08 15:09:02.139+00	2026-07-16 13:30:45.798+00
6a4e7a876fc288d787353177	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	35.000000	5000.000000000000	2026-07-08 16:27:51.288+00	2026-07-22 14:46:07.146+00
6a4e7a8c6fc288d78735317a	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	20.000000	10976.000000000000	2026-07-08 16:27:56.951+00	2026-07-14 14:35:07.927+00
6a55410ebf73d60a6af90832	6a554104bf73d60a6af90831	6a4e684b6e5e8d7e0a2a0fc7	29.000000	20000.000000000000	2026-07-13 19:48:30.232+00	2026-07-14 17:53:31.256+00
6a565add8dfbd616ff814bfa	6a565ac98dfbd616ff814bf9	6a4e684b6e5e8d7e0a2a0fc7	20.000000	90000.000000000000	2026-07-14 15:50:53.519+00	2026-07-14 17:53:24.912+00
6a565b368dfbd616ff814bfe	6a565b1b8dfbd616ff814bfd	6a4e67266e5e8d7e0a2a0fbe	86.000000	50000.000000000000	2026-07-14 15:52:22.03+00	2026-07-15 18:47:39.798+00
6a56778b4dc5ee3ab36a4848	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	76.000000	974.578947368421	2026-07-14 17:53:15.602+00	2026-07-22 18:04:27.506+00
6a5678084dc5ee3ab36a4852	6a5678004dc5ee3ab36a4851	6a565b598dfbd616ff814c01	34.000000	7000.000000000000	2026-07-14 17:55:20.855+00	2026-07-14 18:13:22.232+00
6a567a1b4dc5ee3ab36a485c	6a565b1b8dfbd616ff814bfd	6a565b598dfbd616ff814c01	3.000000	48718.000000000000	2026-07-14 18:04:11.111+00	2026-07-22 14:58:11.29+00
6a567fcb9fd4e9d5e3155270	6a565b1b8dfbd616ff814bfd	6a4e684b6e5e8d7e0a2a0fc7	0.000000	49504.916666666664	2026-07-14 18:28:27.969+00	2026-07-14 18:29:19.828+00
6a57a5b94a7dc6a746198beb	6a56529a429c2175f39287e1	6a4e67266e5e8d7e0a2a0fbe	12.000000	320000.000000000000	2026-07-15 15:22:33.649+00	2026-07-15 15:22:33.652+00
6a60d8523e048b5f9508faa2	6a565ac98dfbd616ff814bf9	6a565b598dfbd616ff814c01	6.000000	90000.000000000000	2026-07-22 14:48:50.695+00	2026-07-22 14:57:58.67+00
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.stock_movements (id, product_id, warehouse_id, type, quantity, unit_cost, total_cost, ref_type, ref_no, date, created_at, updated_at) FROM stdin;
6a4e68076e5e8d7e0a2a0fc3	6a4e67346e5e8d7e0a2a0fc0	6a4e67266e5e8d7e0a2a0fbe	IN	10.000000	0.000000000000	\N	ADJUST	ADJ-WIDG-1	2026-07-08 15:08:55.769+00	2026-07-08 15:08:55.77+00	2026-07-08 15:08:55.77+00
6a4e680e6e5e8d7e0a2a0fc5	6a4e67ee6e5e8d7e0a2a0fc1	6a4e67266e5e8d7e0a2a0fbe	IN	5.000000	5000.000000000000	\N	ADJUST	ADJ-34	2026-07-08 15:09:02.146+00	2026-07-08 15:09:02.146+00	2026-07-08 15:09:02.146+00
6a4e68cc6e5e8d7e0a2a0fc8	6a4e67346e5e8d7e0a2a0fc0	6a4e67266e5e8d7e0a2a0fbe	OUT	-1.000000	0.000000000000	\N	SALE	SALE-2026-000001	2026-07-08 15:12:12.636+00	2026-07-08 15:12:12.649+00	2026-07-08 15:12:12.649+00
6a4e7a876fc288d787353178	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	IN	20.000000	5000.000000000000	\N	ADJUST	ADJ-WIDG-2	2026-07-08 16:27:51.292+00	2026-07-08 16:27:51.294+00	2026-07-08 16:27:51.294+00
6a4e7a8c6fc288d78735317b	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	IN	39.000000	11000.000000000000	\N	ADJUST	ADJ-WIDG-1	2026-07-08 16:27:56.952+00	2026-07-08 16:27:56.953+00	2026-07-08 16:27:56.953+00
6a4e7b086fc288d78735317e	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	OUT	-3.000000	11000.000000000000	\N	SALE	SALE-2026-000002	2026-07-08 16:30:00.785+00	2026-07-08 16:30:00.789+00	2026-07-08 16:30:00.789+00
6a553dffc4f8d4452fc826c1	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	IN	1.000000	5000.000000000000	\N	PURCHASE	GP-2026-0001	2026-07-13 00:00:00+00	2026-07-13 19:35:27.642+00	2026-07-13 19:35:27.642+00
6a55410ebf73d60a6af90833	6a554104bf73d60a6af90831	6a4e684b6e5e8d7e0a2a0fc7	IN	25.000000	20000.000000000000	\N	ADJUST	ADJ-BRU-01	2026-07-13 19:48:30.245+00	2026-07-13 19:48:30.247+00	2026-07-13 19:48:30.247+00
6a554138bf73d60a6af90835	6a554104bf73d60a6af90831	6a4e684b6e5e8d7e0a2a0fc7	OUT	-1.000000	20000.000000000000	\N	SALE	SALE-2026-000003	2026-07-13 19:49:12.551+00	2026-07-13 19:49:12.559+00	2026-07-13 19:49:12.559+00
6a55458fee8b6673f0ca9c75	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	OUT	-15.000000	11000.000000000000	\N	SALE	SALE-2026-000004	2026-07-13 20:07:43.372+00	2026-07-13 20:07:43.393+00	2026-07-13 20:07:43.393+00
6a5546289ceacea058c4fd09	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	IN	20.000000	10950.000000000000	\N	PURCHASE	GP-2026-0002	2026-07-13 00:00:00+00	2026-07-13 20:10:16.652+00	2026-07-13 20:10:16.652+00
6a5546aec93cb08e85ab7189	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	OUT	-16.000000	10976.000000000000	\N	SALE	SALE-2026-000005	2026-07-13 20:12:30.97+00	2026-07-13 20:12:30.981+00	2026-07-13 20:12:30.981+00
6a563f9071d3685f0b3a99bd	6a554104bf73d60a6af90831	6a4e684b6e5e8d7e0a2a0fc7	OUT	-5.000000	20000.000000000000	100000	SALE	SALE-2026-000006	2026-07-14 13:54:24.189+00	2026-07-14 13:54:24.204+00	2026-07-14 13:54:24.204+00
6a56462371d3685f0b3a99c1	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	OUT	-11.000000	5000.000000000000	55000	SALE	SALE-2026-000007	2026-07-14 14:22:27.169+00	2026-07-14 14:22:27.172+00	2026-07-14 14:22:27.172+00
6a56491b36f9bfc9440cac01	6a4e67346e5e8d7e0a2a0fc0	6a4e684b6e5e8d7e0a2a0fc7	OUT	-5.000000	10976.000000000000	54880	SALE	SALE-2026-000008	2026-07-14 14:35:07.922+00	2026-07-14 14:35:07.935+00	2026-07-14 14:35:07.935+00
6a56491b36f9bfc9440cac02	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	OUT	-4.000000	5000.000000000000	20000	SALE	SALE-2026-000008	2026-07-14 14:35:07.922+00	2026-07-14 14:35:07.941+00	2026-07-14 14:35:07.941+00
6a565add8dfbd616ff814bfb	6a565ac98dfbd616ff814bf9	6a4e684b6e5e8d7e0a2a0fc7	IN	10.000000	90000.000000000000	900000	ADJUST	ADJ-SRT-06	2026-07-14 15:50:53.525+00	2026-07-14 15:50:53.526+00	2026-07-14 15:50:53.526+00
6a565b368dfbd616ff814bff	6a565b1b8dfbd616ff814bfd	6a4e67266e5e8d7e0a2a0fbe	IN	100.000000	50000.000000000000	5000000	ADJUST	ADJ-FAN-09	2026-07-14 15:52:22.032+00	2026-07-14 15:52:22.033+00	2026-07-14 15:52:22.033+00
6a56778b4dc5ee3ab36a4849	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	IN	23.000000	1000.000000000000	23000	ADJUST	ADJ-BEL-09	2026-07-14 17:53:15.605+00	2026-07-14 17:53:15.606+00	2026-07-14 17:53:15.606+00
6a5677944dc5ee3ab36a484b	6a565ac98dfbd616ff814bf9	6a4e684b6e5e8d7e0a2a0fc7	IN	10.000000	90000.000000000000	900000	ADJUST	ADJ-SRT-06	2026-07-14 17:53:24.913+00	2026-07-14 17:53:24.914+00	2026-07-14 17:53:24.914+00
6a56779b4dc5ee3ab36a484d	6a554104bf73d60a6af90831	6a4e684b6e5e8d7e0a2a0fc7	IN	10.000000	20000.000000000000	200000	ADJUST	ADJ-BRU-01	2026-07-14 17:53:31.257+00	2026-07-14 17:53:31.257+00	2026-07-14 17:53:31.257+00
6a5677a34dc5ee3ab36a484f	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	IN	30.000000	5000.000000000000	150000	ADJUST	ADJ-WIDG-2	2026-07-14 17:53:39.975+00	2026-07-14 17:53:39.975+00	2026-07-14 17:53:39.975+00
6a5678084dc5ee3ab36a4853	6a5678004dc5ee3ab36a4851	6a565b598dfbd616ff814c01	IN	40.000000	7000.000000000000	280000	ADJUST	ADJ-SPO-00	2026-07-14 17:55:20.857+00	2026-07-14 17:55:20.857+00	2026-07-14 17:55:20.857+00
6a5678284dc5ee3ab36a4855	6a565b1b8dfbd616ff814bfd	6a4e67266e5e8d7e0a2a0fbe	IN	1.000000	50000.000000000000	50000	ADJUST	ADJ-FAN-09	2026-07-14 17:55:52.26+00	2026-07-14 17:55:52.26+00	2026-07-14 17:55:52.26+00
6a56782d4dc5ee3ab36a4857	6a4e67ee6e5e8d7e0a2a0fc1	6a4e67266e5e8d7e0a2a0fbe	IN	1.000000	5000.000000000000	5000	ADJUST	ADJ-WIDG-2	2026-07-14 17:55:57.59+00	2026-07-14 17:55:57.591+00	2026-07-14 17:55:57.591+00
6a5678334dc5ee3ab36a4859	6a4e67ee6e5e8d7e0a2a0fc1	6a4e67266e5e8d7e0a2a0fbe	IN	10.000000	5000.000000000000	50000	ADJUST	ADJ-WIDG-2	2026-07-14 17:56:03.879+00	2026-07-14 17:56:03.88+00	2026-07-14 17:56:03.88+00
6a567a1b4dc5ee3ab36a485d	6a565b1b8dfbd616ff814bfd	6a565b598dfbd616ff814c01	IN	26.000000	48076.923076923080	1250000	PURCHASE	GP-2026-0003	2026-07-14 00:00:00+00	2026-07-14 18:04:11.114+00	2026-07-14 18:04:11.114+00
6a567c423212c0410ef0f39d	6a5678004dc5ee3ab36a4851	6a565b598dfbd616ff814c01	OUT	-6.000000	7000.000000000000	42000	SALE	SALE-2026-000009	2026-07-14 18:13:22.227+00	2026-07-14 18:13:22.243+00	2026-07-14 18:13:22.243+00
6a567e169fd4e9d5e315526a	6a565b1b8dfbd616ff814bfd	6a565b598dfbd616ff814c01	OUT	-22.000000	48076.923076923080	1057692	SALE	SALE-2026-000010	2026-07-14 18:21:10.785+00	2026-07-14 18:21:10.797+00	2026-07-14 18:21:10.797+00
6a567fcb9fd4e9d5e3155271	6a565b1b8dfbd616ff814bfd	6a4e684b6e5e8d7e0a2a0fc7	IN	12.000000	49504.916666666664	594059	PURCHASE	GP-2026-0004	2026-07-14 00:00:00+00	2026-07-14 18:28:27.975+00	2026-07-14 18:28:27.975+00
6a567fcb9fd4e9d5e3155272	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	IN	6.000000	990.166666666667	5941	PURCHASE	GP-2026-0004	2026-07-14 00:00:00+00	2026-07-14 18:28:27.982+00	2026-07-14 18:28:27.982+00
6a567fff9fd4e9d5e3155274	6a565b1b8dfbd616ff814bfd	6a4e684b6e5e8d7e0a2a0fc7	OUT	-12.000000	49504.916666666664	594059	SALE	SALE-2026-000011	2026-07-14 18:29:19.826+00	2026-07-14 18:29:19.83+00	2026-07-14 18:29:19.83+00
6a56800a9fd4e9d5e3155278	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	OUT	-10.000000	997.965517241379	9980	SALE	SALE-2026-000012	2026-07-14 18:29:30.991+00	2026-07-14 18:29:30.997+00	2026-07-14 18:29:30.997+00
6a5686c91cd5a63ac9e284d7	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	IN	19.000000	894.736842105263	17000	PURCHASE	GP-2026-0005	2026-07-14 00:00:00+00	2026-07-14 18:58:17.994+00	2026-07-14 18:58:17.994+00
6a57a5b94a7dc6a746198bec	6a56529a429c2175f39287e1	6a4e67266e5e8d7e0a2a0fbe	IN	12.000000	320000.000000000000	3840000	PURCHASE	GP-2026-0006	2026-07-15 00:00:00+00	2026-07-15 15:22:33.654+00	2026-07-15 15:22:33.654+00
6a57d5cbf92ac615e2cd5ac4	6a565b1b8dfbd616ff814bfd	6a4e67266e5e8d7e0a2a0fbe	OUT	-15.000000	50000.000000000000	750000	SALE	SALE-2026-000013	2026-07-15 18:47:39.791+00	2026-07-15 18:47:39.806+00	2026-07-15 18:47:39.806+00
6a58dd058fdd14dc84642e4c	6a4e67ee6e5e8d7e0a2a0fc1	6a4e67266e5e8d7e0a2a0fbe	OUT	-1.000000	5000.000000000000	5000	SALE	SALE-2026-000014	2026-07-16 13:30:45.78+00	2026-07-16 13:30:45.808+00	2026-07-16 13:30:45.808+00
6a58e73215aa924adbc2e30e	6a4e67346e5e8d7e0a2a0fc0	6a4e67266e5e8d7e0a2a0fbe	OUT	-1.000000	0.000000000000	0	SALE	SALE-2026-000015	2026-07-16 14:14:10.608+00	2026-07-16 14:14:10.616+00	2026-07-16 14:14:10.616+00
6a59082fa202fa135946daac	6a565b1b8dfbd616ff814bfd	6a565b598dfbd616ff814c01	OUT	-2.000000	48076.923076923080	96154	SALE	SALE-2026-000016	2026-07-16 16:34:55.458+00	2026-07-16 16:34:55.464+00	2026-07-16 16:34:55.464+00
6a5f7ecf6bbcd50759eeff77	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	OUT	-1.000000	946.342105263158	946	SALE	SALE-2026-000017	2026-07-21 14:14:39.287+00	2026-07-21 14:14:39.303+00	2026-07-21 14:14:39.303+00
6a60d7af3e048b5f9508fa9b	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	OUT	-1.000000	946.342105263158	947	SALE	SALE-2026-000018	2026-07-22 14:46:07.119+00	2026-07-22 14:46:07.139+00	2026-07-22 14:46:07.139+00
6a60d7af3e048b5f9508fa9c	6a4e67ee6e5e8d7e0a2a0fc1	6a4e684b6e5e8d7e0a2a0fc7	OUT	-1.000000	5000.000000000000	5000	SALE	SALE-2026-000018	2026-07-22 14:46:07.119+00	2026-07-22 14:46:07.148+00	2026-07-22 14:46:07.148+00
6a60d8523e048b5f9508faa3	6a565ac98dfbd616ff814bf9	6a565b598dfbd616ff814c01	IN	7.000000	90000.000000000000	630000	PURCHASE	GP-2026-0007	2026-07-22 00:00:00+00	2026-07-22 14:48:50.701+00	2026-07-22 14:48:50.701+00
6a60da763e048b5f9508faa5	6a565ac98dfbd616ff814bf9	6a565b598dfbd616ff814c01	OUT	-1.000000	90000.000000000000	90000	SALE	SALE-2026-000019	2026-07-22 14:57:58.669+00	2026-07-22 14:57:58.672+00	2026-07-22 14:57:58.672+00
6a60da833e048b5f9508faab	6a565b1b8dfbd616ff814bfd	6a565b598dfbd616ff814c01	IN	1.000000	50000.000000000000	50000	PURCHASE	GP-2026-0008	2026-07-22 00:00:00+00	2026-07-22 14:58:11.291+00	2026-07-22 14:58:11.291+00
6a61062ba55836126d577aaf	6a5677374dc5ee3ab36a4847	6a4e684b6e5e8d7e0a2a0fc7	IN	40.000000	1000.000000000000	40000	PURCHASE	GP-2026-0009	2026-07-22 00:00:00+00	2026-07-22 18:04:27.509+00	2026-07-22 18:04:27.509+00
\.


--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.units (id, name, abbreviation, is_active, created_at, updated_at) FROM stdin;
6a568413c6607986e7b27b60	Piece	pcs	t	2026-07-14 18:46:43.93+00	2026-07-14 18:46:43.93+00
6a57d58ff92ac615e2cd5ac3	Kilogram	kg	t	2026-07-15 18:46:39.267+00	2026-07-15 18:46:39.267+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.users (id, name, email, password, role, is_active, password_reset_token, password_reset_expires, password_changed_at, created_at, updated_at) FROM stdin;
6a3a7edae43b8c400ca0b630	Super Admin	superadmin@devinception.com	$2b$10$e.YT9juiP5sSdFROU0o1m.FkxfLH5HSgFszcY9KYb.0SIdgq1kCsq	super_admin	t	e336179f20440eb4cc4c8fa59ef153e99d875951fd3a6eafbbe2ff59015ea9ea	2026-06-23 16:37:59.542+00	\N	2026-06-23 12:40:58.375+00	2026-06-23 16:22:59.543+00
6a3aa28351e535cde83814dc	New Manager	manager1@example.com	$2b$10$gq/PgKy5bf7apiEo8szxueZwPnS20NeCyPIRMvQQxM9HgUfbRCJTi	manager	t	\N	\N	\N	2026-06-23 15:13:07.452+00	2026-06-23 15:20:09.869+00
6a3aa32751e535cde83814dd	Mark Manager	mark@devinception.com	$2b$10$aiM05FoY46YRDuqeKPYFJeqWK881tYV98MBs5a6V5v9x.QkGLxgW2	manager	t	\N	\N	\N	2026-06-23 15:15:51.789+00	2026-06-23 15:21:03.577+00
6a3ab2e3bcbef2e0992b57c1	New Cashier	cashier_new@example.com	$2b$10$FaUOFqnUIY4ofnV.017F6.44c1M2e/NLxn0zNVKBt0B1eSvh0v232	cashier	t	\N	\N	\N	2026-06-23 16:22:59.71+00	2026-06-23 16:22:59.71+00
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.vendors (id, name, phone, email, ntn, address, outstanding, created_at, updated_at) FROM stdin;
6a4e67026e5e8d7e0a2a0fbc	Acme Distributors	+92 321 0000000	acme@supplier.com	1234567-8	Hall Road, Lahore	0	2026-07-08 15:04:34.012+00	2026-07-08 15:04:34.012+00
\.


--
-- Data for Name: warehouses; Type: TABLE DATA; Schema: public; Owner: devinception
--

COPY public.warehouses (id, name, location, address, is_default, is_active, created_at, updated_at) FROM stdin;
6a4e67266e5e8d7e0a2a0fbe	Warehouse B	Downtown	string	t	t	2026-07-08 15:05:10.936+00	2026-07-08 15:10:40.638+00
6a4e684b6e5e8d7e0a2a0fc7	Warehouse	DHA		f	t	2026-07-08 15:10:03.877+00	2026-07-08 15:10:40.637+00
6a565b598dfbd616ff814c01	Warehouse C	London		f	t	2026-07-14 15:52:57.511+00	2026-07-14 15:52:57.511+00
\.


--
-- Name: gate_pass_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: devinception
--

SELECT pg_catalog.setval('public.gate_pass_items_id_seq', 18, true);


--
-- Name: goods_purchase_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: devinception
--

SELECT pg_catalog.setval('public.goods_purchase_items_id_seq', 10, true);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: devinception
--

SELECT pg_catalog.setval('public.invoice_items_id_seq', 10, true);


--
-- Name: journal_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: devinception
--

SELECT pg_catalog.setval('public.journal_lines_id_seq', 131, true);


--
-- Name: sale_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: devinception
--

SELECT pg_catalog.setval('public.sale_items_id_seq', 21, true);


--
-- Name: sale_labour_id_seq; Type: SEQUENCE SET; Schema: public; Owner: devinception
--

SELECT pg_catalog.setval('public.sale_labour_id_seq', 1, false);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: counters counters_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.counters
    ADD CONSTRAINT counters_pkey PRIMARY KEY (key, scope);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: gate_pass_items gate_pass_items_gate_pass_id_position_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_pass_items
    ADD CONSTRAINT gate_pass_items_gate_pass_id_position_key UNIQUE (gate_pass_id, "position");


--
-- Name: gate_pass_items gate_pass_items_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_pass_items
    ADD CONSTRAINT gate_pass_items_pkey PRIMARY KEY (id);


--
-- Name: gate_passes gate_passes_number_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_number_key UNIQUE (number);


--
-- Name: gate_passes gate_passes_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_pkey PRIMARY KEY (id);


--
-- Name: gate_passes gate_passes_purchase_id_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_purchase_id_key UNIQUE (purchase_id);


--
-- Name: gate_passes gate_passes_sale_id_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_sale_id_key UNIQUE (sale_id);


--
-- Name: gate_passes gate_passes_token_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_token_key UNIQUE (token);


--
-- Name: goods_purchase_items goods_purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchase_items
    ADD CONSTRAINT goods_purchase_items_pkey PRIMARY KEY (id);


--
-- Name: goods_purchase_items goods_purchase_items_purchase_id_position_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchase_items
    ADD CONSTRAINT goods_purchase_items_purchase_id_position_key UNIQUE (purchase_id, "position");


--
-- Name: goods_purchases goods_purchases_gate_pass_id_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_gate_pass_id_key UNIQUE (gate_pass_id);


--
-- Name: goods_purchases goods_purchases_number_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_number_key UNIQUE (number);


--
-- Name: goods_purchases goods_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_invoice_id_position_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_position_key UNIQUE (invoice_id, "position");


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_number_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_number_key UNIQUE (number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_purchase_id_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_purchase_id_key UNIQUE (purchase_id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_journal_entry_id_position_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_position_key UNIQUE (journal_entry_id, "position");


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: labour labour_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.labour
    ADD CONSTRAINT labour_phone_number_key UNIQUE (phone_number);


--
-- Name: labour labour_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.labour
    ADD CONSTRAINT labour_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_sale_id_position_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_position_key UNIQUE (sale_id, "position");


--
-- Name: sale_labour sale_labour_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_labour
    ADD CONSTRAINT sale_labour_pkey PRIMARY KEY (id);


--
-- Name: sale_labour sale_labour_sale_id_position_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_labour
    ADD CONSTRAINT sale_labour_sale_id_position_key UNIQUE (sale_id, "position");


--
-- Name: sales sales_gate_pass_id_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_gate_pass_id_key UNIQUE (gate_pass_id);


--
-- Name: sales sales_number_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_number_key UNIQUE (number);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: settings settings_key_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_key UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: stock_levels stock_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_pkey PRIMARY KEY (id);


--
-- Name: stock_levels stock_levels_product_id_warehouse_id_key; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_product_id_warehouse_id_key UNIQUE (product_id, warehouse_id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts_name_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX bank_accounts_name_idx ON public.bank_accounts USING btree (name);


--
-- Name: brands_name_ci_unique; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX brands_name_ci_unique ON public.brands USING btree (lower((name)::text));


--
-- Name: categories_name_ci_unique; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX categories_name_ci_unique ON public.categories USING btree (lower((name)::text));


--
-- Name: customers_name_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX customers_name_idx ON public.customers USING btree (name);


--
-- Name: gate_passes_status_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX gate_passes_status_idx ON public.gate_passes USING btree (status);


--
-- Name: gate_passes_warehouse_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX gate_passes_warehouse_idx ON public.gate_passes USING btree (warehouse_id);


--
-- Name: goods_purchases_vendor_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX goods_purchases_vendor_idx ON public.goods_purchases USING btree (vendor_id);


--
-- Name: goods_purchases_warehouse_date_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX goods_purchases_warehouse_date_idx ON public.goods_purchases USING btree (warehouse_id, date);


--
-- Name: invoices_date_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX invoices_date_idx ON public.invoices USING btree (date);


--
-- Name: invoices_vendor_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX invoices_vendor_idx ON public.invoices USING btree (vendor_id);


--
-- Name: journal_entries_date_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX journal_entries_date_idx ON public.journal_entries USING btree (date);


--
-- Name: journal_entries_ref_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX journal_entries_ref_idx ON public.journal_entries USING btree (ref_type, ref_id);


--
-- Name: journal_entries_ref_no_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX journal_entries_ref_no_idx ON public.journal_entries USING btree (ref_no);


--
-- Name: journal_lines_account_ref_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX journal_lines_account_ref_idx ON public.journal_lines USING btree (account, ref_id);


--
-- Name: products_name_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX products_name_idx ON public.products USING btree (name);


--
-- Name: products_sku_unique; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX products_sku_unique ON public.products USING btree (sku) WHERE ((sku)::text <> ''::text);


--
-- Name: products_warehouse_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX products_warehouse_idx ON public.products USING btree (warehouse_id);


--
-- Name: roles_name_ci_unique; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX roles_name_ci_unique ON public.roles USING btree (lower((name)::text));


--
-- Name: sales_customer_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX sales_customer_idx ON public.sales USING btree (customer_id);


--
-- Name: sales_warehouse_date_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX sales_warehouse_date_idx ON public.sales USING btree (warehouse_id, date);


--
-- Name: stock_movements_product_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX stock_movements_product_idx ON public.stock_movements USING btree (product_id);


--
-- Name: stock_movements_warehouse_date_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX stock_movements_warehouse_date_idx ON public.stock_movements USING btree (warehouse_id, date);


--
-- Name: units_name_ci_unique; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX units_name_ci_unique ON public.units USING btree (lower((name)::text));


--
-- Name: users_email_ci_unique; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX users_email_ci_unique ON public.users USING btree (lower((email)::text));


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: vendors_name_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX vendors_name_idx ON public.vendors USING btree (name);


--
-- Name: warehouses_name_idx; Type: INDEX; Schema: public; Owner: devinception
--

CREATE INDEX warehouses_name_idx ON public.warehouses USING btree (name);


--
-- Name: warehouses_single_default; Type: INDEX; Schema: public; Owner: devinception
--

CREATE UNIQUE INDEX warehouses_single_default ON public.warehouses USING btree (is_default) WHERE (is_default = true);


--
-- Name: journal_lines journal_lines_balanced; Type: TRIGGER; Schema: public; Owner: devinception
--

CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR DELETE OR UPDATE ON public.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_balanced_journal_entry();


--
-- Name: gate_pass_items gate_pass_items_gate_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_pass_items
    ADD CONSTRAINT gate_pass_items_gate_pass_id_fkey FOREIGN KEY (gate_pass_id) REFERENCES public.gate_passes(id) ON DELETE CASCADE;


--
-- Name: gate_pass_items gate_pass_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_pass_items
    ADD CONSTRAINT gate_pass_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: gate_passes gate_passes_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gate_passes gate_passes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: gate_passes gate_passes_last_edited_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_last_edited_by_id_fkey FOREIGN KEY (last_edited_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gate_passes gate_passes_processed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_processed_by_id_fkey FOREIGN KEY (processed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gate_passes gate_passes_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.goods_purchases(id) ON DELETE RESTRICT;


--
-- Name: gate_passes gate_passes_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;


--
-- Name: gate_passes gate_passes_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


--
-- Name: gate_passes gate_passes_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.gate_passes
    ADD CONSTRAINT gate_passes_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: goods_purchase_items goods_purchase_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchase_items
    ADD CONSTRAINT goods_purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: goods_purchase_items goods_purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchase_items
    ADD CONSTRAINT goods_purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.goods_purchases(id) ON DELETE CASCADE;


--
-- Name: goods_purchases goods_purchases_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;


--
-- Name: goods_purchases goods_purchases_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: goods_purchases goods_purchases_gate_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_gate_pass_id_fkey FOREIGN KEY (gate_pass_id) REFERENCES public.gate_passes(id) ON DELETE SET NULL;


--
-- Name: goods_purchases goods_purchases_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;


--
-- Name: goods_purchases goods_purchases_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.goods_purchases
    ADD CONSTRAINT goods_purchases_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_gate_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_gate_pass_id_fkey FOREIGN KEY (gate_pass_id) REFERENCES public.gate_passes(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.goods_purchases(id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;


--
-- Name: invoices invoices_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: journal_entries journal_entries_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: products products_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_labour sale_labour_labour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_labour
    ADD CONSTRAINT sale_labour_labour_id_fkey FOREIGN KEY (labour_id) REFERENCES public.labour(id) ON DELETE RESTRICT;


--
-- Name: sale_labour sale_labour_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sale_labour
    ADD CONSTRAINT sale_labour_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sales sales_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE SET NULL;


--
-- Name: sales sales_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales sales_gate_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_gate_pass_id_fkey FOREIGN KEY (gate_pass_id) REFERENCES public.gate_passes(id) ON DELETE SET NULL;


--
-- Name: sales sales_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: stock_levels stock_levels_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_levels stock_levels_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_levels
    ADD CONSTRAINT stock_levels_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;


--
-- Name: users users_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: devinception
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES public.roles(name) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

