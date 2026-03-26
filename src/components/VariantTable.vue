<script setup>
import { ref, computed, watch } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XMarkIcon,
  FunnelIcon
} from '@heroicons/vue/24/outline'

const store = useVariantStore()
const expandedRows = ref(new Set())

// --- Pagination ---
const currentPage = ref(1)
const pageSize = 50

// KEY FIX: read filteredVariants, not variants
const totalPages = computed(() => Math.ceil(store.filteredVariants.length / pageSize))

// Reset to page 1 whenever the filtered list changes
watch(() => store.filteredVariants.length, () => { currentPage.value = 1 })

const paginatedVariants = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return store.filteredVariants.slice(start, start + pageSize)
})

const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++ }
const prevPage = () => { if (currentPage.value > 1) currentPage.value-- }

// --- Row helpers ---
const toggleRow = (rsid) => {
  if (expandedRows.value.has(rsid)) expandedRows.value.delete(rsid)
  else expandedRows.value.add(rsid)
}

const getClinVarColor = (sig) => {
  if (!sig) return 'bg-slate-100 text-slate-600'
  const s = sig.toLowerCase()
  if (s.includes('pathogenic') && !s.includes('benign')) return 'bg-red-100 text-red-800'
  if (s.includes('benign'))                              return 'bg-green-100 text-green-800'
  return 'bg-yellow-100 text-yellow-800'
}

const getFrequencyData = (commonData) => {
  if (!commonData) return {}
  return Object.fromEntries(
    Object.entries(commonData).filter(([k, v]) =>
      (k.endsWith('_MAF') || k.startsWith('freq_')) && v !== null
    )
  )
}

const getMissingDatabases = (sourcesFound) => {
  return ['dbSNP', 'ClinVar', 'dbNSFP'].filter(db => !sourcesFound?.includes(db))
}

// Clear filter from the table header
const clearFilter = () => store.clearFilters()
</script>

<template>
  <div class="space-y-4">

    <!-- Filter active banner -->
    <div
      v-if="store.isFiltered"
      class="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5"
    >
      <div class="flex items-center gap-2 text-sm text-indigo-800">
        <FunnelIcon class="h-4 w-4 shrink-0" />
        <span>
          <span class="font-medium">Filter active</span>
          <span v-if="store.activeFilterDescription"> — {{ store.activeFilterDescription }}</span>
          <span class="ml-2 text-indigo-600 font-medium">
            {{ store.filteredVariants.length }} of {{ store.variants.length }} variants shown
          </span>
        </span>
      </div>
      <button
        @click="clearFilter"
        class="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-300 rounded px-2.5 py-1 hover:bg-indigo-100 transition-colors"
      >
        Clear filter
      </button>
    </div>

    <!-- Main table -->
    <div v-if="store.filteredVariants.length > 0" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-slate-900">Results</h3>
          <span class="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded">
            {{ store.filteredVariants.length }}
            <span v-if="store.isFiltered" class="text-indigo-500">
              / {{ store.variants.length }}
            </span>
          </span>
        </div>

        <div class="flex items-center gap-4 text-sm text-slate-600">
          <span>Page {{ currentPage }} of {{ totalPages }}</span>
          <div class="flex rounded-md shadow-sm">
            <button @click="prevPage" :disabled="currentPage === 1"
              class="px-2 py-1 border border-slate-300 rounded-l-md bg-white hover:bg-slate-50 disabled:opacity-50">
              <ChevronLeftIcon class="h-4 w-4" />
            </button>
            <button @click="nextPage" :disabled="currentPage === totalPages"
              class="px-2 py-1 border-t border-b border-r border-slate-300 rounded-r-md bg-white hover:bg-slate-50 disabled:opacity-50">
              <ChevronRightIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="w-10 px-6 py-3"></th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Variant</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Location</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Clinical Sig</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Database Coverage</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-slate-200">
            <template v-for="item in paginatedVariants" :key="item.rsid">

              <tr class="hover:bg-slate-50 transition-colors cursor-pointer" @click="toggleRow(item.rsid)">
                <td class="px-6 py-4">
                  <component :is="expandedRows.has(item.rsid) ? ChevronUpIcon : ChevronDownIcon" class="h-4 w-4 text-slate-400" />
                </td>
                <td class="px-6 py-4 font-medium text-gen-primary">{{ item.rsid }}</td>
                <td class="px-6 py-4 text-slate-600 font-mono text-xs">
                  <span v-if="item.payload?.data?.common">
                    {{ item.payload.data.common.chrom }}:{{ item.payload.data.common.chromStart }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <span
                    v-if="item.payload?.data?.clinvar"
                    :class="[getClinVarColor(item.payload.data.clinvar.ucscNotes), 'px-2 py-1 rounded-full text-xs font-medium']"
                  >
                    {{ item.payload.data.clinvar.ucscNotes }}
                  </span>
                  <span v-else class="text-slate-400 text-xs">—</span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="src in item.payload?.sources_found" :key="src"
                      class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs border border-green-300 flex items-center gap-1">
                      <CheckCircleIcon class="h-3 w-3" />{{ src }}
                    </span>
                    <span v-for="db in getMissingDatabases(item.payload?.sources_found)" :key="db"
                      class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs border border-red-300 flex items-center gap-1">
                      <XMarkIcon class="h-3 w-3" />{{ db }}
                    </span>
                  </div>
                </td>
              </tr>

              <!-- Expanded detail row -->
              <tr v-if="expandedRows.has(item.rsid)" class="bg-slate-50">
                <td colspan="5" class="px-8 py-6">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

                    <!-- Population frequencies -->
                    <div v-if="item.payload?.data?.common">
                      <h4 class="text-sm font-bold text-slate-900 mb-3">Population Frequencies (MAF)</h4>
                      <div class="grid grid-cols-2 gap-2">
                        <div v-for="(val, key) in getFrequencyData(item.payload.data.common)" :key="key"
                          class="flex justify-between text-xs bg-white p-2 rounded border border-slate-200">
                          <span class="text-slate-500">{{ key.replace('_MAF', '').replace('freq_', '') }}</span>
                          <span class="font-mono font-medium">{{ val }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Genes -->
                    <div v-if="item.payload?.data?.genes?.length > 0">
                      <h4 class="text-sm font-bold text-slate-900 mb-3">Associated Genes</h4>
                      <div class="flex flex-wrap gap-2">
                        <span v-for="gene in item.payload.data.genes" :key="gene"
                          class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                          {{ gene }}
                        </span>
                      </div>
                    </div>

                    <!-- Functional predictions -->
                    <div v-if="item.payload?.data?.functional" class="md:col-span-2">
                      <h4 class="text-sm font-bold text-slate-900 mb-3">Functional Predictions</h4>
                      <div class="bg-white p-4 rounded border border-slate-200">
                        <pre class="text-xs text-slate-600 overflow-x-auto">{{ JSON.stringify(item.payload.data.functional, null, 2) }}</pre>
                      </div>
                    </div>

                  </div>
                </td>
              </tr>

            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty state when filter returns nothing -->
    <div
      v-else-if="store.variants.length > 0 && store.isFiltered"
      class="bg-white rounded-xl border border-slate-200 p-12 text-center"
    >
      <FunnelIcon class="h-10 w-10 text-slate-300 mx-auto mb-3" />
      <p class="text-slate-600 font-medium">No variants match the current filter</p>
      <p class="text-slate-400 text-sm mt-1">
        {{ store.variants.length }} variants loaded — try relaxing the filter criteria
      </p>
      <button @click="clearFilter" class="mt-4 text-sm text-gen-primary hover:text-indigo-700 font-medium">
        Clear filter
      </button>
    </div>

  </div>
</template>