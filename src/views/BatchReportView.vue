<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { API_BASE } from '../config.js'
import { useVariantDetailStore } from '../stores/variantDetailStore'
import {
  ArrowUpTrayIcon, DocumentTextIcon, XMarkIcon,
  ArrowPathIcon, ExclamationTriangleIcon,
  ArrowDownTrayIcon, ArrowLeftIcon,
} from '@heroicons/vue/24/outline'

const detailStore = useVariantDetailStore()

const file = ref(null)
const isDragging = ref(false)
const fileInput = ref(null)

const pastedText = ref('')
const inputMode = ref('file')   // 'file' (VCF) | 'rsid' (rsID list) | 'paste' (VCF-style lines)

// 'preview' stage: parsed client-side, shown for confirmation before any job
// runs. Added specifically because a column-order mismatch between input
// modes previously let a job run to completion on garbage input (allele
// values landing in the rsID column) with no warning until results came
// back wrong. Parsing happens the same way here as at submit time, so what
// you confirm is what actually gets sent.
const stage = ref('input')  // 'input' | 'preview' | 'running' | 'result'
const parsedVariants = ref([])   // for file/paste modes
const parsedRsids = ref([])      // for rsid mode — valid rsIDs only
const invalidRsids = ref([])     // rsid mode — tokens that didn't parse as an rsID
const rsidInputCount = ref(0)    // rsid mode — total lines attempted, for the ratio warning
const parseError = ref('')

const jobId = ref(null)
const jobStatus = ref(null)
const result = ref(null)
const submitError = ref('')
let pollTimer = null

const isRunning = computed(() => jobStatus.value && ['queued', 'running'].includes(jobStatus.value.status))

function handleDrop(e) {
  isDragging.value = false
  const f = e.dataTransfer.files[0]
  if (f) file.value = f
}
function handleFileSelect(e) {
  file.value = e.target.files[0] || null
}
function clearFile() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
}

// Single column-order convention, used identically for VCF FILE content and
// PASTED text: CHROM POS ID REF ALT — the real VCF column order. Previously
// the paste mode used a different order (chrom pos ref alt rsid), which is
// the exact bug that produced allele values ("A", "G,GTACT") showing up in
// the rsID column of a real report. One parser, one convention, used by both
// modes, removes the class of bug rather than just this one instance of it.
function parseVariantText(text) {
  const variants = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const fields = line.split(/\s+/)
    if (fields.length < 4) continue
    const [chrom, posStr, maybeIdOrRef, ...rest] = fields
    // 5 fields = CHROM POS ID REF ALT; 4 fields = CHROM POS REF ALT (no ID)
    let id, ref, altField
    if (fields.length >= 5) {
      [, , id, ref, altField] = fields
    } else {
      id = null
      ;[ref, altField] = [maybeIdOrRef, rest[0]]
    }
    const pos = parseInt(posStr, 10)
    if (!chrom || isNaN(pos) || !ref || !altField) continue
    for (const alt of altField.split(',')) {
      if (alt === '.' || !alt) continue
      variants.push({ chrom, pos, ref, alt, rsid: (id && id !== '.') ? id : null })
    }
  }
  return variants
}

// Mirrors batch_api.py's HEADER_LIKE_PATTERN/RSID_COLUMN_NAMES/filter_valid_rsids
// exactly, so what the preview shows is what the backend will actually do
// with the same input — this file just needs to agree, not reinvent.
const HEADER_LIKE_PATTERN = /^(unnamed:?\s*\d*|index|rsid|rs_id|id)$/i
const RSID_COLUMN_NAMES = new Set(['rsid', 'rs id', 'snp', 'snp id', 'variant id', 'id'])
const RSID_PATTERN = /^rs\d+$/i

function parseRsidText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  let rsidCol = 0
  const firstFields = lines[0].split(',')
  if (firstFields.length > 1) {
    const idx = firstFields.findIndex(f => RSID_COLUMN_NAMES.has(f.trim().toLowerCase().replace(/_/g, ' ')))
    if (idx !== -1) rsidCol = idx
  }

  const out = []
  for (const line of lines) {
    const fields = line.split(',')
    if (rsidCol >= fields.length) continue
    out.push(fields[rsidCol].trim())
  }
  return out
}

/**
 * Filters raw tokens into { valid, invalid } instead of rejecting the whole
 * list on the first bad one — a single stray row or a pandas index artifact
 * ("Unnamed: 0") shouldn't block a 150k-row upload. Case-insensitive dedup.
 */
function filterValidRsids(raw) {
  const valid = [], invalid = [], seen = new Set()
  for (let r of raw) {
    r = (r || '').trim()
    if (!r || HEADER_LIKE_PATTERN.test(r)) continue
    if (RSID_PATTERN.test(r)) {
      const key = r.toLowerCase()
      if (!seen.has(key)) { seen.add(key); valid.push(key) }
    } else {
      invalid.push(r)
    }
  }
  return { valid, invalid }
}

async function readFileText(f) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(f)
  })
}

async function goToPreview() {
  parseError.value = ''
  submitError.value = ''

  let text = ''
  if (inputMode.value === 'paste') {
    text = pastedText.value
  } else if (file.value) {
    try {
      text = await readFileText(file.value)
    } catch (e) {
      parseError.value = 'Could not read the selected file.'
      return
    }
  } else {
    return
  }

  if (inputMode.value === 'rsid') {
    const rawTokens = parseRsidText(text)
    const { valid, invalid } = filterValidRsids(rawTokens)
    rsidInputCount.value = rawTokens.length
    parsedRsids.value = valid
    invalidRsids.value = invalid
    if (valid.length === 0) {
      parseError.value = `None of the ${rawTokens.length} lines looked like an rsID (expected format: rs1234567). ` +
        `This might be the wrong file for this tab — try "Upload VCF" if this file has chrom/pos columns instead.`
      return
    }
  } else {
    parsedVariants.value = parseVariantText(text)
    if (parsedVariants.value.length === 0) {
      parseError.value = inputMode.value === 'file'
        ? 'No variant records found. Expected VCF columns: CHROM POS ID REF ALT.'
        : 'No valid variant lines found. Expected one per line: chrom pos id ref alt (id may be "." or omitted).'
      return
    }
  }
  stage.value = 'preview'
}

function backToInput() {
  stage.value = 'input'
}

async function confirmAndRun() {
  submitError.value = ''
  let resp
  try {
    if (inputMode.value === 'rsid') {
      resp = await fetch(`${API_BASE}/api/v2/batch/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsids: parsedRsids.value })
      })
    } else {
      resp = await fetch(`${API_BASE}/api/v2/batch/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants: parsedVariants.value })
      })
    }
  } catch (e) {
    submitError.value = 'Could not reach the server. Is the backend running?'
    return
  }

  const data = await resp.json()
  if (!resp.ok) {
    submitError.value = data.error || 'Upload failed.'
    if (data.details) {
      submitError.value += ' ' + data.details.map(d => `${d.loc.join('.')}: ${d.msg}`).join('; ')
    }
    return
  }

  jobId.value = data.job_id
  stage.value = 'running'
  startPolling()
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/v2/batch/${jobId.value}/status`)
      const data = await resp.json()
      jobStatus.value = data
      if (data.status === 'done') {
        stopPolling()
        await fetchResult()
        stage.value = 'result'
      } else if (data.status === 'error') {
        stopPolling()
      }
    } catch (e) {
      console.error('Status poll failed:', e)
    }
  }, 1500)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
onBeforeUnmount(stopPolling)

async function fetchResult() {
  const resp = await fetch(`${API_BASE}/api/v2/batch/${jobId.value}/result`)
  result.value = await resp.json()
}

function downloadCsv() {
  window.open(`${API_BASE}/api/v2/batch/${jobId.value}/export.csv`, '_blank')
}

function reset() {
  file.value = null
  pastedText.value = ''
  parsedVariants.value = []
  parsedRsids.value = []
  invalidRsids.value = []
  rsidInputCount.value = 0
  jobId.value = null
  jobStatus.value = null
  result.value = null
  submitError.value = ''
  parseError.value = ''
  stage.value = 'input'
  stopPolling()
}

function openRow(row) {
  detailStore.openBatch(row, jobId.value)
}

const rsidInvalidRatio = computed(() =>
  rsidInputCount.value > 0 ? invalidRsids.value.length / rsidInputCount.value : 0
)
// Past this, it's likely the wrong file/tab rather than a few stray rows —
// shown as a loud warning, but per product decision the Run button stays
// enabled regardless: if there's at least one valid rsID, the user can
// still choose to proceed with just that remainder.
const HIGH_INVALID_RATIO_THRESHOLD = 0.5

const priorityBadgeClass = (score) =>
  score >= 70 ? 'bg-red-100 text-red-800'
  : score >= 40 ? 'bg-orange-100 text-orange-800'
  : 'bg-slate-100 text-slate-600'

const stageLabel = computed(() => {
  if (!jobStatus.value) return ''
  const pct = Math.round((jobStatus.value.progress || 0) * 100)
  return `${jobStatus.value.stage} (${pct}%)`
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">

      <!-- Header -->
      <div class="bg-slate-900 px-8 py-10 text-white relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-indigo-600 to-cyan-500 opacity-20"></div>
        <h2 class="text-3xl font-bold tracking-tight relative z-10 flex items-center gap-3">
          <span class="text-4xl">📋</span> Batch Variant Report
        </h2>
        <p class="mt-4 text-slate-300 text-lg relative z-10 max-w-2xl">
          Upload a VCF (or paste a variant list) to annotate, score, and rank thousands of variants at once —
          joined by genomic position, so rsIDs are optional.
        </p>
      </div>

      <div class="p-8 lg:p-12 space-y-8">

        <!-- ── Input stage ─────────────────────────────────────────────── -->
        <template v-if="stage === 'input'">

          <div class="flex gap-2 border-b border-slate-200">
            <button @click="inputMode = 'file'"
              :class="['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                inputMode === 'file' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600']">
              Upload VCF
            </button>
            <button @click="inputMode = 'rsid'"
              :class="['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                inputMode === 'rsid' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600']">
              Upload rsID list (CSV/TXT)
            </button>
            <button @click="inputMode = 'paste'"
              :class="['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                inputMode === 'paste' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600']">
              Paste variant list
            </button>
          </div>

          <!-- File upload: VCF or rsID CSV, same widget, label/hint changes with mode -->
          <div v-if="inputMode === 'file' || inputMode === 'rsid'">
            <div
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
              :class="[
                'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors group cursor-pointer',
                isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'
              ]"
              @click="!file && $refs.fileInput.click()"
            >
              <input type="file" ref="fileInput" class="hidden" @change="handleFileSelect"
                :accept="inputMode === 'rsid' ? '.csv,.txt' : '.vcf,.txt'" />

              <template v-if="!file">
                <div class="h-16 w-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <ArrowUpTrayIcon class="w-8 h-8" />
                </div>
                <p class="text-slate-600 font-medium text-lg">
                  Drop {{ inputMode === 'rsid' ? 'an rsID CSV/TXT file' : 'a VCF file' }} here
                </p>
                <p class="text-slate-400 mt-2">or <span class="text-indigo-600 hover:text-indigo-700 font-semibold">browse files</span></p>
                <p class="text-xs text-slate-400 mt-4">
                  {{ inputMode === 'rsid'
                    ? 'One rsID per line, or the first column of a CSV — a header row like "rsid" is fine and skipped'
                    : '.vcf — CHROM/POS/ID/REF/ALT columns required; INFO/FORMAT are ignored' }}
                </p>
              </template>

              <template v-else>
                <div class="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm w-full max-w-md" @click.stop>
                  <div class="h-10 w-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <DocumentTextIcon class="w-6 h-6" />
                  </div>
                  <div class="flex-1 text-left overflow-hidden">
                    <p class="font-medium text-slate-800 truncate">{{ file.name }}</p>
                    <p class="text-xs text-slate-400">{{ (file.size / 1024).toFixed(1) }} KB</p>
                  </div>
                  <button @click="clearFile" class="text-slate-400 hover:text-red-500">
                    <XMarkIcon class="w-5 h-5" />
                  </button>
                </div>
              </template>
            </div>
          </div>

          <!-- Paste list -->
          <div v-else>
            <label class="block text-sm font-medium text-slate-700 mb-2">
              One variant per line, VCF column order: <code class="text-xs bg-slate-100 px-1.5 py-0.5 rounded">chrom pos id ref alt</code>
              <span class="text-slate-400 font-normal">(id may be "." or omitted)</span>
            </label>
            <textarea
              v-model="pastedText"
              rows="8"
              placeholder="chr17 43094692 rs80357382 G A&#10;chr2 100 . C T"
              class="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono text-sm p-4 bg-slate-50 placeholder-slate-400"
            />
          </div>

          <p v-if="parseError" class="text-sm text-red-600 flex items-center gap-2">
            <ExclamationTriangleIcon class="w-4 h-4 flex-shrink-0" /> {{ parseError }}
          </p>

          <button
            @click="goToPreview"
            :disabled="(inputMode !== 'paste' && !file) || (inputMode === 'paste' && !pastedText.trim())"
            class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors text-lg"
          >
            Preview
          </button>
        </template>

        <!-- ── Preview / confirm stage ─────────────────────────────────── -->
        <template v-else-if="stage === 'preview'">
          <div>
            <button @click="backToInput" class="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeftIcon class="w-4 h-4" /> Back
            </button>

            <template v-if="inputMode === 'rsid'">
              <!-- Loud warning: most of the file didn't parse as rsIDs — likely wrong file or wrong tab -->
              <div v-if="rsidInvalidRatio >= HIGH_INVALID_RATIO_THRESHOLD"
                class="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
                <ExclamationTriangleIcon class="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>{{ invalidRsids.length.toLocaleString() }} of {{ rsidInputCount.toLocaleString() }}</strong>
                  lines didn't look like an rsID. This usually means the wrong file was picked, or the rsID is in a
                  different column than expected — if this file has chrom/pos/ref/alt columns, try the
                  "Upload VCF" tab instead. Examples of what didn't parse:
                  <span class="font-mono text-xs">{{ invalidRsids.slice(0, 5).join(', ') }}</span>
                </span>
              </div>

              <p class="text-slate-700">
                Parsed <span class="font-bold">{{ parsedRsids.length.toLocaleString() }}</span> valid rsIDs
                <span v-if="invalidRsids.length" class="text-slate-400 font-normal">
                  ({{ invalidRsids.length.toLocaleString() }} line{{ invalidRsids.length > 1 ? 's' : '' }} ignored — not rsID-shaped)
                </span>. First 5:
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <span v-for="r in parsedRsids.slice(0, 5)" :key="r"
                  class="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{{ r }}</span>
                <span v-if="parsedRsids.length > 5" class="text-xs text-slate-400 self-center">
                  + {{ (parsedRsids.length - 5).toLocaleString() }} more
                </span>
              </div>

              <!-- Quiet footnote for the common case: a few stray tokens, not worth a loud banner -->
              <p v-if="invalidRsids.length && rsidInvalidRatio < HIGH_INVALID_RATIO_THRESHOLD"
                class="text-xs text-slate-400 mt-3">
                Ignored, not rsID-shaped: <span class="font-mono">{{ invalidRsids.slice(0, 10).join(', ') }}</span>
                <span v-if="invalidRsids.length > 10">, + {{ invalidRsids.length - 10 }} more</span>
              </p>
            </template>

            <template v-else>
              <p class="text-slate-700">
                Parsed <span class="font-bold">{{ parsedVariants.length.toLocaleString() }}</span> variants. First 5:
              </p>
              <div class="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="bg-slate-50 text-slate-500">
                      <th class="text-left font-medium py-2 px-3">Chrom</th>
                      <th class="text-left font-medium py-2 px-3">Pos</th>
                      <th class="text-left font-medium py-2 px-3">Ref</th>
                      <th class="text-left font-medium py-2 px-3">Alt</th>
                      <th class="text-left font-medium py-2 px-3">rsID</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(v, i) in parsedVariants.slice(0, 5)" :key="i" class="border-t border-slate-100">
                      <td class="py-2 px-3 font-mono">{{ v.chrom }}</td>
                      <td class="py-2 px-3 font-mono">{{ v.pos.toLocaleString() }}</td>
                      <td class="py-2 px-3 font-mono">{{ v.ref }}</td>
                      <td class="py-2 px-3 font-mono">{{ v.alt }}</td>
                      <td class="py-2 px-3 font-mono text-slate-400">{{ v.rsid || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="parsedVariants.length > 5" class="text-xs text-slate-400 mt-2">
                + {{ (parsedVariants.length - 5).toLocaleString() }} more not shown
              </p>
            </template>

            <p class="text-sm text-slate-500 mt-4">
              Does this look right? If the columns look shifted (e.g. allele letters where the rsID should be),
              go back and check the input format above.
            </p>

            <p v-if="submitError" class="text-sm text-red-600 flex items-center gap-2 mt-3">
              <ExclamationTriangleIcon class="w-4 h-4 flex-shrink-0" /> {{ submitError }}
            </p>

            <button
              @click="confirmAndRun"
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-lg mt-6"
            >
              Looks good — run batch analysis
            </button>
          </div>
        </template>

        <!-- ── Running ─────────────────────────────────────────────────── -->
        <template v-else-if="stage === 'running'">
          <div class="flex flex-col items-center justify-center py-16 gap-4">
            <ArrowPathIcon class="w-10 h-10 text-indigo-500 animate-spin" />
            <p class="text-lg font-medium text-slate-700">{{ stageLabel || 'Starting…' }}</p>
            <p class="text-sm text-slate-400">{{ jobStatus?.input_count?.toLocaleString() }} variants submitted</p>
            <div class="w-full max-w-md bg-slate-100 rounded-full h-2 overflow-hidden">
              <div class="bg-indigo-500 h-full transition-all duration-300"
                :style="`width: ${Math.round((jobStatus?.progress || 0) * 100)}%`" />
            </div>
            <p v-if="jobStatus?.status === 'error'" class="text-red-600 text-sm mt-2">
              {{ jobStatus.error_message }}
            </p>
          </div>
        </template>

        <!-- ── Results ─────────────────────────────────────────────────── -->
        <template v-else-if="stage === 'result' && result">

          <div class="flex justify-between items-start flex-wrap gap-4">
            <div class="grid grid-cols-3 gap-4 flex-1 min-w-[300px]">
              <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p class="text-2xl font-bold text-slate-900">{{ result.total.toLocaleString() }}</p>
                <p class="text-xs text-slate-500 mt-1">Variants processed</p>
              </div>
              <div class="bg-red-50 rounded-xl p-4 border border-red-100">
                <p class="text-2xl font-bold text-red-700">{{ result.high_priority_count.toLocaleString() }}</p>
                <p class="text-xs text-slate-500 mt-1">High priority (≥70)</p>
              </div>
              <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p class="text-2xl font-bold text-slate-500">{{ result.unresolved_count.toLocaleString() }}</p>
                <p class="text-xs text-slate-500 mt-1">No annotation found</p>
              </div>
            </div>
            <div class="flex gap-2">
              <button @click="downloadCsv"
                class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
                <ArrowDownTrayIcon class="w-4 h-4" /> Export CSV
              </button>
              <button @click="reset"
                class="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700">
                New Analysis
              </button>
            </div>
          </div>

          <!-- Unresolved rsIDs (rsID-mode uploads only) -->
          <div v-if="result.unresolved_rsids?.length"
            class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <ExclamationTriangleIcon class="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {{ result.unresolved_rsids.length }} rsID{{ result.unresolved_rsids.length > 1 ? 's were' : ' was' }}
              not found in the local reference databases and {{ result.unresolved_rsids.length > 1 ? 'were' : 'was' }} skipped:
              <span class="font-mono text-xs">{{ result.unresolved_rsids.slice(0, 10).join(', ') }}</span>
              <span v-if="result.unresolved_rsids.length > 10">, + {{ result.unresolved_rsids.length - 10 }} more</span>
            </span>
          </div>

          <!-- Gene summary -->
          <div v-if="result.gene_summary.length">
            <h3 class="text-sm font-bold text-slate-900 mb-3">Genes by highest priority variant</h3>
            <div class="flex flex-wrap gap-2">
              <div v-for="g in result.gene_summary.slice(0, 20)" :key="g.gene"
                class="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-3 pr-1 py-1">
                <span class="text-sm font-medium text-slate-700">{{ g.gene }}</span>
                <span class="text-xs text-slate-400">{{ g.variant_count }} var</span>
                <span :class="[priorityBadgeClass(g.max_priority), 'text-xs font-semibold px-2 py-0.5 rounded-full']">
                  {{ g.max_priority }}
                </span>
              </div>
            </div>
          </div>

          <!-- Leaderboard -->
          <div>
            <h3 class="text-sm font-bold text-slate-900 mb-3">Top priority variants</h3>
            <div class="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-slate-50 text-slate-500">
                    <th class="text-left font-medium py-2 px-3">rsID</th>
                    <th class="text-left font-medium py-2 px-3">Gene</th>
                    <th class="text-left font-medium py-2 px-3">Chr:Pos</th>
                    <th class="text-left font-medium py-2 px-3">ClinVar</th>
                    <th class="text-right font-medium py-2 px-3">CADD</th>
                    <th class="text-right font-medium py-2 px-3">MAF</th>
                    <th class="text-left font-medium py-2 px-3">Flags</th>
                    <th class="text-right font-medium py-2 px-3">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in result.leaderboard" :key="`${row.chrom}-${row.pos}-${row.alt}`"
                    class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" @click="openRow(row)">
                    <td class="py-2 px-3 text-indigo-600 font-medium">{{ row.rsid || '—' }}</td>
                    <td class="py-2 px-3 text-slate-700">{{ row.gene || '—' }}</td>
                    <td class="py-2 px-3 text-slate-500">{{ row.chrom }}:{{ row.pos?.toLocaleString() }}</td>
                    <td class="py-2 px-3 text-slate-600">
                      {{ row.clinvar_sig ? row.clinvar_sig.replace(/_/g, ' ') : 'Unknown' }}
                      <span v-if="row.clinvar_conflicting" class="text-orange-500" title="Conflicting classifications">⚠</span>
                    </td>
                    <td class="py-2 px-3 text-right text-slate-600">{{ row.cadd ?? '—' }}</td>
                    <td class="py-2 px-3 text-right text-slate-500">
                      {{ row.maf != null ? row.maf.toExponential(1) : 'unknown' }}
                    </td>
                    <td class="py-2 px-3 text-slate-400">
                      <span v-if="row.allele_mismatch" title="Reference/alt allele differs from database record">allele mismatch</span>
                    </td>
                    <td class="py-2 px-3 text-right">
                      <span :class="[priorityBadgeClass(row.priority), 'inline-block px-2 py-0.5 rounded text-[11px] font-semibold']">
                        {{ row.priority }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p class="text-xs text-slate-400">
            Priority score combines ClinVar classification, CADD, rarity, and predictor concordance —
            see the methodology note in the exported CSV. This is a triage aid, not a clinical classification;
            variants flagged "no annotation found" or with unknown MAF should be reviewed manually rather than
            treated as low priority by default.
          </p>

        </template>

      </div>
    </div>
  </div>
</template>