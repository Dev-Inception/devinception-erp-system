import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = 'PKR', maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatQuantity(value: number | string) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(quantity);
}
