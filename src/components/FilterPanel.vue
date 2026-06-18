<script setup>
import { API_BASE } from '../config.js'
import { ref, computed } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import {
  FunnelIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  ArrowPathIcon
} from '@heroicons/vue/24/outline'

const store = useVariantStore()
const showFilters = ref(false)
const nlQuery = ref('')
const nlLoading = ref(false)
const nlError = ref('')

// Mirror the store's activeFilters so checkboxes stay in sync
const filters = ref({
  clinical_significance: [],
  missing_databases:     [],
  present_databases:     [],
  maf_threshold:         null,
  genes:                 ''
})

// Export fields — updated by smart filter, sensible default otherwise
const exportFields = ref([
  'rsid', 'chrom', 'position', 'clinical_significance', 'genes', 'maf',
  'databases_found', 'missing_databases'
])

const clinicalOptions = ['Pathogenic', 'Likely pathogenic', 'Uncertain significance', 'Likely benign', 'Benign']
const databaseOptions = ['dbSNP', 'ClinVar', 'dbNSFP']

// ── Natural language quick filter ────────────────────────────────────────────
const applyNaturalFilter = async () => {
  if (!nlQuery.value.trim()) return
  if (store.variants.length === 0) { nlError.value = 'Load some variants first.'; return }

  nlLoading.value = true
  nlError.value = ''

  try {
    const response = await fetch(`${API_BASE}/api/smart_filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: nlQuery.value,
        variants: store.variants
      })
    })

    const data = await response.json()
    if (data.status !== 'success') throw new Error(data.message || 'Filter failed')

    const { filter_plan, export_fields, filter_description, chat_focus } = data.data

    // 1. Populate checkboxes
    filters.value.clinical_significance = filter_plan.clinical_significance || []
    filters.value.missing_databases     = filter_plan.missing_databases     || []
    filters.value.present_databases     = filter_plan.present_databases     || []
    filters.value.maf_threshold         = filter_plan.maf_threshold         || null
    filters.value.genes                 = (filter_plan.genes || []).join(', ')

    // 2. Apply immediately to the table via the store (client-side)
    commitFilters(filter_description)

    // 3. Update recommended export columns
    exportFields.value = export_fields || exportFields.value

    // 4. Switch chat context to whatever the LLM suggested
    store.activeContext = chat_focus || 'custom'
    store.chatContexts.custom.history.push({
      role: 'assistant',
      content: `✓ Smart filter applied: "${filter_description}"\n${store.filteredVariants.length} of ${store.variants.length} variants match.`
    })

    showFilters.value = true

  } catch (err) {
    console.error('Smart filter error:', err)
    nlError.value = err.message || 'Something went wrong. Try rephrasing.'
  } finally {
    nlLoading.value = false
  }
}

// ── Commit current filter state to the store ─────────────────────────────────
// Called both by smart filter and by manual checkbox changes
const commitFilters = (description = null) => {
  const geneList = filters.value.genes
    ? filters.value.genes.split(',').map(g => g.trim()).filter(Boolean)
    : []

  store.applyLocalFilters(
    {
      clinical_significance: filters.value.clinical_significance,
      missing_databases:     filters.value.missing_databases,
      present_databases:     filters.value.present_databases,
      maf_threshold:         filters.value.maf_threshold,
      genes:                 geneList
    },
    description || store.activeFilterDescription  // preserve description if already set
  )
}

// ── Preview count (reads from store's filteredVariants, always accurate) ─────
const filteredCount = computed(() => store.filteredVariants.length)

// ── Export ────────────────────────────────────────────────────────────────────
const exportFiltered = async (format) => {
  try {
    const geneList = filters.value.genes
      ? filters.value.genes.split(',').map(g => g.trim()).filter(Boolean)
      : []

    const response = await fetch(`${API_BASE}/api/export_filtered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variants: store.variants,
        filters: { ...filters.value, genes: geneList },
        format,
        export_fields: exportFields.value
      })
    })

    const filename = `filtered_variants_${Date.now()}.${format}`
    if (format === 'csv') {
      downloadBlob(await response.blob(), filename)
    } else {
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' })
      downloadBlob(blob, filename)
    }
  } catch (error) {
    console.error('Export failed:', error)
    alert('Export failed. Please try again.')
  }
}

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  window.URL.revokeObjectURL(url)
}

// ── Send current filtered set to custom chat ─────────────────────────────────
const sendToCustomChat = () => {
  // filteredVariants is already up to date in the store — just switch context
  store.chatContexts.custom.variants = [...store.filteredVariants]
  store.activeContext = 'custom'
  store.chatContexts.custom.history.push({
    role: 'assistant',
    content: `✓ Loaded ${store.filteredVariants.length} filtered variants into Custom context.`
  })
}

// ── Clear ─────────────────────────────────────────────────────────────────────
const clearFilters = () => {
  filters.value = { clinical_significance: [], missing_databases: [], present_databases: [], maf_threshold: null, genes: '' }
  nlQuery.value = ''
  nlError.value = ''
  exportFields.value = ['rsid', 'chrom', 'position', 'clinical_significance', 'genes', 'maf', 'databases_found', 'missing_databases']
  store.clearFilters()
}

// ── Toggle helpers ────────────────────────────────────────────────────────────
const toggleClinicalSig = (sig) => {
  const idx = filters.value.clinical_significance.indexOf(sig)
  if (idx > -1) filters.value.clinical_significance.splice(idx, 1)
  else filters.value.clinical_significance.push(sig)
  commitFilters()
}

const toggleDatabase = (db, type) => {
  const key = type === 'missing' ? 'missing_databases' : 'present_databases'
  const idx = filters.value[key].indexOf(db)
  if (idx > -1) filters.value[key].splice(idx, 1)
  else filters.value[key].push(db)
  commitFilters()
}

const onMafChange = () => commitFilters()
const onGenesChange = () => commitFilters()

const hasActiveFilters = computed(() => store.isFiltered)
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">

    <!-- Header -->
    <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <FunnelIcon class="h-5 w-5 text-slate-600" />
        <h3 class="text-base font-semibold text-slate-900">Filter & Export</h3>
        <span v-if="hasActiveFilters" class="text-xs text-slate-500">
          ({{ filteredCount }} / {{ store.variants.length }} variants)
        </span>
      </div>
      <button @click="showFilters = !showFilters" class="text-sm text-gen-primary hover:text-indigo-700 font-medium">
        {{ showFilters ? 'Hide' : 'Show' }} Filters
      </button>
    </div>

    <!-- Natural language quick filter -->
    <div class="px-6 py-4 border-b border-slate-100 bg-indigo-50/40">
      <label class="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <SparklesIcon class="h-3.5 w-3.5 text-gen-primary" />
        Quick Filter (AI-powered)
      </label>
      <div class="flex gap-2">
        <input
          v-model="nlQuery"
          @keydown.enter="applyNaturalFilter"
          :disabled="nlLoading || store.variants.length === 0"
          type="text"
          placeholder="e.g. rare pathogenic variants in BRCA genes"
          class="flex-1 rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          @click="applyNaturalFilter"
          :disabled="nlLoading || !nlQuery.trim() || store.variants.length === 0"
          class="inline-flex items-center px-4 py-2 bg-gen-primary text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <ArrowPathIcon v-if="nlLoading" class="animate-spin h-4 w-4 mr-1.5" />
          <SparklesIcon v-else class="h-4 w-4 mr-1.5" />
          {{ nlLoading ? 'Thinking...' : 'Apply' }}
        </button>
      </div>
      <p v-if="nlError" class="text-xs text-red-600 mt-2">{{ nlError }}</p>
      <p v-if="store.activeFilterDescription && !nlError" class="text-xs text-indigo-700 mt-2">
        ✓ {{ store.activeFilterDescription }}
      </p>
      <p v-if="store.variants.length === 0" class="text-xs text-slate-400 mt-1">Load variants first.</p>
    </div>

    <!-- Manual filter controls -->
    <div v-if="showFilters" class="p-6 space-y-6">
      <p class="text-xs text-slate-400 -mt-2">Adjust manually or let Quick Filter populate these for you.</p>

      <!-- Clinical significance -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">Clinical Significance</label>
        <div class="flex flex-wrap gap-2">
          <button v-for="sig in clinicalOptions" :key="sig"
            @click="toggleClinicalSig(sig)"
            :class="['px-3 py-1.5 rounded-full text-sm border transition-colors',
              filters.clinical_significance.includes(sig)
                ? 'bg-gen-primary text-white border-gen-primary'
                : 'bg-white text-slate-600 border-slate-300 hover:border-gen-primary']">
            {{ sig }}
          </button>
        </div>
      </div>

      <!-- Database coverage -->
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">Missing From</label>
          <div class="space-y-2">
            <label v-for="db in databaseOptions" :key="db" class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" :checked="filters.missing_databases.includes(db)"
                @change="toggleDatabase(db, 'missing')"
                class="rounded border-slate-300 text-gen-primary focus:ring-gen-primary" />
              <span class="text-sm text-slate-700">{{ db }}</span>
            </label>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">Present In</label>
          <div class="space-y-2">
            <label v-for="db in databaseOptions" :key="db" class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" :checked="filters.present_databases.includes(db)"
                @change="toggleDatabase(db, 'present')"
                class="rounded border-slate-300 text-gen-primary focus:ring-gen-primary" />
              <span class="text-sm text-slate-700">{{ db }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- MAF threshold -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">Max MAF</label>
        <input v-model.number="filters.maf_threshold" @change="onMafChange"
          type="number" step="0.001" min="0" max="1"
          placeholder="e.g. 0.01 for variants <1%"
          class="block w-full rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm" />
      </div>

      <!-- Gene filter -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">Filter by Genes (comma-separated)</label>
        <input v-model="filters.genes" @change="onGenesChange"
          type="text" placeholder="APOE, BRCA1, TP53"
          class="block w-full rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm font-mono" />
      </div>

      <!-- Recommended export columns -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">
          Export columns
          <span class="font-normal text-slate-400 ml-1">(set by quick filter)</span>
        </label>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="field in exportFields" :key="field"
            class="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded font-mono">
            {{ field }}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex justify-between items-center pt-4 border-t border-slate-200">
        <button @click="clearFilters"
          class="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900">
          <XMarkIcon class="h-4 w-4 mr-2" />Clear All
        </button>
        <div class="flex gap-3">
          <button @click="sendToCustomChat" :disabled="store.filteredVariants.length === 0"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            <ChatBubbleLeftRightIcon class="h-4 w-4 mr-2" />Chat About Filtered
          </button>
          <button @click="exportFiltered('csv')" :disabled="store.filteredVariants.length === 0"
            class="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50">
            <ArrowDownTrayIcon class="h-4 w-4 mr-2" />Export CSV
          </button>
          <button @click="exportFiltered('json')" :disabled="store.filteredVariants.length === 0"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gen-primary hover:bg-indigo-700 disabled:opacity-50">
            <ArrowDownTrayIcon class="h-4 w-4 mr-2" />Export JSON
          </button>
        </div>
      </div>
    </div>

  </div>
</template>