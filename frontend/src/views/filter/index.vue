<template>
  <section class="page" data-module="filter">
    <header class="page-head">
      <div>
        <h2>滤池反冲洗管理</h2>
        <p class="page-desc">维护滤池反冲洗记录，围绕滤池编号、滤料类型、运行水头损失、反冲洗强度做登记、筛选与状态流转。单据缺项或数值越界一律扣住不放。</p>
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

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>单据月份</span>
        <input v-model="month" type="month" :disabled="allMonths" />
      </label>
      <label class="filter-check">
        <input v-model="allMonths" type="checkbox" @change="onMonthScopeChange" />
        <span>查看全部月份</span>
      </label>
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-if="loadState === 'error'" class="load-banner error" role="alert">
      <span>⚠ {{ errorMessage }}。列表与详情面板暂不展示，请重试。</span>
      <button class="btn" type="button" @click="reload">重试</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.field">{{ column.label }}</th>
          <th>当前状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column.field">
            <span v-if="isEmpty(row[column.field])" class="missing-tag">未填写</span>
            <template v-else>
              {{ row[column.field] }}<span v-if="column.unit" class="cell-unit">{{ column.unit }}</span>
            </template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">查看详情</button>
            <RouterLink class="link" :to="`/filter/print/${row.id}`">打印单据</RouterLink>
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
        <tr v-if="loadState !== 'error' && !rows.length">
          <td :colspan="columns.length + 2" class="empty-state">
            {{ monthScope ? `本月（${monthScope}）暂无滤池反冲洗单据` : '暂无滤池反冲洗数据，可先登记滤池反冲洗记录' }}
          </td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>
        共 {{ total }} 条滤池反冲洗记录<template v-if="monthScope">（{{ monthScope }}）</template>
      </span>
      <span class="foot-tools">
        <button class="link subtle" type="button" title="演练一次取数失败：下一次读取只失败一次，复位后用重试恢复" @click="simulateFetchFail">
          取数异常演练
        </button>
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </span>
    </footer>

    <section class="bands-card">
      <header class="bands-head">
        <div>
          <h3>反冲洗强度分档表（按滤料类型）</h3>
          <p class="page-desc">反冲洗强度按所选滤料类型对应的档位填写；滤料换过、档位调整后在这里改，保存即更新分档表（以更新时间为准），新登记单据按新档位校验。</p>
        </div>
        <div class="page-actions">
          <button class="btn" type="button" :disabled="savingBands" @click="saveBands">保存分档表</button>
          <button class="btn ghost" type="button" @click="resetBands">撤销修改</button>
        </div>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>滤料类型</th>
            <th>强度下限</th>
            <th>强度上限</th>
            <th>单位</th>
            <th>档位更新时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(band, index) in bandForms" :key="band.media || index">
            <td><input v-model="band.media" class="table-input" placeholder="如：石英砂滤料" /></td>
            <td><input v-model="band.min" class="table-input narrow" inputmode="decimal" /></td>
            <td><input v-model="band.max" class="table-input narrow" inputmode="decimal" /></td>
            <td>{{ INTENSITY_UNIT }}</td>
            <td>{{ band.updatedAt }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="bandMessage" :class="bandMessageOk ? 'ok-text' : 'error-text'">{{ bandMessage }}</p>
      <p class="valve-note">
        单据背面印有阀门操作顺序：反冲洗开始先关进水阀、再开排空阀；冲洗结束复役先关排空阀、再开进水阀。以打印单据背面为准。
      </p>
    </section>

    <!-- 详情面板：数据直接取自本次列表读取结果，重试后与列表行保持一致 -->
    <aside v-if="selectedId !== null" class="detail-drawer" aria-label="滤池反冲洗单据详情">
      <header class="drawer-head">
        <h3>单据详情</h3>
        <button class="btn ghost" type="button" @click="selectedId = null">关闭</button>
      </header>
      <template v-if="loadState === 'error'">
        <p class="error-text">该单据数据未取到，请先重试拉取。</p>
        <button class="btn" type="button" @click="reload">重试</button>
      </template>
      <template v-else-if="selectedRow">
        <dl class="detail-list">
          <template v-for="item in detailItems" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>
              <span v-if="isEmpty(selectedRow[item.field])" class="missing-tag">未填写</span>
              <span v-else>{{ selectedRow[item.field] }}{{ item.unit ? ` ${item.unit}` : '' }}</span>
            </dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ selectedRow.status }}</dd>
          <dt>适用分档区间</dt>
          <dd>{{ selectedRow['分档区间'] ?? '—' }}</dd>
          <dt>分档表版本</dt>
          <dd>{{ selectedRow['分档表更新'] ?? '—' }}</dd>
        </dl>
        <p class="valve-note">
          阀门顺序（单据背面）：先关进水阀，再开排空阀；复役时先关排空阀，再开进水阀。
        </p>
        <RouterLink class="btn primary" :to="`/filter/print/${selectedRow.id}`">打印单据（含背面）</RouterLink>
      </template>
      <template v-else>
        <p class="error-text">当前列表中没有取到该单据，可能已随月份条件被筛掉，请调整条件后重新打开。</p>
      </template>
    </aside>

    <!-- 登记弹窗：必填项缺失或数值越界时单据扣住，逐项标出问题 -->
    <div v-if="createOpen" class="modal-mask" @click.self="closeCreate">
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="登记滤池反冲洗记录">
        <header class="drawer-head">
          <h3>登记滤池反冲洗记录</h3>
          <button class="btn ghost" type="button" @click="closeCreate">关闭</button>
        </header>
        <form class="create-form" @submit.prevent="submitCreate">
          <label class="form-item">
            <span><em>*</em> 滤池编号</span>
            <input v-model="form.滤池编号" placeholder="如：FILT-0007" />
            <small v-if="fieldErrors.滤池编号" class="field-error">{{ fieldErrors.滤池编号 }}</small>
          </label>
          <label class="form-item">
            <span><em>*</em> 滤料类型</span>
            <select v-model="form.滤料类型">
              <option value="">请选择滤料类型</option>
              <option v-for="band in bands" :key="band.media" :value="band.media">{{ band.media }}</option>
            </select>
            <small v-if="fieldErrors.滤料类型" class="field-error">{{ fieldErrors.滤料类型 }}</small>
          </label>
          <label class="form-item">
            <span>运行水头损失（m，可后补）</span>
            <input v-model="form.运行水头损失" inputmode="decimal" placeholder="如：1.8" />
          </label>
          <label class="form-item">
            <span><em>*</em> 反冲洗强度（{{ INTENSITY_UNIT }}）</span>
            <input v-model="form.反冲洗强度" inputmode="decimal" placeholder="按所选滤料的分档区间填写" />
            <small class="field-hint">
              当前滤料分档：<template v-if="selectedBand">{{ selectedBand.min }}~{{ selectedBand.max }} {{ INTENSITY_UNIT }}（更新于 {{ selectedBand.updatedAt }}）</template><template v-else>请先选择滤料类型</template>
            </small>
            <small v-if="fieldErrors.反冲洗强度" class="field-error">{{ fieldErrors.反冲洗强度 }}</small>
          </label>
          <label class="form-item">
            <span><em>*</em> 反冲洗历时（分钟）</span>
            <input v-model="form.反冲洗历时" inputmode="decimal" :placeholder="`规则区间 ${DURATION_MIN}~${DURATION_MAX} 分钟`" />
            <small v-if="fieldErrors.反冲洗历时" class="field-error">{{ fieldErrors.反冲洗历时 }}</small>
          </label>
          <label class="form-item">
            <span>操作人员</span>
            <input v-model="form.操作人员" />
          </label>
          <label class="form-item">
            <span>反冲洗时间</span>
            <input v-model="form.反冲洗时间" type="datetime-local" />
          </label>
          <p v-if="submitMessage" :class="submitOk ? 'ok-text' : 'error-text'">{{ submitMessage }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit" :disabled="submitting">
              {{ submitting ? '提交中…' : '提交单据' }}
            </button>
            <button class="btn ghost" type="button" @click="closeCreate">取消</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  armNextFetchFailure,
  createFilterEntry,
  fetchFilterEntries,
  listFilterBands,
  updateFilterBands,
} from '@/api/filter-service'
import {
  BACKWASH_DURATION_MAX,
  BACKWASH_DURATION_MIN,
  currentDateTime,
  currentMonth,
  FILTER_FIELDS,
  INTENSITY_UNIT,
  type IntensityBand,
} from '@/data/filter-rules'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('filter')
const session = useSessionStore()

const DURATION_MIN = BACKWASH_DURATION_MIN
const DURATION_MAX = BACKWASH_DURATION_MAX

type Column = { field: string; label: string; unit?: string }

const columns: Column[] = [
  { field: FILTER_FIELDS.code, label: '滤池编号' },
  { field: FILTER_FIELDS.media, label: '滤料类型' },
  { field: FILTER_FIELDS.headLoss, label: '运行水头损失', unit: 'm' },
  { field: FILTER_FIELDS.intensity, label: '反冲洗强度', unit: INTENSITY_UNIT },
  { field: FILTER_FIELDS.duration, label: '反冲洗历时', unit: '分钟' },
  { field: FILTER_FIELDS.operator, label: '操作人员' },
  { field: FILTER_FIELDS.time, label: '反冲洗时间' },
  { field: FILTER_FIELDS.state, label: '滤池状态' },
]
const filterFields = [FILTER_FIELDS.code, FILTER_FIELDS.media, FILTER_FIELDS.operator]
const actions = ['提交反冲', '确认完成', '提出检修']
const statuses = ['待反冲', '反冲中', '已反冲', '需检修']

const detailItems: Array<{ label: string; field: string; unit?: string }> = [
  { label: '滤池编号', field: FILTER_FIELDS.code },
  { label: '滤料类型', field: FILTER_FIELDS.media },
  { label: '运行水头损失', field: FILTER_FIELDS.headLoss, unit: 'm' },
  { label: '反冲洗强度', field: FILTER_FIELDS.intensity, unit: INTENSITY_UNIT },
  { label: '反冲洗历时', field: FILTER_FIELDS.duration, unit: '分钟' },
  { label: '操作人员', field: FILTER_FIELDS.operator },
  { label: '反冲洗时间', field: FILTER_FIELDS.time },
]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const loadState = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const month = ref(currentMonth())
const allMonths = ref(false)
const selectedId = ref<number | null>(null)

const monthScope = computed(() => (allMonths.value ? null : month.value))
const selectedRow = computed(() =>
  selectedId.value === null ? undefined : rows.value.find((row) => Number(row.id) === selectedId.value),
)
const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)
const stats = computed(() => [
  { label: '待反冲滤池', value: statusSummary.value[0].count },
  { label: '反冲中滤池', value: statusSummary.value[1].count },
  { label: '需检修滤池', value: statusSummary.value[3].count },
])

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function onMonthScopeChange() {
  reload()
}

function resetFilters() {
  filters.value = {}
  month.value = currentMonth()
  allMonths.value = false
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function reload() {
  errorMessage.value = ''
  loadState.value = 'loading'
  try {
    const payload = fetchFilterEntries(filters.value, monthScope.value)
    rows.value = payload.items
    total.value = payload.total
    loadState.value = 'ready'
  } catch (error) {
    rows.value = []
    total.value = 0
    loadState.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : '滤池反冲洗列表读取失败'
  }
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function openDetail(row: EntryRow) {
  selectedId.value = Number(row.id)
}

function simulateFetchFail() {
  armNextFetchFailure()
  reload()
}

// ---- 登记弹窗 ----

type CreateForm = {
  滤池编号: string
  滤料类型: string
  运行水头损失: string
  反冲洗强度: string
  反冲洗历时: string
  操作人员: string
  反冲洗时间: string
}

const createOpen = ref(false)
const submitting = ref(false)
const submitMessage = ref('')
const submitOk = ref(false)
const fieldErrors = ref<Partial<Record<string, string>>>({})
const bands = ref<IntensityBand[]>([])

function nowLocalInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const form = reactive<CreateForm>({
  滤池编号: '',
  滤料类型: '',
  运行水头损失: '',
  反冲洗强度: '',
  反冲洗历时: '',
  操作人员: '',
  反冲洗时间: '',
})

const selectedBand = computed(() =>
  bands.value.find((band) => band.media === form.滤料类型),
)

function refreshBands() {
  bands.value = listFilterBands()
  bandForms.value = bands.value.map((band) => ({
    media: band.media,
    min: String(band.min),
    max: String(band.max),
    updatedAt: band.updatedAt,
  }))
}

function openCreate() {
  submitMessage.value = ''
  submitOk.value = false
  fieldErrors.value = {}
  refreshBands()
  form.滤池编号 = ''
  form.滤料类型 = ''
  form.运行水头损失 = ''
  form.反冲洗强度 = ''
  form.反冲洗历时 = ''
  form.操作人员 = session.operator
  form.反冲洗时间 = nowLocalInput()
  createOpen.value = true
}

function closeCreate() {
  if (submitting.value) {
    return
  }
  createOpen.value = false
}

function submitCreate() {
  // 同步锁：同一时刻只允许一次提交，重复点击不会登记出第二条。
  if (submitting.value) {
    return
  }
  submitting.value = true
  submitMessage.value = ''
  submitOk.value = false
  fieldErrors.value = {}
  try {
    const result = createFilterEntry({
      ...form,
      反冲洗时间: form.反冲洗时间.replace('T', ' ') || currentDateTime(),
    })
    if (!result.ok) {
      submitOk.value = false
      submitMessage.value = result.message
      fieldErrors.value = result.fields ?? {}
      return
    }
    submitOk.value = true
    submitMessage.value = result.message
    createOpen.value = false
    if (result.row) {
      selectedId.value = Number(result.row.id)
      const recordMonth = String(result.row[FILTER_FIELDS.time] ?? '').slice(0, 7)
      if (recordMonth) {
        month.value = recordMonth
        allMonths.value = false
      }
    }
    reload()
  } finally {
    submitting.value = false
  }
}

// ---- 分档表维护 ----

type BandForm = { media: string; min: string; max: string; updatedAt: string }

const bandForms = ref<BandForm[]>([])
const savingBands = ref(false)
const bandMessage = ref('')
const bandMessageOk = ref(false)

function saveBands() {
  savingBands.value = true
  bandMessage.value = ''
  try {
    const result = updateFilterBands(bandForms.value)
    bandMessageOk.value = result.ok
    bandMessage.value = result.message
    if (result.ok && result.bands) {
      bands.value = result.bands
      bandForms.value = result.bands.map((band) => ({
        media: band.media,
        min: String(band.min),
        max: String(band.max),
        updatedAt: band.updatedAt,
      }))
    }
  } finally {
    savingBands.value = false
  }
}

function resetBands() {
  refreshBands()
  bandMessage.value = ''
}

onMounted(() => {
  refreshBands()
  reload()
})
</script>
