export const DATA_CHANGED = 'semester-desk:data-changed'

export function publishChange(table: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: table }))
}
