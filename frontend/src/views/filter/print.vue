<template>
  <section class="print-page" data-module="filter-print">
    <div class="print-toolbar no-print">
      <RouterLink class="btn ghost" to="/filter">← 返回滤池反冲洗列表</RouterLink>
      <button class="btn primary" type="button" @click="print">打印单据</button>
    </div>

    <div v-if="!row" class="print-missing">
      <p class="error-text">没有取到这张滤池反冲洗单据，请回到列表重试。</p>
      <RouterLink class="btn" to="/filter">返回列表</RouterLink>
    </div>

    <template v-else>
      <article class="slip">
        <header class="slip-head">
          <h2>滤池反冲洗记录单</h2>
          <p>单据编号：FILT-{{ String(row.id).padStart(4, '0') }}</p>
        </header>
        <table class="slip-table">
          <tbody>
            <tr>
              <th>滤池编号</th>
              <td>{{ cell(row['滤池编号']) }}</td>
              <th>滤料类型</th>
              <td>{{ cell(row['滤料类型']) }}</td>
            </tr>
            <tr>
              <th>运行水头损失</th>
              <td>{{ cell(row['运行水头损失'], 'm') }}</td>
              <th>当前状态</th>
              <td>{{ row.status }}</td>
            </tr>
            <tr>
              <th>反冲洗强度</th>
              <td>{{ cell(row['反冲洗强度'], 'L/(s·m²)') }}</td>
              <th>适用分档区间</th>
              <td>{{ cell(row['分档区间']) }}</td>
            </tr>
            <tr>
              <th>反冲洗历时</th>
              <td>{{ cell(row['反冲洗历时'], '分钟') }}</td>
              <th>分档表版本</th>
              <td>{{ cell(row['分档表更新']) }}</td>
            </tr>
            <tr>
              <th>操作人员</th>
              <td>{{ cell(row['操作人员']) }}</td>
              <th>反冲洗时间</th>
              <td>{{ cell(row['反冲洗时间']) }}</td>
            </tr>
          </tbody>
        </table>
        <footer class="slip-sign">
          <span>操作人签字：______________</span>
          <span>班长复核：______________</span>
          <span>日期：______________</span>
        </footer>
      </article>

      <article class="slip slip-back">
        <header class="slip-head">
          <h2>背面 · 阀门操作顺序</h2>
          <p>随单据一并打印，操作时以本页顺序为准。</p>
        </header>
        <ol class="valve-order">
          <li>
            <strong>反冲洗开始（进水侧先动作）：</strong>
            先关闭<strong>进水阀</strong>，停止滤格进水并确认到位；随后再开启<strong>排空阀</strong>，
            将滤池水位降至排水槽以下，再投入反冲洗。顺序不可颠倒，严禁进水阀未关闭就开排空阀，避免原水短路直排。
          </li>
          <li>
            <strong>反冲洗结束、滤格复役（排空侧先动作）：</strong>
            先关闭<strong>排空阀</strong>，确认无排水；随后再开启<strong>进水阀</strong>恢复进水，
            待滤层稳定、初滤水按规定排放后方可转入正常过滤。
          </li>
        </ol>
        <p class="valve-reminder">记忆口诀：停机先关进水阀、再开排空阀；复役先关排空阀、再开进水阀。</p>
        <footer class="slip-sign">
          <span>阀门操作确认：______________</span>
          <span>监护确认：______________</span>
        </footer>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { getFilterEntry } from '@/api/filter-service'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const row = ref<EntryRow | null>(null)

function cell(value: unknown, unit?: string): string {
  if (value === null || value === undefined || String(value).trim() === '') {
    return '未填写'
  }
  return unit ? `${String(value)} ${unit}` : String(value)
}

function print() {
  window.print()
}

onMounted(() => {
  row.value = getFilterEntry(Number(route.params.id))
})
</script>

<style scoped>
.print-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 20px;
}
.print-toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}
.slip {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px 28px;
  margin-bottom: 24px;
}
.slip-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 2px solid #101828;
  padding-bottom: 8px;
  margin-bottom: 16px;
}
.slip-head h2 {
  margin: 0;
  font-size: 18px;
}
.slip-head p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.slip-table {
  width: 100%;
  border-collapse: collapse;
}
.slip-table th,
.slip-table td {
  border: 1px solid var(--border);
  padding: 10px 12px;
  font-size: 14px;
  text-align: left;
}
.slip-table th {
  width: 18%;
  background: #f1f5f9;
  white-space: nowrap;
}
.slip-sign {
  display: flex;
  gap: 32px;
  margin-top: 20px;
  font-size: 14px;
}
.valve-order {
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 14px;
  line-height: 1.8;
}
.valve-reminder {
  margin-top: 18px;
  padding: 10px 12px;
  background: #eef2f7;
  border-radius: 6px;
  font-size: 13px;
}
.slip-back {
  page-break-before: always;
}
.print-missing {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 32px;
  text-align: center;
}

@media print {
  .print-page {
    max-width: none;
    padding: 0;
  }
  .slip {
    border-radius: 0;
    border: none;
    padding: 0;
    margin-bottom: 0;
  }
}
</style>
