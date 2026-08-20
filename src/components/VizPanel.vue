<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { API_BASE } from '../config.js'
import { ChartBarIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'

const store = useVariantStore()
const vizData = ref(null)
const loading = ref(false)
const error   = ref('')
const activeChart = ref('leaderboard') // leaderboard | manhattan | rarity | clinical | chromosome | scores | coverage

const charts = [
  { key: 'leaderboard', label: 'Leaderboard'       },
  { key: 'manhattan',   label: 'Priority Map'       },
  { key: 'rarity',      label: 'Rarity vs Impact'   },
  { key: 'clinical',    label: 'Clinical Sig'       },
  { key: 'chromosome',  label: 'Chromosomes'        },
  { key: 'scores',      label: 'Scores'             },
  { key: 'coverage',    label: 'DB Coverage'        },
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

// ── Priority Map (Manhattan) + Rarity/Impact scatter ───────────────────────
// Both are drawn on <canvas> rather than SVG since they can hold a few
// hundred points — plain SVG node-per-point starts to lag past that, and
// canvas keeps this dependency-free (no Chart.js install needed for Phase 1).

// Approximate GRCh38 chromosome lengths (bp) — used only to space points
// left-to-right on the Priority Map; not used for any scoring/analysis.
const CHROM_ORDER = ['1','2','3','4','5','6','7','8','9','10','11','12','13',
  '14','15','16','17','18','19','20','21','22','X','Y']
const CHROM_LEN = {
  '1':248956422,'2':242193529,'3':198295559,'4':190214555,'5':181538259,
  '6':170805979,'7':159345973,'8':145138636,'9':138394717,'10':133797422,
  '11':135086622,'12':133275309,'13':114364328,'14':107043718,'15':101991189,
  '16':90338345,'17':83257441,'18':80373285,'19':58617616,'20':64444167,
  '21':46709983,'22':50818468,'X':156040895,'Y':57227415
}
const CUM_OFFSET = (() => {
  const out = {}
  let acc = 0
  for (const c of CHROM_ORDER) { out[c] = acc; acc += CHROM_LEN[c] }
  return out
})()
const TOTAL_GENOME_LEN = CUM_OFFSET['Y'] + CHROM_LEN['Y']

const normalizeChrom = (raw) => String(raw || '').replace(/^chr/i, '').toUpperCase()

const genomeX = (chromRaw, pos) => {
  const c = normalizeChrom(chromRaw)
  if (!(c in CHROM_LEN) || pos == null) return null
  return CUM_OFFSET[c] + Number(pos)
}

// Color-by-significance — specific tiers ("likely pathogenic") are checked
// before their broader substring ("pathogenic") so they don't get shadowed.
const SIG_COLOR_RULES = [
  ['likely pathogenic',      '#f97316'],
  ['pathogenic',             '#ef4444'],
  ['uncertain significance', '#eab308'],
  ['likely benign',          '#84cc16'],
  ['benign',                 '#22c55e'],
]
const getSigColor = (sig) => {
  const s = (sig || '').toLowerCase()
  const match = SIG_COLOR_RULES.find(([key]) => s.includes(key))
  return match ? match[1] : '#94a3b8'
}
const SIG_LEGEND = [
  { label: 'Pathogenic',              color: '#ef4444' },
  { label: 'Likely pathogenic',       color: '#f97316' },
  { label: 'Uncertain significance',  color: '#eab308' },
  { label: 'Likely benign / Benign',  color: '#84cc16' },
  { label: 'No ClinVar / other',      color: '#94a3b8' },
]

const manhattanPoints = computed(() => vizData.value?.manhattan_data || [])
const rarityPoints    = computed(() => vizData.value?.rarity_impact_data || [])
const leaderboardRows = computed(() => vizData.value?.leaderboard || [])

const manhattanCanvas = ref(null)
const rarityCanvas    = ref(null)
const manhattanHover  = ref(null) // { x, y, point }
const rarityHover     = ref(null)
let manhattanPlotted  = []        // [{ x, y, point }] in canvas CSS-px, refreshed on each draw
let rarityPlotted     = []

const MAF_LOG_MIN = -6  // log10(1e-6) — clamps extremely rare/edge values
const MAF_LOG_MAX = 0   // log10(1)
const CADD_AXIS_MAX = 40

function setupCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 700
  canvas.width  = width * dpr
  canvas.height = cssHeight * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, cssHeight)
  return { ctx, width, height: cssHeight }
}

function drawYGridlines(ctx, padding, plotW, plotH, values, formatLabel) {
  ctx.strokeStyle = '#f1f5f9'
  ctx.fillStyle   = '#94a3b8'
  ctx.font        = '10px sans-serif'
  ctx.textAlign   = 'right'
  values.forEach(v => {
    const y = padding.top + plotH - v.frac * plotH
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(padding.left + plotW, y)
    ctx.stroke()
    ctx.fillText(formatLabel(v.value), padding.left - 6, y + 3)
  })
  ctx.textAlign = 'left'
}

function drawManhattan() {
  const canvas = manhattanCanvas.value
  if (!canvas) return
  const height = 260
  const { ctx, width } = setupCanvas(canvas, height)
  const padding = { top: 10, right: 12, bottom: 26, left: 34 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  drawYGridlines(ctx, padding, plotW, plotH,
    [0, 25, 50, 75, 100].map(v => ({ value: v, frac: v / 100 })),
    v => String(v))

  manhattanPlotted = []
  manhattanPoints.value.forEach(p => {
    const gx = genomeX(p.chrom, p.pos)
    if (gx == null) return
    const x = padding.left + (gx / TOTAL_GENOME_LEN) * plotW
    const y = padding.top + plotH - (Math.min(100, p.priority) / 100) * plotH
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = getSigColor(p.sig)
    ctx.globalAlpha = 0.8
    ctx.fill()
    ctx.globalAlpha = 1
    manhattanPlotted.push({ x, y, point: p })
  })

  // Chromosome boundary labels along the bottom (every other one, to avoid crowding)
  ctx.fillStyle = '#64748b'
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'center'
  CHROM_ORDER.forEach((c, i) => {
    if (i % 2 !== 0) return
    const mid = CUM_OFFSET[c] + CHROM_LEN[c] / 2
    const x = padding.left + (mid / TOTAL_GENOME_LEN) * plotW
    ctx.fillText(c, x, height - 8)
  })
  ctx.textAlign = 'left'
}

function drawRarity() {
  const canvas = rarityCanvas.value
  if (!canvas) return
  const height = 260
  const { ctx, width } = setupCanvas(canvas, height)
  const padding = { top: 10, right: 12, bottom: 26, left: 34 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  const yTicks = [0, 10, 20, 30, 40]
  drawYGridlines(ctx, padding, plotW, plotH,
    yTicks.map(v => ({ value: v, frac: v / CADD_AXIS_MAX })),
    v => String(v))

  // Shade the "rare + damaging" corner researchers care about most
  const rareX  = padding.left + ((Math.log10(0.01) - MAF_LOG_MIN) / (MAF_LOG_MAX - MAF_LOG_MIN)) * plotW
  const dmgY   = padding.top + plotH - (20 / CADD_AXIS_MAX) * plotH
  ctx.fillStyle = 'rgba(239,68,68,0.05)'
  ctx.fillRect(padding.left, padding.top, rareX - padding.left, dmgY - padding.top)
  ctx.strokeStyle = '#fecaca'
  ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(rareX, padding.top); ctx.lineTo(rareX, padding.top + plotH); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(padding.left, dmgY); ctx.lineTo(padding.left + plotW, dmgY); ctx.stroke()
  ctx.setLineDash([])

  rarityPlotted = []
  rarityPoints.value.forEach(p => {
    if (p.cadd == null || p.maf == null) return
    const clampedLog = Math.max(MAF_LOG_MIN, Math.min(MAF_LOG_MAX, Math.log10(Math.max(p.maf, 1e-9))))
    const x = padding.left + ((clampedLog - MAF_LOG_MIN) / (MAF_LOG_MAX - MAF_LOG_MIN)) * plotW
    const y = padding.top + plotH - (Math.min(CADD_AXIS_MAX, p.cadd) / CADD_AXIS_MAX) * plotH
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = getSigColor(p.sig)
    ctx.globalAlpha = 0.8
    ctx.fill()
    ctx.globalAlpha = 1
    rarityPlotted.push({ x, y, point: p })
  })

  ctx.fillStyle = '#94a3b8'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('← rarer      MAF (log scale)      more common →', padding.left + plotW / 2, height - 6)
  ctx.textAlign = 'left'
}

function nearestPlotted(list, mx, my, threshold = 8) {
  let nearest = null, best = threshold
  for (const p of list) {
    const d = Math.hypot(p.x - mx, p.y - my)
    if (d < best) { best = d; nearest = p }
  }
  return nearest
}

function onManhattanMove(e) {
  const rect = e.target.getBoundingClientRect()
  const hit = nearestPlotted(manhattanPlotted, e.clientX - rect.left, e.clientY - rect.top)
  manhattanHover.value = hit ? { x: hit.x, y: hit.y, point: hit.point } : null
}
function onRarityMove(e) {
  const rect = e.target.getBoundingClientRect()
  const hit = nearestPlotted(rarityPlotted, e.clientX - rect.left, e.clientY - rect.top)
  rarityHover.value = hit ? { x: hit.x, y: hit.y, point: hit.point } : null
}

const priorityBadgeClass = (score) =>
  score >= 70 ? 'bg-red-50 text-red-700 border-red-200'
  : score >= 40 ? 'bg-orange-50 text-orange-700 border-orange-200'
  : 'bg-slate-50 text-slate-600 border-slate-200'

async function redrawActive() {
  await nextTick()
  if (activeChart.value === 'manhattan') drawManhattan()
  else if (activeChart.value === 'rarity') drawRarity()
}

watch([activeChart, vizData], redrawActive)

function onResize() { redrawActive() }
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
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
      <div class="flex border-b border-slate-100 bg-slate-50 overflow-x-auto">
        <button v-for="c in charts" :key="c.key" @click="activeChart = c.key"
          :class="['flex-1 py-2.5 px-2 text-xs font-medium whitespace-nowrap transition-colors',
            activeChart === c.key
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-500'
              : 'text-slate-500 hover:text-slate-700']">
          {{ c.label }}
        </button>
      </div>

      <div class="p-5 overflow-x-auto">

        <!-- ── Leaderboard ───────────────────────────────────────────────── -->
        <div v-if="activeChart === 'leaderboard'">
          <p class="text-xs text-slate-400 mb-4">
            Top variants by composite priority score
            <span class="font-normal text-slate-400">— ClinVar tier + CADD + rarity + predictor concordance</span>
          </p>
          <div v-if="leaderboardRows.length" class="border border-slate-200 rounded-lg overflow-hidden">
            <table class="w-full text-xs">
              <thead>
                <tr class="bg-slate-50 text-slate-500">
                  <th class="text-left font-medium py-2 px-3">rsID</th>
                  <th class="text-left font-medium py-2 px-3">Gene</th>
                  <th class="text-left font-medium py-2 px-3">Chr:Pos</th>
                  <th class="text-left font-medium py-2 px-3">ClinVar</th>
                  <th class="text-right font-medium py-2 px-3">CADD</th>
                  <th class="text-right font-medium py-2 px-3">MAF</th>
                  <th class="text-right font-medium py-2 px-3">Priority</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in leaderboardRows" :key="row.rsid" class="border-t border-slate-100">
                  <td class="py-2 px-3 text-indigo-600 font-medium">{{ row.rsid }}</td>
                  <td class="py-2 px-3 text-slate-700">{{ row.gene || '—' }}</td>
                  <td class="py-2 px-3 text-slate-500">{{ row.chrom }}:{{ row.pos?.toLocaleString() || '—' }}</td>
                  <td class="py-2 px-3 text-slate-600">{{ row.sig || 'Unknown' }}</td>
                  <td class="py-2 px-3 text-right text-slate-600">{{ row.cadd ?? '—' }}</td>
                  <td class="py-2 px-3 text-right text-slate-500">{{ row.maf != null ? row.maf.toExponential(1) : '—' }}</td>
                  <td class="py-2 px-3 text-right">
                    <span :class="['inline-block px-2 py-0.5 rounded border text-[11px] font-semibold', priorityBadgeClass(row.priority)]">
                      {{ row.priority }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-slate-400 text-xs">No variants to rank yet.</p>
        </div>

        <!-- ── Priority Map (Manhattan plot) ────────────────────────────── -->
        <div v-if="activeChart === 'manhattan'">
          <p class="text-xs text-slate-400 mb-4">
            Priority score by chromosome position — spikes are worth reviewing first
          </p>
          <div v-if="manhattanPoints.length" class="relative">
            <canvas ref="manhattanCanvas" class="w-full block"
              style="height:260px"
              @mousemove="onManhattanMove" @mouseleave="manhattanHover = null" />
            <div v-if="manhattanHover"
              class="absolute pointer-events-none px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap z-10"
              :style="`left:${manhattanHover.x + 10}px; top:${Math.max(0, manhattanHover.y - 26)}px`">
              {{ manhattanHover.point.rsid }} · {{ manhattanHover.point.gene || 'no gene' }} ·
              chr{{ manhattanHover.point.chrom.replace(/^chr/i,'') }}:{{ manhattanHover.point.pos?.toLocaleString() }} ·
              score {{ manhattanHover.point.priority }}
            </div>
          </div>
          <p v-else class="text-slate-400 text-xs">No positional data available for this variant set.</p>
          <div class="flex flex-wrap gap-4 mt-3">
            <span v-for="l in SIG_LEGEND" :key="l.label" class="flex items-center gap-1 text-[11px] text-slate-500">
              <span class="w-2.5 h-2.5 rounded-full inline-block" :style="`background:${l.color}`" /> {{ l.label }}
            </span>
          </div>
        </div>

        <!-- ── Rarity vs Impact scatter ──────────────────────────────────── -->
        <div v-if="activeChart === 'rarity'">
          <p class="text-xs text-slate-400 mb-4">
            Rare + high-impact variants (shaded corner, upper-left) are the ones most worth a closer look
          </p>
          <div v-if="rarityPoints.length" class="relative">
            <canvas ref="rarityCanvas" class="w-full block"
              style="height:260px"
              @mousemove="onRarityMove" @mouseleave="rarityHover = null" />
            <div v-if="rarityHover"
              class="absolute pointer-events-none px-2 py-1 bg-slate-800 text-white text-[10px] rounded whitespace-nowrap z-10"
              :style="`left:${rarityHover.x + 10}px; top:${Math.max(0, rarityHover.y - 26)}px`">
              {{ rarityHover.point.rsid }} · {{ rarityHover.point.gene || 'no gene' }} ·
              MAF {{ rarityHover.point.maf.toExponential(2) }} · CADD {{ rarityHover.point.cadd }}
            </div>
          </div>
          <p v-else class="text-slate-400 text-xs">No variants with both a MAF and a CADD score in this set.</p>
          <p class="text-[10px] text-slate-400 mt-1">Y-axis is capped at CADD 40 for readability.</p>
          <div class="flex flex-wrap gap-4 mt-3">
            <span v-for="l in SIG_LEGEND" :key="l.label" class="flex items-center gap-1 text-[11px] text-slate-500">
              <span class="w-2.5 h-2.5 rounded-full inline-block" :style="`background:${l.color}`" /> {{ l.label }}
            </span>
          </div>
        </div>

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