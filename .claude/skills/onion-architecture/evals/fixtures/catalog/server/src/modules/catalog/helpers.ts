import type { CatalogItem } from './types.js';

export function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function toItemDto(item: CatalogItem) {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    price_cents: item.priceCents,
    published: item.published,
  };
}

export function bySearchOrder(ids: string[]) {
  const rank = new Map(ids.map((id, i) => [id, i] as const));
  return (a: { id: string }, b: { id: string }) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
}
