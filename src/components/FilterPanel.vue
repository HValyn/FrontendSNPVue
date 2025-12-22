<script setup>
import { ref, computed } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { 
  FunnelIcon, 
  ArrowDownTrayIcon, 
  XMarkIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/vue/24/outline'

const store = useVariantStore()
const showFilters = ref(false)

// Filter state
const filters = ref({
  clinical_significance: [],
  missing_databases: [],
  present_databases: [],
  maf_threshold: null,
  genes: ''
})

// Available options
const clinicalOptions = [
  'Pathogenic',
  'Likely pathogenic',
  'Uncertain significance',
  'Likely benign',
  'Benign'
]

const databaseOptions = ['dbSNP', 'ClinVar', 'dbNSFP']

// Computed filtered count (approximate - actual filtering on backend)
const filteredCount = computed(() => {
  let count = store.variants.length
  
  if (filters.value.clinical_significance.length > 0) {
    count = store.variants.filter(v => {
      const sig = v.payload?.data?.clinvar?.ucscNotes || ''
      return filters.value.clinical_significance.some(s => 
        sig.toLowerCase().includes(s.toLowerCase())
      )
    }).length
  }
  
  return count
})

// Export functions
const exportFiltered = async (format) => {
  try {
    const response = await fetch('http://localhost:5000/api/export_filtered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variants: store.variants,
        filters: {
          ...filters.value,
          genes: filters.value.genes ? filters.value.genes.split(',').map(g => g.trim()) : []
        },
        format: format
      })
    })

    if (format === 'csv') {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `filtered_variants_${Date.now()}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } else {
      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `filtered_variants_${Date.now()}.json`
      a.click()
      window.URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error('Export failed:', error)
    alert('Export failed. Please try again.')
  }
}

// Send to custom chat context
const sendToCustomChat = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/export_filtered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variants: store.variants,
        filters: {
          ...filters.value,
          genes: filters.value.genes ? filters.value.genes.split(',').map(g => g.trim()) : []
        },
        format: 'json'
      })
    })

    const filtered = await response.json()
    
    // Update custom context
    store.chatContexts.custom.variants = filtered
    store.activeContext = 'custom'
    
    // Add system message
    store.chatContexts.custom.history.push({
      role: 'assistant',
      content: `✓ Loaded ${filtered.length} filtered variants into Custom context. You can now ask questions about this specific subset.`
    })
    
    alert(`${filtered.length} variants loaded into Custom chat context`)
  } catch (error) {
    console.error('Failed to load custom context:', error)
    alert('Failed to load custom context. Please try again.')
  }
}

const clearFilters = () => {
  filters.value = {
    clinical_significance: [],
    missing_databases: [],
    present_databases: [],
    maf_threshold: null,
    genes: ''
  }
}

const toggleClinicalSig = (sig) => {
  const idx = filters.value.clinical_significance.indexOf(sig)
  if (idx > -1) {
    filters.value.clinical_significance.splice(idx, 1)
  } else {
    filters.value.clinical_significance.push(sig)
  }
}

const toggleDatabase = (db, type) => {
  const filterKey = type === 'missing' ? 'missing_databases' : 'present_databases'
  const idx = filters.value[filterKey].indexOf(db)
  if (idx > -1) {
    filters.value[filterKey].splice(idx, 1)
  } else {
    filters.value[filterKey].push(db)
  }
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
    
    <!-- Header -->
    <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <FunnelIcon class="h-5 w-5 text-slate-600" />
        <h3 class="text-base font-semibold text-slate-900">Filter & Export</h3>
        <span v-if="filteredCount < store.variants.length" class="text-xs text-slate-500">
          ({{ filteredCount }} / {{ store.variants.length }} variants)
        </span>
      </div>
      <button 
        @click="showFilters = !showFilters"
        class="text-sm text-gen-primary hover:text-indigo-700 font-medium"
      >
        {{ showFilters ? 'Hide' : 'Show' }} Filters
      </button>
    </div>

    <!-- Filter Controls (Collapsible) -->
    <div v-if="showFilters" class="p-6 space-y-6">
      
      <!-- Clinical Significance Filter -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">
          Clinical Significance
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="sig in clinicalOptions"
            :key="sig"
            @click="toggleClinicalSig(sig)"
            :class="[
              'px-3 py-1.5 rounded-full text-sm border transition-colors',
              filters.clinical_significance.includes(sig)
                ? 'bg-gen-primary text-white border-gen-primary'
                : 'bg-white text-slate-600 border-slate-300 hover:border-gen-primary'
            ]"
          >
            {{ sig }}
          </button>
        </div>
      </div>

      <!-- Database Coverage Filter -->
      <div class="grid grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">
            Missing From
          </label>
          <div class="space-y-2">
            <label 
              v-for="db in databaseOptions" 
              :key="db"
              class="flex items-center gap-2 cursor-pointer"
            >
              <input 
                type="checkbox"
                :checked="filters.missing_databases.includes(db)"
                @change="toggleDatabase(db, 'missing')"
                class="rounded border-slate-300 text-gen-primary focus:ring-gen-primary"
              >
              <span class="text-sm text-slate-700">{{ db }}</span>
            </label>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">
            Present In
          </label>
          <div class="space-y-2">
            <label 
              v-for="db in databaseOptions" 
              :key="db"
              class="flex items-center gap-2 cursor-pointer"
            >
              <input 
                type="checkbox"
                :checked="filters.present_databases.includes(db)"
                @change="toggleDatabase(db, 'present')"
                class="rounded border-slate-300 text-gen-primary focus:ring-gen-primary"
              >
              <span class="text-sm text-slate-700">{{ db }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- MAF Threshold -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">
          Max MAF (for rare variants)
        </label>
        <input 
          v-model.number="filters.maf_threshold"
          type="number"
          step="0.001"
          min="0"
          max="1"
          placeholder="e.g., 0.01 for variants <1%"
          class="block w-full rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm"
        >
      </div>

      <!-- Gene Filter -->
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-2">
          Filter by Genes (comma-separated)
        </label>
        <input 
          v-model="filters.genes"
          type="text"
          placeholder="APOE, BRCA1, TP53"
          class="block w-full rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm font-mono"
        >
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-between items-center pt-4 border-t border-slate-200">
        <button
          @click="clearFilters"
          class="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <XMarkIcon class="h-4 w-4 mr-2" />
          Clear Filters
        </button>

        <div class="flex gap-3">
          <button
            @click="sendToCustomChat"
            :disabled="store.variants.length === 0"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            <ChatBubbleLeftRightIcon class="h-4 w-4 mr-2" />
            Chat About Filtered
          </button>
          <button
            @click="exportFiltered('csv')"
            :disabled="store.variants.length === 0"
            class="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowDownTrayIcon class="h-4 w-4 mr-2" />
            Export CSV
          </button>
          <button
            @click="exportFiltered('json')"
            :disabled="store.variants.length === 0"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gen-primary hover:bg-indigo-700 disabled:opacity-50"
          >
            <ArrowDownTrayIcon class="h-4 w-4 mr-2" />
            Export JSON
          </button>
        </div>
      </div>
    </div>

  </div>
</template>