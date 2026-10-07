import type { EntryRow } from './types'

// 滤池反冲洗规则表：强度分档、历时上限都集中在这里，页面与服务共用这一份。
// 强度单位 L/(s·m²)，历时单位 min，运行水头损失单位 m。

export type IntensityTier = {
  material: string
  intensityMin: number
  intensityMax: number
  durationMin: number
  durationMax: number
  headLossMax: number
  note: string
}

// 反冲洗强度按滤料类型分档；滤料换过之后，登记单上的分档表跟着这里改。
export const FILTER_MEDIA: string[] = ['石英砂滤料', '无烟煤滤料', '双层滤料', '均质粗砂滤料']

export const INTENSITY_TIERS: IntensityTier[] = [
  {
    material: '石英砂滤料',
    intensityMin: 12,
    intensityMax: 15,
    durationMin: 5,
    durationMax: 10,
    headLossMax: 2.5,
    note: '单层细砂，气水混冲后表面扫洗',
  },
  {
    material: '无烟煤滤料',
    intensityMin: 10,
    intensityMax: 13,
    durationMin: 6,
    durationMax: 12,
    headLossMax: 2.0,
    note: '煤质较轻，强度取低档，防止跑煤',
  },
  {
    material: '双层滤料',
    intensityMin: 13,
    intensityMax: 16,
    durationMin: 6,
    durationMax: 10,
    headLossMax: 2.5,
    note: '无烟煤+石英砂，注意分层界面',
  },
  {
    material: '均质粗砂滤料',
    intensityMin: 15,
    intensityMax: 18,
    durationMin: 8,
    durationMax: 12,
    headLossMax: 3.0,
    note: '粗砂均质层，可取高档强度',
  },
]

// 规则规定的反冲洗历时绝对上限，任何滤料都不允许超过。
export const DURATION_HARD_MAX = 15

export function tierOf(material: string): IntensityTier | undefined {
  const trimmed = material.trim()
  return INTENSITY_TIERS.find((tier) => tier.material === trimmed)
}

// 提交反冲前必须落字的栏目：滤料类型、反冲洗强度是明确点名的两项，
// 其余关键运行参数一并管住，杜绝半张单子交上来。
export const FILTER_REQUIRED_FIELDS: string[] = [
  '滤池编号',
  '滤料类型',
  '反冲洗强度',
  '反冲洗历时',
  '运行水头损失',
  '操作人员',
  '反冲洗时间',
]

export const FILTER_UNIQUE_FIELDS: string[] = ['滤池编号']

// 走数字校验的栏目，登记时统一收成数值，避免列表里字符串、数字混排。
export const FILTER_NUMERIC_FIELDS: string[] = ['运行水头损失', '反冲洗强度', '反冲洗历时']

export type DraftValues = Record<string, string>

export type FieldIssue = { field: string; message: string }

export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === ''
}

function toNumber(value: string): number {
  return Number(String(value).trim())
}

function durationRangeMessage(duration: number, tier: IntensityTier): string {
  return `${duration}min 不在${tier.material}允许历时区间 ${tier.durationMin}~${tier.durationMax}min 内`
}

// 校验一张反冲洗单：返回每条问题（含字段名），空数组表示可以收下。
export function validateFilterDraft(draft: DraftValues): FieldIssue[] {
  const issues: FieldIssue[] = []

  for (const field of FILTER_REQUIRED_FIELDS) {
    if (isBlank(draft[field])) {
      issues.push({ field, message: `${field}未填写` })
    }
  }
  if (issues.length > 0) {
    // 先把缺项报全，数字类的区间校验等补上以后再看，避免一次只报一个错。
    return issues
  }

  const tier = tierOf(draft['滤料类型'])
  if (!tier) {
    issues.push({
      field: '滤料类型',
      message: `滤料类型「${draft['滤料类型'].trim()}」不在分档表内，请先在分档表登记`,
    })
    return issues
  }

  const headLoss = toNumber(draft['运行水头损失'])
  const intensity = toNumber(draft['反冲洗强度'])
  const duration = toNumber(draft['反冲洗历时'])

  if (Number.isNaN(headLoss) || headLoss <= 0) {
    issues.push({ field: '运行水头损失', message: '运行水头损失应为大于 0 的数字（m）' })
  } else if (headLoss > tier.headLossMax) {
    issues.push({
      field: '运行水头损失',
      message: `运行水头损失 ${headLoss}m 超过${tier.material}允许值 ${tier.headLossMax}m，应先安排反冲`,
    })
  }

  if (Number.isNaN(intensity) || intensity <= 0) {
    issues.push({ field: '反冲洗强度', message: '反冲洗强度应为大于 0 的数字' })
  } else if (intensity < tier.intensityMin || intensity > tier.intensityMax) {
    issues.push({
      field: '反冲洗强度',
      message: `反冲洗强度 ${intensity} 不在${tier.material}分档区间 ${tier.intensityMin}~${tier.intensityMax} L/(s·m²) 内`,
    })
  }

  if (Number.isNaN(duration) || duration <= 0) {
    issues.push({ field: '反冲洗历时', message: '反冲洗历时应为大于 0 的数字（min）' })
  } else if (duration > DURATION_HARD_MAX) {
    issues.push({
      field: '反冲洗历时',
      message: `${durationRangeMessage(duration, tier)}，且超过规则上限 ${DURATION_HARD_MAX}min，按非法值扣下`,
    })
  } else if (duration < tier.durationMin || duration > tier.durationMax) {
    issues.push({
      field: '反冲洗历时',
      message: `${durationRangeMessage(duration, tier)}，按非法值扣下`,
    })
  }

  return issues
}

// 同一条滤池编号不许重复登记（编号统一转大写比较，空格、大小写差异不算新编号）。
export function findDuplicateFilterNo(
  rows: EntryRow[],
  filterNo: string,
  excludeId?: number,
): EntryRow | undefined {
  const target = normalizeFilterNo(filterNo)
  return rows.find(
    (row) =>
      normalizeFilterNo(String(row['滤池编号'] ?? '')) === target &&
      (excludeId === undefined || Number(row.id) !== excludeId),
  )
}

export function normalizeFilterNo(value: string): string {
  return value.trim().toUpperCase()
}

// 单据背面印刷内容：进水阀与排空阀的开关先后顺序，顺序错了会跑砂、水锤。
export const VALVE_SEQUENCE: string[] = [
  '1. 关闭进水阀，停止进水；',
  '2. 关闭出水（清水）阀，滤池退出运行；',
  '3. 开启排气阀后，再开启排空阀（排水阀）放水，严禁先开排空阀；',
  '4. 水位降至排水槽后开启反冲洗进水阀，先气洗、后水洗，按分档强度冲洗；',
  '5. 冲洗结束先关闭反冲洗进水阀，再关闭排空阀；',
  '6. 最后开启进水阀慢速充水静置，待滤层沉降合格后再开出水阀恢复供水。',
]

export const VALVE_SEQUENCE_NOTE = '口诀：进水阀先关、排空阀后开；冲洗阀先关、排空阀后关，再开进水阀。'
