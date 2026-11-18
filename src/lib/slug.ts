/** Must stay in sync with entitySlug() in scripts/generate-court-pages.mjs */
export function entitySlug(e: { id: number; name: string }): string {
  const name = String(e.name)
    .trim()
    .replace(/[\u064B-\u065F\u0640]/g, '') // harakat + tatweel
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${e.id}-${name}`;
}
