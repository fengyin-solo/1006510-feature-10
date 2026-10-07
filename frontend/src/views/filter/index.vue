<template>
  <section class="page filter-page" data-module="filter">
    <header class="page-head">
      <div>
        <h2>滤池反冲洗管理</h2>
        <p class="page-desc">维护滤池反冲洗记录，围绕滤池编号、滤料类型、运行水头损失、反冲洗强度做登记、筛选与状态流转。单据按滤料分档校验，缺项与超区间一律扣单。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记滤池反冲洗记录</button>
        <button class="btn" type="button" @click="exportRows">导出滤池反冲洗清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload()">
      <label class="filter-item">
        <span>单据月份</span>
        <input v-model="month" type="month" @change="reload()" />
      </label>
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit" :disabled="loading">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-if="loadError" class="error-banner" role="alert">
      <span>{{ loadError }}</span>
      <button class="btn" type="button" :disabled="loading" @click="reload()">重试一次</button>
    </div>

    <div v-else-if="loading && !monthRows.length" class="loading-state">正在拉取滤池反冲洗台账…</div>

    <div v-else-if="!monthRows.length" class="empty-banner">
      <strong>{{ monthLabel }}整月暂无反冲洗单据</strong>
      <span>该月没有任何反冲洗记录，可先登记一条；若数据应已上报，请检查月份选择或点重试。</span>
    </div>

    <div v-else class="table-detail">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="String(row.id)"
            :class="{ selected: selectedId === Number(row.id) }"
            @click="selectRow(Number(row.id))"
          >
            <td v-for="column in columns" :key="column">{{ formatCell(row, column) }}</td>
            <td>
              {{ row.status }}
              <span v-if="row.abnormal" class="abnormal-tag" title="存在退回/异常操作">异常</span>
            </td>
            <td class="row-actions" @click.stop>
              <button class="link" type="button" @click="selectRow(Number(row.id))">查看详情</button>
              <button
                v-for="action in actions"
                :key="action"
                class="link"
                type="button"
                @click="runAction(action, row)"
              >
                {{ action }}
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 2" class="empty-state">
              当前筛选条件下没有匹配的反冲洗单据，请调整检索条件
            </td>
          </tr>
        </tbody>
      </table>

      <aside class="detail-panel">
        <header class="detail-head">
          <h3>单据详情</h3>
          <button v-if="selected" class="btn ghost" type="button" @click="printBill">打印单据（双面）</button>
        </header>

        <p v-if="!selected" class="detail-hint">点击左侧任意一条记录，这里显示完整单据。</p>
        <p v-else-if="selectedMissing" class="detail-hint">该单据已不在当前列表中（可能被筛选过滤或数据已刷新），请重新选择。</p>
        <dl v-else class="detail-list">
          <template v-for="column in columns" :key="column">
            <dt>{{ column }}</dt>
            <dd>{{ formatCell(selected, column) }}</dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ selected.status }}</dd>
        </dl>
      </aside>
    </div>

    <footer class="page-foot">
      <span>
        共 {{ total }} 条滤池反冲洗记录<span v-if="loading">（正在刷新…）</span>
        <button class="link foot-link" type="button" @click="simulateReadFail">演练取数失败</button>
      </span>
      <span v-if="actionMessage" :class="{ 'error-text': actionFailed, 'ok-text': !actionFailed }">
        {{ actionMessage }}
      </span>
    </footer>

    <!-- 登记单弹窗 -->
    <div v-if="formOpen" class="modal-mask" @click.self="closeForm">
      <form class="modal-card" @submit.prevent="submitForm">
        <header class="modal-head">
          <h3>登记滤池反冲洗记录</h3>
          <button class="link" type="button" @click="closeForm">关闭</button>
        </header>

        <div class="form-grid">
          <label class="form-item">
            <span>滤池编号 <em>*</em></span>
            <input v-model="draft['滤池编号']" placeholder="如 FILT-0007" />
          </label>
          <label class="form-item">
            <span>滤料类型 <em>*</em></span>
            <select v-model="draft['滤料类型']">
              <option value="" disabled>请选择滤料类型</option>
              <option v-for="material in FILTER_MEDIA" :key="material" :value="material">{{ material }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>运行水头损失（m） <em>*</em></span>
            <input v-model="draft['运行水头损失']" type="number" step="0.1" min="0" placeholder="如 2.2" />
          </label>
          <label class="form-item">
            <span>反冲洗强度 L/(s·m²) <em>*</em></span>
            <input v-model="draft['反冲洗强度']" type="number" step="0.1" min="0" placeholder="按所选滤料分档填写" />
          </label>
          <label class="form-item">
            <span>反冲洗历时（min） <em>*</em></span>
            <input v-model="draft['反冲洗历时']" type="number" step="1" min="0" placeholder="按分档允许历时填写" />
          </label>
          <label class="form-item">
            <span>操作人员 <em>*</em></span>
            <input v-model="draft['操作人员']" :placeholder="store.operator" />
          </label>
          <label class="form-item wide">
            <span>反冲洗时间 <em>*</em></span>
            <input v-model="draft['反冲洗时间']" type="datetime-local" />
          </label>
        </div>

        <!-- 分档表：选了滤料类型后高亮当前档，滤料换过分档表跟着这张表走 -->
        <section class="tier-box">
          <h4>反冲洗强度分档表（随滤料类型联动）</h4>
          <table class="tier-table">
            <thead>
              <tr>
                <th>滤料类型</th>
                <th>强度区间 L/(s·m²)</th>
                <th>历时区间（min）</th>
                <th>允许水头损失（m）</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="tier in INTENSITY_TIERS"
                :key="tier.material"
                :class="{ active: tier.material === draft['滤料类型'] }"
              >
                <td>{{ tier.material }}</td>
                <td>{{ tier.intensityMin }}~{{ tier.intensityMax }}</td>
                <td>{{ tier.durationMin }}~{{ tier.durationMax }}（规则上限 {{ DURATION_HARD_MAX }}）</td>
                <td>≤{{ tier.headLossMax }}</td>
                <td>{{ tier.note }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="activeTier" class="tier-hint">
            当前「{{ activeTier.material }}」：强度 {{ activeTier.intensityMin }}~{{ activeTier.intensityMax }}
            L/(s·m²)，历时须在 {{ activeTier.durationMin }}~{{ activeTier.durationMax }}min 之间，
            超过 {{ DURATION_HARD_MAX }}min 一律按非法值扣单。
          </p>
        </section>

        <ul v-if="formIssues.length" class="issue-list">
          <li v-for="issue in formIssues" :key="issue.field">【{{ issue.field }}】{{ issue.message }}</li>
        </ul>

        <footer class="modal-foot">
          <span class="form-required-tip"><em>*</em> 为必填项，滤料类型或反冲洗强度没填的单据会被扣下</span>
          <span class="modal-actions">
            <button class="btn ghost" type="button" @click="closeForm">取消</button>
            <button class="btn primary" type="submit" :disabled="submitting">
              {{ submitting ? '提交中…' : '提交登记' }}
            </button>
          </span>
        </footer>
      </form>
    </div>

    <!-- 打印区：正面单据 + 背面阀门顺序，只在打印时出现 -->
    <div class="print-sheet">
      <section v-if="printRow" class="bill-front">
        <h2>滤池反冲洗记录单（正面）</h2>
        <table>
          <tbody>
            <tr><th>记录编号</th><td>#{{ printRow.id }}</td><th>当前状态</th><td>{{ printRow.status }}</td></tr>
            <tr v-for="column in columns" :key="column">
              <th>{{ column }}</th>
              <td colspan="3">{{ formatCell(printRow, column) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="bill-sign">操作人签字：____________　　值班负责人签字：____________　　日期：____________</p>
      </section>
      <section v-if="printRow" class="bill-back">
        <h2>反冲洗阀门操作顺序（背面 · 务必遵照）</h2>
        <ol class="valve-sequence">
          <li v-for="step in VALVE_SEQUENCE" :key="step">{{ step }}</li>
        </ol>
        <p class="valve-note">{{ VALVE_SEQUENCE_NOTE }}</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createEntry,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { armNextReadFailure } from '@/data/local-store'
import {
  DURATION_HARD_MAX,
  FILTER_MEDIA,
  FILTER_REQUIRED_FIELDS,
  INTENSITY_TIERS,
  tierOf,
  VALVE_SEQUENCE,
  VALVE_SEQUENCE_NOTE,
  validateFilterDraft,
} from '@/data/filter-rules'
import { useSessionStore } from '@/stores/session'
import type { EntryRow } from '@/data/types'

const store = useSessionStore()
const meta = moduleMeta('filter')
const columns = ['滤池编号', '滤料类型', '运行水头损失', '反冲洗强度', '反冲洗历时', '操作人员', '反冲洗时间', '滤池状态']
const actions = ['提交反冲', '确认完成', '提出检修']
const statuses = ['待反冲', '反冲中', '已反冲', '需检修']

const allLoaded = ref<EntryRow[]>([])
const loading = ref(false)
const loadError = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const month = ref(currentMonth())
const monthLabel = computed(() => {
  const [year, mm] = month.value.split('-')
  return `${year}年${Number(mm)}月`
})

// 列表与详情共用同一份拉取结果，重试回来两边自然对齐。
const monthRows = computed<EntryRow[]>(() => {
  const prefix = month.value
  return allLoaded.value.filter((row) => String(row['反冲洗时间'] ?? '').startsWith(prefix))
})

const rows = computed<EntryRow[]>(() => {
  const pairs = Object.entries(filters.value).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return monthRows.value
  }
  return monthRows.value.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
})

const total = computed(() => rows.value.length)

const stats = computed(() => [
  { label: '待反冲滤池', value: monthRows.value.filter((row) => row.status === '待反冲').length },
  { label: '反冲中滤池', value: monthRows.value.filter((row) => row.status === '反冲中').length },
  { label: '需检修滤池', value: monthRows.value.filter((row) => row.status === '需检修').length },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: monthRows.value.filter((row) => String(row.status) === status).length,
  })),
)

const selectedId = ref<number | null>(null)
const selected = computed<EntryRow | null>(() =>
  selectedId.value === null
    ? null
    : allLoaded.value.find((row) => Number(row.id) === selectedId.value) ?? null,
)
// 选中记录还在全量数据里、但不在当月/当前筛选列表中时，给一句说明而不是继续展示旧数据。
const selectedMissing = computed(
  () => selectedId.value !== null && !rows.value.some((row) => Number(row.id) === selectedId.value),
)

function selectRow(id: number) {
  selectedId.value = id
}

function formatCell(row: EntryRow, column: string): string {
  const value = row[column]
  if (value === undefined || value === null || String(value).trim() === '') {
    return '—（未填写）'
  }
  if (column === '运行水头损失') {
    return `${value} m`
  }
  if (column === '反冲洗强度') {
    return `${value} L/(s·m²)`
  }
  if (column === '反冲洗历时') {
    return `${value} min`
  }
  return String(value)
}

// 取数失败只提示一次，重试成功后同一批数据同时供给列表与详情。
async function reload(simulate = false) {
  if (simulate) {
    armNextReadFailure()
  }
  loading.value = true
  loadError.value = ''
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    const payload = listEntries(meta.key)
    allLoaded.value = payload.items
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '滤池反冲洗列表读取失败'
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = {}
  month.value = currentMonth()
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function simulateReadFail() {
  reload(true)
}

const actionMessage = ref('')
const actionFailed = ref(false)

function runAction(action: string, row: EntryRow) {
  const result = applyAction(meta.key, Number(row.id), action)
  actionMessage.value = result.message
  actionFailed.value = !result.ok
  if (result.ok) {
    reload()
  }
}

// ---- 登记单 ----

const formOpen = ref(false)
const submitting = ref(false)
const draft = ref<Record<string, string>>(emptyDraft())

function emptyDraft(): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of FILTER_REQUIRED_FIELDS) {
    values[field] = ''
  }
  return values
}

function nowLocalInput(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function openCreate() {
  draft.value = emptyDraft()
  draft.value['反冲洗时间'] = nowLocalInput()
  draft.value['操作人员'] = store.operator
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
}

const activeTier = computed(() => tierOf(draft.value['滤料类型'] ?? ''))
const formIssues = computed(() => validateFilterDraft(draft.value))

async function submitForm() {
  if (submitting.value) {
    return
  }
  submitting.value = true
  // 同一条滤池编号重复点提交只记一次：服务层按编号幂等，页面提交期间也锁住按钮。
  try {
    const payload: Record<string, string> = { ...draft.value }
    payload['反冲洗时间'] = payload['反冲洗时间'].replace('T', ' ')
    const result = createEntry(meta.key, payload)
    actionMessage.value = result.message
    actionFailed.value = !result.ok
    if (result.ok) {
      formOpen.value = false
      const stamped = String(payload['反冲洗时间'] ?? '')
      month.value = stamped.slice(0, 7) || month.value
      await reload()
      if (result.id !== undefined) {
        selectedId.value = result.id
      }
    }
  } finally {
    submitting.value = false
  }
}

// ---- 双面打印 ----

const printRow = computed<EntryRow | null>(() => selected.value)

function printBill() {
  if (!selected.value) {
    return
  }
  window.print()
}

onMounted(() => reload())
</script>

<style scoped>
.table-detail { display: flex; gap: 12px; align-items: flex-start; }
.table-detail .data-table { flex: 1; }
.data-table tbody tr.selected { background: #eaf2ff; }
.data-table tbody tr { cursor: pointer; }
.abnormal-tag { margin-left: 6px; background: #fef3f2; color: #b42318; border-radius: 4px; padding: 0 6px; font-size: 11px; }

.detail-panel { width: 320px; flex-shrink: 0; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; position: sticky; top: 12px; }
.detail-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.detail-head h3 { margin: 0; font-size: 14px; }
.detail-hint { color: var(--muted); font-size: 12px; }
.detail-list { display: grid; grid-template-columns: 96px 1fr; gap: 6px 8px; margin: 0; font-size: 12px; }
.detail-list dt { color: var(--muted); }
.detail-list dd { margin: 0; word-break: break-all; }

.error-banner { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: #fef3f2; border: 1px solid #fecdca; color: #b42318; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.loading-state { background: #fff; border: 1px dashed var(--border); border-radius: 8px; padding: 28px; text-align: center; color: var(--muted); }
.empty-banner { display: flex; flex-direction: column; gap: 4px; background: #fff; border: 1px dashed var(--border); border-radius: 8px; padding: 28px; text-align: center; color: var(--muted); font-size: 13px; }
.empty-banner strong { color: #1f2937; font-size: 14px; }
.ok-text { color: #067647; }
.foot-link { margin-left: 8px; font-size: 12px; }

.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow: auto; z-index: 50; }
.modal-card { background: #fff; border-radius: 10px; width: 760px; max-width: 100%; padding: 16px 18px; }
.modal-head { display: flex; justify-content: space-between; align-items: center; }
.modal-head h3 { margin: 0; font-size: 16px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-top: 12px; }
.form-item span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 3px; }
.form-item input, .form-item select { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
.form-item.wide { grid-column: 1 / -1; }
.form-item em { color: #b42318; font-style: normal; }

.tier-box { margin-top: 14px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
.tier-box h4 { margin: 0 0 8px; font-size: 13px; }
.tier-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.tier-table th, .tier-table td { border: 1px solid var(--border); padding: 5px 7px; text-align: left; }
.tier-table tr.active { background: #eaf2ff; font-weight: 600; }
.tier-hint { margin: 8px 0 0; font-size: 12px; color: var(--brand); }

.issue-list { margin: 10px 0 0; padding-left: 18px; color: #b42318; font-size: 12px; }
.modal-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; gap: 12px; }
.form-required-tip { color: var(--muted); font-size: 12px; }
.form-required-tip em { color: #b42318; font-style: normal; }
.modal-actions { display: flex; gap: 8px; }

.print-sheet { display: none; }
</style>

<style>
/* 打印：只输出双面单据，正面记录、背面阀门顺序，各占一页。 */
@media print {
  body * { visibility: hidden; }
  .filter-page .print-sheet, .filter-page .print-sheet * { visibility: visible; }
  .filter-page .print-sheet { display: block; }
  .print-sheet .bill-front, .print-sheet .bill-back {
    page-break-after: always;
    border: 2px solid #000;
    padding: 24px;
    margin-bottom: 16px;
  }
  .print-sheet h2 { text-align: center; font-size: 18px; }
  .print-sheet table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .print-sheet th, .print-sheet td { border: 1px solid #000; padding: 8px 10px; font-size: 13px; text-align: left; }
  .print-sheet th { width: 22%; background: #f2f2f2; }
  .bill-sign { margin-top: 28px; font-size: 13px; }
  .valve-sequence { font-size: 14px; line-height: 2; padding-left: 22px; }
  .valve-note { margin-top: 18px; font-size: 13px; font-weight: 600; }
}
</style>
