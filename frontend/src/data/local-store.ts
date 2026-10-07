import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'waterworks-ops:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

// 旧版滤池示例数据是占位文本（如「滤池反冲洗样例1」），既没有真实数值也没有分档字段，
// 会让按月份/分档规则的新页面整月空白。旧版滤池页没有登记入口，存在的只能是旧种子，识别后整体换新示例。
function migrateFilterSeed(stored: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const legacy = stored.filter
  const isLegacySeed =
    Array.isArray(legacy) &&
    legacy.length > 0 &&
    legacy.every((row) => String(row['滤料类型'] ?? '').startsWith('滤池反冲洗样例'))
  if (!isLegacySeed) {
    return stored
  }
  return { ...stored, filter: clone(SEED_ROWS.filter ?? []) }
}

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = migrateFilterSeed(readStorage())
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
