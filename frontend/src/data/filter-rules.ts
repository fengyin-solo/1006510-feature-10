import type { EntryRow } from './types'

// 滤池反冲洗单据的域规则：必填项、反冲洗历时合法区间、按滤料类型分档的反冲洗强度表都集中在这里，
// 页面组件不做业务判断，换规则只改这一份。

export const FILTER_KEY = 'filter'

export const FILTER_FIELDS = {
  code: '滤池编号',
  media: '滤料类型',
  headLoss: '运行水头损失',
  intensity: '反冲洗强度',
  duration: '反冲洗历时',
  operator: '操作人员',
  time: '反冲洗时间',
  state: '滤池状态',
} as const

// 反冲洗历时允许区间（分钟，含边界）：写在区间外的按非法值扣下。
export const BACKWASH_DURATION_MIN = 5
export const BACKWASH_DURATION_MAX = 15
export const BACKWASH_DURATION_UNIT = '分钟'

// 反冲洗强度单位：单水反冲洗，升/(秒·平方米)。
export const INTENSITY_UNIT = 'L/(s·m²)'
export const HEAD_LOSS_UNIT = 'm'

export const MEDIA_TYPES = ['石英砂滤料', '无烟煤滤料', '均质陶粒滤料', '双层煤砂滤料']

// 反冲洗强度按滤料类型分档：换滤料后维护这张表，登记时按所选滤料的档位校验。
export type IntensityBand = {
  media: string
  min: number
  max: number
  unit: string
  updatedAt: string
}

const BANDS_STORAGE_KEY = 'waterworks-ops:filter-bands'
const DEFAULT_UPDATED_AT = '2026-09-01 08:00'

export const DEFAULT_INTENSITY_BANDS: IntensityBand[] = [
  { media: '石英砂滤料', min: 12, max: 15, unit: INTENSITY_UNIT, updatedAt: DEFAULT_UPDATED_AT },
  { media: '无烟煤滤料', min: 10, max: 12, unit: INTENSITY_UNIT, updatedAt: DEFAULT_UPDATED_AT },
  { media: '均质陶粒滤料', min: 15, max: 18, unit: INTENSITY_UNIT, updatedAt: DEFAULT_UPDATED_AT },
  { media: '双层煤砂滤料', min: 13, max: 16, unit: INTENSITY_UNIT, updatedAt: DEFAULT_UPDATED_AT },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeBand(raw: unknown): IntensityBand | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const item = raw as Record<string, unknown>
  const media = String(item.media ?? '').trim()
  const min = Number(item.min)
  const max = Number(item.max)
  if (!media || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min > max) {
    return null
  }
  return {
    media,
    min,
    max,
    unit: String(item.unit ?? INTENSITY_UNIT),
    updatedAt: String(item.updatedAt ?? DEFAULT_UPDATED_AT),
  }
}

// 读取分档表：localStorage 里没有或读不出来时回落到默认档位，不影响登记。
export function loadIntensityBands(): IntensityBand[] {
  const fallback = clone(DEFAULT_INTENSITY_BANDS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(BANDS_STORAGE_KEY)
    if (!raw) {
      return fallback
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallback
    }
    const bands = parsed.map(normalizeBand).filter((item): item is IntensityBand => item !== null)
    return bands.length > 0 ? bands : fallback
  } catch {
    return fallback
  }
}

export function stampNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 保存分档表：滤料换过、档位调整后调用，统一盖上更新时间，登记单上能看到用的是哪一版分档表。
export function saveIntensityBands(rows: Array<Pick<IntensityBand, 'media' | 'min' | 'max'>>): IntensityBand[] {
  const stamp = stampNow()
  const next: IntensityBand[] = rows.map((row) => ({
    media: row.media.trim(),
    min: row.min,
    max: row.max,
    unit: INTENSITY_UNIT,
    updatedAt: stamp,
  }))
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(BANDS_STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

export function findBand(bands: IntensityBand[], media: string): IntensityBand | undefined {
  const target = media.trim()
  return bands.find((band) => band.media === target)
}

export function bandLabel(band: IntensityBand): string {
  return `${band.min}~${band.max} ${band.unit}`
}

export type FilterDraft = {
  滤池编号: string
  滤料类型: string
  运行水头损失: string
  反冲洗强度: string
  反冲洗历时: string
  操作人员: string
  反冲洗时间: string
}

export type FilterFieldKey = '滤池编号' | '滤料类型' | '反冲洗强度' | '反冲洗历时'

export type FieldErrors = Partial<Record<FilterFieldKey, string>>

export type ValidateFilterResult = {
  ok: boolean
  messages: string[]
  fields: FieldErrors
  intensity: number | null
  duration: number | null
}

function toNumber(value: string): number | null {
  const text = value.trim()
  if (text === '') {
    return null
  }
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

// 登记前的单据校验：必填项缺失、编号重复、历时越界、强度不符合滤料分档都在这里给出逐项原因。
export function validateFilterDraft(
  draft: FilterDraft,
  existing: EntryRow[],
  bands: IntensityBand[],
): ValidateFilterResult {
  const messages: string[] = []
  const fields: FieldErrors = {}

  const code = draft.滤池编号.trim()
  if (code === '') {
    fields.滤池编号 = '滤池编号未填写'
    messages.push('滤池编号未填写')
  } else if (existing.some((row) => String(row[FILTER_FIELDS.code] ?? '').trim() === code)) {
    fields.滤池编号 = `滤池编号「${code}」已经登记过`
    messages.push(`滤池编号「${code}」已登记过，同一条滤池编号不许重复登记`)
  }

  const media = draft.滤料类型.trim()
  if (media === '') {
    fields.滤料类型 = '滤料类型未填写'
    messages.push('滤料类型未填写')
  }

  let intensity: number | null = toNumber(draft.反冲洗强度)
  if (draft.反冲洗强度.trim() === '') {
    fields.反冲洗强度 = '反冲洗强度未填写'
    messages.push('反冲洗强度未填写')
    intensity = null
  } else if (intensity === null || intensity <= 0) {
    fields.反冲洗强度 = '反冲洗强度必须是大于 0 的数字'
    messages.push(`反冲洗强度「${draft.反冲洗强度.trim()}」不是合法数字`)
    intensity = null
  } else if (media !== '') {
    const band = findBand(bands, media)
    if (!band) {
      fields.反冲洗强度 = `分档表中没有「${media}」的档位`
      messages.push(`分档表中没有「${media}」的反冲洗强度档位，请先维护分档表`)
      intensity = null
    } else if (intensity < band.min || intensity > band.max) {
      fields.反冲洗强度 = `应在 ${bandLabel(band)} 之间`
      messages.push(
        `反冲洗强度 ${intensity} ${band.unit}不在「${media}」分档区间 ${band.min}~${band.max} ${band.unit}内，请按分档表填写`,
      )
    }
  }

  let duration: number | null = toNumber(draft.反冲洗历时)
  if (draft.反冲洗历时.trim() === '') {
    fields.反冲洗历时 = '反冲洗历时未填写'
    messages.push('反冲洗历时未填写')
    duration = null
  } else if (duration === null || duration <= 0) {
    fields.反冲洗历时 = '反冲洗历时必须是大于 0 的数字'
    messages.push(`反冲洗历时「${draft.反冲洗历时.trim()}」不是合法数字`)
    duration = null
  } else if (duration < BACKWASH_DURATION_MIN || duration > BACKWASH_DURATION_MAX) {
    fields.反冲洗历时 = `应在 ${BACKWASH_DURATION_MIN}~${BACKWASH_DURATION_MAX} ${BACKWASH_DURATION_UNIT}之间`
    messages.push(
      `反冲洗历时 ${duration} ${BACKWASH_DURATION_UNIT}超出规则区间 ${BACKWASH_DURATION_MIN}~${BACKWASH_DURATION_MAX} ${BACKWASH_DURATION_UNIT}，按非法值扣下`,
    )
  }

  return { ok: messages.length === 0, messages, fields, intensity, duration }
}

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentDateTime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 单据按反冲洗时间归属月份，整月筛选时用。
export function rowMonth(row: EntryRow): string {
  return String(row[FILTER_FIELDS.time] ?? '').slice(0, 7)
}

export function inMonth(row: EntryRow, month: string | null): boolean {
  if (!month) {
    return true
  }
  return rowMonth(row) === month
}
