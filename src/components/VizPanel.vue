<script setup>
import { ref, computed, watch } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { API_BASE } from '../config.js'
import { ChartBarIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'

const store = useVariantStore()
const vizData = ref(null)
const loading = ref(false)
const error   = ref('')
const activeChart = ref('clinical') // clinical | chromosome | scores | coverage

const charts = [
  { key: 'clinical',    label: 'Clinical Sig'   },
  { key: 'chromosome',  label: 'Chromosomes'    },
  { key: 'scores',      label: 'Scores'         },
  { key: 'coverage',    label: 'DB Coverage'    },
]

const fetchVizData = async () => {
  if (store.variants.length === 0) return
  loading.value = true
  error.value   = ''
  try {
    const resp = await fetch(`${API_BASE}/api/viz_data`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ variants: store.variants })
    })
    vizData.value = await resp.json()
  } catch (e) {
    error.value = 'Failed to load visualization data.'
  } finally {
    loading.value = false
  }
}

// Auto-fetch when variants change (debounced — only after loading finishes)
watch(() => store.loading, (isLoading) => {
  if (!isLoading && store.variants.length > 0) fetchVizData()
})

// ── Chart helpers ─────────────────────────────────────────────────────────────

// Truncate long sig labels for display
const truncate = (s, n = 22) => s.length > n ? s.slice(0, n) + '…' : s

const clinicalChartData = computed(() =>
  (vizData.value?.clinical_breakdown || []).map(d => ({
    name:  truncate(d.sig),
    value: d.count,
    color: d.color,
    full:  d.sig
  }))
)

const chromosomeChartData = computed(() =>
  (vizData.value?.chromosome_counts || []).slice(0, 24)
)

const caddData = computed(() =>
  (vizData.value?.score_distributions?.cadd || []).slice(0, 30)
)
const siftData = computed(() =>
  (vizData.value?.score_distributions?.sift || []).slice(0, 30)
)
const polyphenData = computed(() =>
  (vizData.value?.score_distributions?.polyphen || []).slice(0, 30)
)

const coverageData = computed(() =>
  (vizData.value?.source_coverage || [])
)

// Bar chart dimensions
const BAR_HEIGHT = 22
const BAR_GAP    = 6
const LABEL_W    = 110
const BAR_MAX_W  = 200
const CHART_PAD  = 16

// Scales
const clinicalMax  = computed(() => Math.max(...clinicalChartData.value.map(d => d.value), 1))
const chromMax     = computed(() => Math.max(...chromosomeChartData.value.map(d => d.count), 1))
const caddMax      = computed(() => Math.max(...caddData.value.map(d => d.score), 1))
const siftMax      = computed(() => 1)  // SIFT is 0-1
const polyphenMax  = computed(() => 1)  // PolyPhen is 0-1
const coverageMax  = computed(() => 100) // percentage

const barY = (i) => CHART_PAD + i * (BAR_HEIGHT + BAR_GAP)
const svgH  = (n) => CHART_PAD * 2 + n * (BAR_HEIGHT + BAR_GAP)
</script>

<template>
  <div v-if="store.variants.length > 0"
    class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">

    <!-- Header -->
    <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <ChartBarIcon class="h-5 w-5 text-slate-600" />
        <h3 class="text-base font-semibold text-slate-900">Variant Visualizations</h3>
        <span v-if="vizData" class="text-xs text-slate-500">
          {{ vizData.total }} variants
        </span>
      </div>
      <button @click="fetchVizData" :disabled="loading"
        class="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50">
        <ArrowPathIcon :class="['h-4 w-4', loading ? 'animate-spin' : '']" />
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !vizData" class="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
      <ArrowPathIcon class="h-5 w-5 animate-spin" /> Building charts…
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-6 py-4 text-sm text-red-600">{{ error }}</div>

    <template v-else-if="vizData">
      <!-- Chart tabs -->
      <div class="flex border-b border-slate-100 bg-slate-50">
        <button v-for="c in charts" :key="c.key" @click="activeChart = c.key"
          :class="['flex-1 py-2.5 text-xs font-medium transition-colors',
            activeChart === c.key
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-500'
              : 'text-slate-500 hover:text-slate-700']">
          {{ c.label }}
        </button>
      </div>

      <div class="p-5 overflow-x-auto">

        <!-- ── Clinical Significance ────────────────────────────────────── -->
        <div v-if="activeChart === 'clinical'">
          <p class="text-xs text-slate-400 mb-4">Distribution by ClinVar clinical significance</p>
          <svg v-if="clinicalChartData.length"
            :width="LABEL_W + BAR_MAX_W + 60"
            :height="svgH(clinicalChartData.length)"
            class="overflow-visible">
            <g v-for="(d, i) in clinicalChartData" :key="d.name">
              <!-- Label -->
              <text :x="LABEL_W - 6" :y="barY(i) + BAR_HEIGHT / 2 + 4"
                text-anchor="end" class="text-[11px]" fill="#64748b" font-size="11">
                {{ d.name }}
              </text>
              <!-- Background track -->
              <rect :x="LABEL_W" :y="barY(i)" :width="BAR_MAX_W" :height="BAR_HEIGHT"
                rx="3" fill="#f1f5f9" />
              <!-- Filled bar -->
              <rect :x="LABEL_W" :y="barY(i)"
                :width="Math.max(4, (d.value / clinicalMax) * BAR_MAX_W)"
                :height="BAR_HEIGHT" rx="3" :fill="d.color" opacity="0.85">
                <title>{{ d.full }}: {{ d.value }}</title>
              </rect>
              <!-- Count label -->
              <text :x="LABEL_W + Math.max(4, (d.value / clinicalMax) * BAR_MAX_W) + 6"
                :y="barY(i) + BAR_HEIGHT / 2 + 4"
                font-size="11" fill="#334155">
                {{ d.value }}
              </text>
            </g>
          </svg>
          <p v-else class="text-slate-400 text-xs">No ClinVar data in current variant set.</p>
        </div>

        <!-- ── Chromosome Distribution ──────────────────────────────────── -->
        <div v-if="activeChart === 'chromosome'">
          <p class="text-xs text-slate-400 mb-4">Variant count per chromosome</p>
          <svg v-if="chromosomeChartData.length"
            :width="LABEL_W + BAR_MAX_W + 60"
            :height="svgH(chromosomeChartData.length)"
            class="overflow-visible">
            <g v-for="(d, i) in chromosomeChartData" :key="d.chrom">
              <text :x="LABEL_W - 6" :y="barY(i) + BAR_HEIGHT / 2 + 4"
                text-anchor="end" font-size="11" fill="#64748b">
                {{ d.chrom }}
              </text>
              <rect :x="LABEL_W" :y="barY(i)" :width="BAR_MAX_W" :height="BAR_HEIGHT"
                rx="3" fill="#f1f5f9" />
              <rect :x="LABEL_W" :y="barY(i)"
                :width="Math.max(4, (d.count / chromMax) * BAR_MAX_W)"
                :height="BAR_HEIGHT" rx="3" fill="#6366f1" opacity="0.75">
                <title>{{ d.chrom }}: {{ d.count }} variants</title>
              </rect>
              <text :x="LABEL_W + Math.max(4, (d.count / chromMax) * BAR_MAX_W) + 6"
                :y="barY(i) + BAR_HEIGHT / 2 + 4" font-size="11" fill="#334155">
                {{ d.count }}
              </text>
            </g>
          </svg>
          <p v-else class="text-slate-400 text-xs">No positional data available.</p>
        </div>

        <!-- ── Functional Scores ────────────────────────────────────────── -->
        <div v-if="activeChart === 'scores'" class="space-y-8">

          <!-- CADD -->
          <div v-if="caddData.length">
            <p class="text-xs font-medium text-slate-600 mb-1">
              CADD phred score
              <span class="font-normal text-slate-400 ml-2">≥20 deleterious · ≥30 top 0.1%</span>
            </p>
            <div class="flex items-end gap-px h-20">
              <div v-for="d in caddData" :key="d.rsid"
                class="flex-1 min-w-0 relative group cursor-default"
                :style="`height: ${Math.max(4, (d.score / 50) * 100)}%`">
                <div class="w-full h-full rounded-sm"
                  :style="`background: ${d.score >= 30 ? '#ef4444' : d.score >= 20 ? '#f97316' : '#6366f1'}`"
                  :title="`${d.rsid}: ${d.score}`" />
                <!-- Tooltip on hover -->
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                  {{ d.rsid }}: {{ d.score }}
                </div>
              </div>
            </div>
            <div class="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Most damaging</span><span>Least damaging →</span>
            </div>
            <!-- Legend -->
            <div class="flex gap-4 mt-2">
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-red-500 inline-block"/> ≥30
              </span>
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-orange-500 inline-block"/> 20–29
              </span>
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-indigo-500 inline-block"/> &lt;20
              </span>
            </div>
          </div>
          <p v-else class="text-xs text-slate-400">No CADD scores in this dataset.</p>

          <!-- SIFT -->
          <div v-if="siftData.length">
            <p class="text-xs font-medium text-slate-600 mb-1">
              SIFT score
              <span class="font-normal text-slate-400 ml-2">&lt;0.05 = damaging (lower = worse)</span>
            </p>
            <div class="flex items-end gap-px h-16">
              <div v-for="d in siftData" :key="d.rsid"
                class="flex-1 min-w-0 group cursor-default relative"
                :style="`height: ${Math.max(4, (1 - d.score) * 100)}%`">
                <div class="w-full h-full rounded-sm"
                  :style="`background: ${d.score < 0.05 ? '#ef4444' : '#84cc16'}`"
                  :title="`${d.rsid}: ${d.score}`" />
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                  {{ d.rsid }}: {{ d.score }}
                </div>
              </div>
            </div>
            <div class="flex gap-4 mt-2">
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-red-500 inline-block"/> Damaging (&lt;0.05)
              </span>
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-green-400 inline-block"/> Tolerated
              </span>
            </div>
          </div>
          <p v-else class="text-xs text-slate-400">No SIFT scores in this dataset.</p>

          <!-- PolyPhen -->
          <div v-if="polyphenData.length">
            <p class="text-xs font-medium text-slate-600 mb-1">
              PolyPhen-2 HVAR
              <span class="font-normal text-slate-400 ml-2">&gt;0.908 probably damaging</span>
            </p>
            <div class="flex items-end gap-px h-16">
              <div v-for="d in polyphenData" :key="d.rsid"
                class="flex-1 min-w-0 group cursor-default relative"
                :style="`height: ${Math.max(4, d.score * 100)}%`">
                <div class="w-full h-full rounded-sm"
                  :style="`background: ${d.score > 0.908 ? '#ef4444' : d.score > 0.447 ? '#f97316' : '#84cc16'}`"
                  :title="`${d.rsid}: ${d.score}`" />
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                  {{ d.rsid }}: {{ d.score }}
                </div>
              </div>
            </div>
            <div class="flex gap-4 mt-2">
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-red-500 inline-block"/> Prob. damaging
              </span>
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-orange-500 inline-block"/> Poss. damaging
              </span>
              <span class="flex items-center gap-1 text-[11px] text-slate-500">
                <span class="w-3 h-3 rounded-sm bg-green-400 inline-block"/> Benign
              </span>
            </div>
          </div>
          <p v-else class="text-xs text-slate-400">No PolyPhen scores in this dataset.</p>

        </div>

        <!-- ── Database Coverage ────────────────────────────────────────── -->
        <div v-if="activeChart === 'coverage'">
          <p class="text-xs text-slate-400 mb-4">Percentage of variants found in each database</p>
          <svg v-if="coverageData.length"
            :width="LABEL_W + BAR_MAX_W + 60"
            :height="svgH(coverageData.length)"
            class="overflow-visible">
            <g v-for="(d, i) in coverageData" :key="d.database">
              <text :x="LABEL_W - 6" :y="barY(i) + BAR_HEIGHT / 2 + 4"
                text-anchor="end" font-size="11" fill="#64748b">
                {{ d.database }}
              </text>
              <rect :x="LABEL_W" :y="barY(i)" :width="BAR_MAX_W" :height="BAR_HEIGHT"
                rx="3" fill="#f1f5f9" />
              <rect :x="LABEL_W" :y="barY(i)"
                :width="Math.max(4, (d.pct / 100) * BAR_MAX_W)"
                :height="BAR_HEIGHT" rx="3"
                :fill="d.pct > 80 ? '#22c55e' : d.pct > 40 ? '#f97316' : '#ef4444'"
                opacity="0.8">
                <title>{{ d.database }}: {{ d.count }} variants ({{ d.pct }}%)</title>
              </rect>
              <text :x="LABEL_W + Math.max(4, (d.pct / 100) * BAR_MAX_W) + 6"
                :y="barY(i) + BAR_HEIGHT / 2 + 4" font-size="11" fill="#334155">
                {{ d.pct }}% ({{ d.count }})
              </text>
            </g>
          </svg>
        </div>

      </div>
    </template>

  </div>
</template>