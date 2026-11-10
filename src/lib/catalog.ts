export const PAGE_SIZE = 9;

export const PRICE_RANGES: Record<string, { label: string; short: string; min?: number; max?: number }> = {
  "under-500": { label: "Under ৳500", short: "Under ৳500", max: 499 },
  "500-2000": { label: "৳500 – ৳2,000", short: "৳500–2k", min: 500, max: 2000 },
  "2000-10000": { label: "৳2,000 – ৳10,000", short: "৳2k–10k", min: 2001, max: 10000 },
  "over-10000": { label: "৳10,000 and above", short: "৳10k+", min: 10001 },
};

export const SORT_OPTIONS = [
  { id: "featured", label: "Featured" },
  { id: "newest", label: "Newest arrivals" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "rating", label: "Top rated" },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]["id"];

export function isSortId(value: string | undefined): value is SortId {
  return Boolean(value) && SORT_OPTIONS.some((option) => option.id === value);
}
