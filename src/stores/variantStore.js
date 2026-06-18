// =============================================================================
// src/stores/variantStore.js  — full replacement
//
// ROOT FIX for "filtered data not shown in GUI":
//   Added filteredVariants ref and applyLocalFilters() action.
//   VariantTable now reads filteredVariants instead of variants.
//   FilterPanel writes to filteredVariants via applyLocalFilters().
//   When no filter is active, filteredVariants === variants (full list).
// =============================================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { API_BASE } from '../config.js'
export const useVariantStore = defineStore('variant', () => {

  // --- Core State ---
  const variants        = ref([])   // raw, never mutated after load
  const filteredVariants = ref([])  // what the table shows; equals variants when no filter active
  const missing         = ref([])
  const loading         = ref(false)
  const progress        = ref(0)
  const totalProcessed  = ref(0)

  // --- Filter state (kept here so FilterPanel + VariantTable stay in sync) ---
  const activeFilters = ref({
    clinical_significance: [],
    missing_databases:     [],
    present_databases:     [],
    maf_threshold:         null,
    genes:                 []
  })
  const activeFilterDescription = ref(null)  // plain-English label shown in chat header
  const isFiltered = computed(() =>
    activeFilters.value.clinical_significance.length > 0 ||
    activeFilters.value.missing_databases.length     > 0 ||
    activeFilters.value.present_databases.length     > 0 ||
    activeFilters.value.maf_threshold !== null            ||
    activeFilters.value.genes.length  > 0
  )

  // --- Chat State ---
  const chatHistory = ref([])
  const chatContexts = ref({
    all:        { variants: [], history: [], label: 'All Variants' },
    pathogenic: { variants: [], history: [], label: 'Pathogenic'   },
    missing:    { variants: [], history: [], label: 'Missing Data'  },
    custom:     { variants: [], history: [], label: 'Custom Filter' }
  })
  const activeContext = ref('all')

  // --- Agentic State ---
  const agenticResults = ref(null)
  const agenticLoading = ref(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getMaxMaf(variant) {
    const common = variant.payload?.data?.common || {}
    const vals = Object.entries(common)
      .filter(([k]) => k.endsWith('_MAF') || k.startsWith('freq_'))
      .map(([, v]) => parseFloat(v))
      .filter(n => !isNaN(n))
    return vals.length ? Math.max(...vals) : 1.0
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function clearResults() {
    variants.value         = []
    filteredVariants.value = []
    missing.value          = []
    progress.value         = 0
    totalProcessed.value   = 0
    chatHistory.value      = []
    activeFilterDescription.value = null
    activeFilters.value = {
      clinical_significance: [],
      missing_databases:     [],
      present_databases:     [],
      maf_threshold:         null,
      genes:                 []
    }
    Object.keys(chatContexts.value).forEach(k => {
      chatContexts.value[k].variants = []
      chatContexts.value[k].history  = []
    })
  }

  /**
   * applyLocalFilters — runs client-side, updates filteredVariants immediately.
   * Call this whenever the user changes a checkbox or the smart filter returns.
   *
   * @param {Object} filters  — same shape as activeFilters
   * @param {string} description — plain-English description (optional)
   */
  function applyLocalFilters(filters, description = null) {
    activeFilters.value = { ...filters }
    activeFilterDescription.value = description

    let result = [...variants.value]

    // Clinical significance
    if (filters.clinical_significance?.length > 0) {
      const sigs = filters.clinical_significance.map(s => s.toLowerCase())
      result = result.filter(v => {
        const sig = (v.payload?.data?.clinvar?.ucscNotes || '').toLowerCase()
        return sigs.some(s => sig.includes(s))
      })
    }

    // Missing databases
    if (filters.missing_databases?.length > 0) {
      result = result.filter(v => {
        const sources = v.payload?.sources_found || []
        return filters.missing_databases.some(db => !sources.includes(db))
      })
    }

    // Present databases
    if (filters.present_databases?.length > 0) {
      result = result.filter(v => {
        const sources = v.payload?.sources_found || []
        return filters.present_databases.every(db => sources.includes(db))
      })
    }

    // MAF threshold (upper bound)
    if (filters.maf_threshold !== null && filters.maf_threshold !== undefined) {
      const threshold = parseFloat(filters.maf_threshold)
      if (!isNaN(threshold)) {
        result = result.filter(v => getMaxMaf(v) < threshold)
      }
    }

    // Gene list
    if (filters.genes?.length > 0) {
      const geneSet = new Set(filters.genes.map(g => g.toUpperCase()))
      result = result.filter(v =>
        (v.payload?.data?.genes || []).some(g => geneSet.has(g.toUpperCase()))
      )
    }

    filteredVariants.value = result

    // Mirror into custom chat context
    chatContexts.value.custom.variants = result
  }

  /**
   * clearFilters — reset to showing all variants
   */
  function clearFilters() {
    activeFilters.value = {
      clinical_significance: [],
      missing_databases:     [],
      present_databases:     [],
      maf_threshold:         null,
      genes:                 []
    }
    activeFilterDescription.value = null
    filteredVariants.value = [...variants.value]
    chatContexts.value.custom.variants = []
  }

  // ── Streaming analysis ────────────────────────────────────────────────────

  function updateChatContexts() {
    chatContexts.value.all.variants = variants.value

    chatContexts.value.pathogenic.variants = variants.value.filter(v => {
      const sig = (v.payload?.data?.clinvar?.ucscNotes || '').toLowerCase()
      return sig.includes('pathogenic') && !sig.includes('benign')
    })

    chatContexts.value.missing.variants = variants.value.filter(v =>
      (v.payload?.sources_found || []).length < 3
    )
    // custom: managed by applyLocalFilters / FilterPanel
  }

  async function analyzeVariants(allIds) {
    clearResults()
    loading.value = true

    const CHUNK_SIZE = 200
    const total = allIds.length

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = allIds.slice(i, i + CHUNK_SIZE)
      try {
        await processChunk(chunk)
        totalProcessed.value += chunk.length
        progress.value = Math.min(100, Math.round((totalProcessed.value / total) * 100))
      } catch (err) {
        console.error(`Error processing chunk ${i}-${i + CHUNK_SIZE}`, err)
      }
    }

    loading.value = false
    progress.value = 100

    // After load: filteredVariants starts as the full set
    filteredVariants.value = [...variants.value]
    updateChatContexts() 
  }

  async function processChunk(rsIdList) {
    const response = await fetch(`${API_BASE}/api/stream_analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rs_id_list: rsIdList })
    })

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            handleStreamEvent(JSON.parse(line.replace('data: ', '')))
          } catch (e) {
            console.error('Stream parse error:', e)
          }
        }
      }
    }
  }

  function handleStreamEvent(event) {
    switch (event.type) {
      case 'variant_found':
        variants.value.push(event)
        filteredVariants.value.push(event)  // keep in sync during streaming
        break
      case 'variant_missing':
        missing.value.push(event.rsid)
        break
    }
  }

  // ── Agentic search ────────────────────────────────────────────────────────

  async function performAgenticSearch(file, query) {
    agenticLoading.value  = true
    agenticResults.value  = null

    const formData = new FormData()
    formData.append('file', file)
    formData.append('query', query)

    try {
      const response = await fetch(`${API_BASE}/api/agentic/analyze`, {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      if (data.status === 'success') {
        agenticResults.value = data.data
      } else {
        throw new Error(data.message || 'Agentic search failed')
      }
    } catch (error) {
      console.error('Agentic search failed:', error)
      throw error
    } finally {
      agenticLoading.value = false
    }
  }

  // ── Expose ────────────────────────────────────────────────────────────────
  return {
    variants,
    filteredVariants,
    missing,
    loading,
    progress,
    totalProcessed,
    isFiltered,
    activeFilters,
    activeFilterDescription,

    chatHistory,
    chatContexts,
    activeContext,

    agenticResults,
    agenticLoading,

    analyzeVariants,
    applyLocalFilters,
    clearFilters,
    clearResults,
    updateChatContexts,
    performAgenticSearch
  }
})