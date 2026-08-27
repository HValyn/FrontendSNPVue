<script setup>
import { ref, computed, watch } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { useVariantDetailStore } from '../stores/variantDetailStore'
import { API_BASE } from '../config.js'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XMarkIcon,
  FunnelIcon
} from '@heroicons/vue/24/outline'

const store = useVariantStore()
const detailStore = useVariantDetailStore()

// Priority scores, keyed by rsid. Sourced from the same /api/viz_data
// endpoint VizPanel uses (which computes them server-side via
// variant_scoring.py) — fetched here too, separately, rather than
// duplicating the scoring formula in JS. A future refactor could lift this
// into the store so both components share one fetch; kept local for now to
// avoid touching VizPanel's already-tested fetch logic.
const priorityByRsid = ref({})
async function fetchPriorityScores() {
  if (store.variants.length === 0) { priorityByRsid.value = {}; return }
  try {
    const resp = await fetch(`${API_BASE}/api/viz_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variants: store.variants })
    })
    const data = await resp.json()
    const map = {}
    for (const row of (data.manhattan_data || [])) map[row.rsid] = row.priority
    priorityByRsid.value = map
  } catch (e) {
    console.error('Failed to load priority scores for table:', e)
  }
}
watch(() => store.loading, (isLoading) => {
  if (!isLoading && store.variants.length > 0) fetchPriorityScores()
})

// --- Pagination ---
const currentPage = ref(1)
const pageSize = 50
const totalPages = computed(() => Math.ceil(store.filteredVariants.length / pageSize))
watch(() => store.filteredVariants.length, () => { currentPage.value = 1 })
const paginatedVariants = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return store.filteredVariants.slice(start, start + pageSize)
})
const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++ }
const prevPage = () => { if (currentPage.value > 1) currentPage.value-- }

// Click a row to open the shared detail drawer — same component/behavior as
// the leaderboard views elsewhere, so there's one consistent way to drill
// into a variant regardless of which screen you're on. Replaces the old
// inline-expand row (which duplicated significance/functional-score display
// logic that now lives once in variantDetailAdapters.js + VariantDetail.vue,
// and had the raw-multi-transcript overflow bug that logic fixes).
const openDetail = (item) => detailStore.openLookup(item)

const getClinVarColor = (sig) => {
  if (!sig) return 'bg-slate-100 text-slate-600'
  const s = sig.toLowerCase()
  if (s.includes('pathogenic') && !s.includes('benign')) return 'bg-red-100 text-red-800'
  if (s.includes('benign'))                              return 'bg-green-100 text-green-800'
  return 'bg-yellow-100 text-yellow-800'
}

const priorityBadgeClass = (score) =>
  score >= 70 ? 'bg-red-100 text-red-800'
  : score >= 40 ? 'bg-orange-100 text-orange-800'
  : 'bg-slate-100 text-slate-600'

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
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Variant</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Location</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Clinical Sig</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Priority</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Database Coverage</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-slate-200">
            <tr v-for="item in paginatedVariants" :key="item.rsid"
              class="hover:bg-slate-50 transition-colors cursor-pointer" @click="openDetail(item)">
              <td class="px-6 py-4 font-medium text-gen-primary">{{ item.rsid }}</td>
              <td class="px-6 py-4 text-slate-600 font-mono text-xs">
                <span v-if="item.payload?.data?.common">
                  {{ item.payload.data.common.chrom }}:{{ (item.payload.data.common.chromStart + 1).toLocaleString() }}
                </span>
              </td>
              <td class="px-6 py-4">
                <span
                  v-if="store.getClinicalSignificance(item)"
                  :class="[getClinVarColor(store.getClinicalSignificance(item)), 'px-2 py-1 rounded-full text-xs font-medium']"
                >
                  {{ store.getClinicalSignificance(item).replace(/_/g, ' ') }}
                </span>
                <span v-else class="text-slate-400 text-xs">—</span>
              </td>
              <td class="px-6 py-4 text-right">
                <span v-if="priorityByRsid[item.rsid] !== undefined"
                  :class="[priorityBadgeClass(priorityByRsid[item.rsid]), 'inline-block px-2 py-0.5 rounded text-xs font-semibold']">
                  {{ priorityByRsid[item.rsid] }}
                </span>
                <span v-else class="text-slate-300 text-xs">—</span>
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