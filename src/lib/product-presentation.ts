/**
 * Seller attestations that are not part of the base product table.
 * Stored as one reserved entry in the existing highlights JSON so preview and
 * production product rows travel together without a schema migration.
 */
export const PRESENTATION_PREFIX = "__product_presentation__:";

export type ProductPresentation = { genuine: boolean };

export const NO_PRESENTATION: ProductPresentation = { genuine: false };

export function readPresentation(highlights: string[] | null | undefined): ProductPresentation {
  const entry = (highlights ?? []).find((value) => typeof value === "string" && value.startsWith(PRESENTATION_PREFIX));
  if (!entry) return { ...NO_PRESENTATION };
  try {
    const parsed = JSON.parse(entry.slice(PRESENTATION_PREFIX.length)) as Partial<ProductPresentation>;
    return { genuine: parsed.genuine === true };
  } catch {
    return { ...NO_PRESENTATION };
  }
}

export function withPresentation(highlights: string[], presentation: ProductPresentation): string[] {
  const clean = highlights.filter((value) => !value.startsWith(PRESENTATION_PREFIX));
  return presentation.genuine ? [...clean, `${PRESENTATION_PREFIX}${JSON.stringify({ genuine: true })}`] : clean;
}
