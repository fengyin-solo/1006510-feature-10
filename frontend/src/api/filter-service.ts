import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, PageResult } from '@/data/types'
import { filterRows } from './local-service'
import {
  BACKWASH_DURATION_UNIT,
  FILTER_FIELDS,
  FILTER_KEY,
  INTENSITY_UNIT,
  type FilterDraft,
  findBand,
  inMonth,
  loadIntensityBands,
  saveIntensityBands,
  type IntensityBand,
  validateFilterDraft,
} from '@/data/filter-rules'

export type FilterPageResult = PageResult & {
  month: string | null
}

export type CreateFilterResult = ActionResult & {
  fields?: Partial<Record<string, string>>
  row?: EntryRow
}

// 「取不到数」演练开关：置位后下一次列表读取只失败一次并自动复位，重试即可正常拉取。
let fetchFailPulse = false

export function armNextFetchFailure(): void {
  fetchFailPulse = true
}

export function fetchFilterEntries(
  filters: Record<string, string>,
  month: string | null,
): FilterPageResult {
  if (fetchFailPulse) {
    fetchFailPulse = false
    throw new Error('滤池反冲洗数据暂时取不到，请重试一次')
  }
  const monthFiltered = listRows(FILTER_KEY).filter((row) => inMonth(row, month))
  const matched = filterRows(monthFiltered, filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length, month }
}

export function getFilterEntry(id: number): EntryRow | null {
  return listRows(FILTER_KEY).find((row) => Number(row.id) === id) ?? null
}

// 登记滤池反冲洗单据：缺必填项或非法值时整单扣住，不写入清单；只有全部规则通过才落库。
export function createFilterEntry(draft: FilterDraft): CreateFilterResult {
  const bands = loadIntensityBands()
  const rows = listRows(FILTER_KEY)
  const result = validateFilterDraft(draft, rows, bands)
  if (!result.ok) {
    return {
      ok: false,
      message: `单据已扣住，未放行登记：${result.messages.join('；')}`,
      fields: result.fields,
    }
  }

  const band = findBand(bands, draft.滤料类型.trim())!
  const time = draft.反冲洗时间.trim()
  const headLoss = draft.运行水头损失.trim()
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1

  const row: EntryRow = {
    id: nextId,
    status: '待反冲',
    pending: true,
    abnormal: false,
    [FILTER_FIELDS.code]: draft.滤池编号.trim(),
    [FILTER_FIELDS.media]: draft.滤料类型.trim(),
    [FILTER_FIELDS.headLoss]: headLoss,
    [FILTER_FIELDS.intensity]: result.intensity as number,
    [FILTER_FIELDS.duration]: result.duration as number,
    [FILTER_FIELDS.operator]: draft.操作人员.trim(),
    [FILTER_FIELDS.time]: time,
    [FILTER_FIELDS.state]: '待反冲',
    分档区间: `${band.min}~${band.max} ${band.unit}`,
    分档表更新: band.updatedAt,
    历时单位: BACKWASH_DURATION_UNIT,
    强度单位: INTENSITY_UNIT,
  }

  saveRows(FILTER_KEY, [row, ...rows])
  return { ok: true, message: `滤池反冲洗单据已登记，单号 ${nextId}，当前状态「待反冲」`, row }
}

export function listFilterBands(): IntensityBand[] {
  return loadIntensityBands()
}

export type BandDraft = { media: string; min: string; max: string }

export type BandSaveResult = ActionResult & { bands?: IntensityBand[] }

// 滤料换过之后调整分档表：档位必须是正数且下限不高于上限，改完统一盖更新时间。
export function updateFilterBands(rows: BandDraft[]): BandSaveResult {
  const seen = new Set<string>()
  const normalized: Array<Pick<IntensityBand, 'media' | 'min' | 'max'>> = []
  for (const row of rows) {
    const media = row.media.trim()
    const min = Number(row.min)
    const max = Number(row.max)
    if (!media) {
      return { ok: false, message: '分档表未保存：存在滤料类型为空的档位行' }
    }
    if (seen.has(media)) {
      return { ok: false, message: `分档表未保存：滤料类型「${media}」重复` }
    }
    seen.add(media)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
      return { ok: false, message: `分档表未保存：「${media}」的档位必须是大于 0 的数字` }
    }
    if (min > max) {
      return { ok: false, message: `分档表未保存：「${media}」的下限不能高于上限` }
    }
    normalized.push({ media, min, max })
  }
  if (normalized.length === 0) {
    return { ok: false, message: '分档表未保存：至少保留一个滤料类型档位' }
  }
  const bands = saveIntensityBands(normalized)
  return { ok: true, message: `反冲洗强度分档表已更新（${bands.length} 个滤料档位）`, bands }
}
