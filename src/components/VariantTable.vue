<script setup>
import { ref, computed } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'

const store = useVariantStore()
const expandedRows = ref(new Set())

// --- Pagination Logic ---
const currentPage = ref(1)
const pageSize = 50

const totalPages = computed(() => Math.ceil(store.variants.length / pageSize))

const paginatedVariants = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return store.variants.slice(start, end)
})

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

// --- Helpers ---
const toggleRow = (rsid) => {
  if (expandedRows.value.has(rsid)) expandedRows.value.delete(rsid)
  else expandedRows.value.add(rsid)
}

const getClinVarColor = (sig) => {
  if (!sig) return 'bg-slate-100 text-slate-600'
  const s = sig.toLowerCase()
  if (s.includes('pathogenic')) return 'bg-red-100 text-red-800'
  if (s.includes('benign')) return 'bg-green-100 text-green-800'
  return 'bg-yellow-100 text-yellow-800'
}

const getFrequencyData = (commonData) => {
  if (!commonData) return {}
  return Object.fromEntries(
    Object.entries(commonData).filter(([key]) => key.endsWith('_MAF') && commonData[key] !== null)
  )
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="store.variants.length > 0" class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      
      <!-- Header with Pagination Controls -->
      <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-slate-900">Results</h3>
          <span class="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded">
            {{ store.variants.length }} Total
          </span>
        </div>

        <div class="flex items-center gap-4 text-sm text-slate-600">
          <span>Page {{ currentPage }} of {{ totalPages }}</span>
          <div class="flex rounded-md shadow-sm">
            <button @click="prevPage" :disabled="currentPage === 1" class="px-2 py-1 border border-slate-300 rounded-l-md bg-white hover:bg-slate-50 disabled:opacity-50">
              <ChevronLeftIcon class="h-4 w-4" />
            </button>
            <button @click="nextPage" :disabled="currentPage === totalPages" class="px-2 py-1 border-t border-b border-r border-slate-300 rounded-r-md bg-white hover:bg-slate-50 disabled:opacity-50">
              <ChevronRightIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="w-10 px-6 py-3"></th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Variant</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Location</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Clinical Sig</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Sources</th>
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
                  <span v-if="item.payload?.data?.clinvar" :class="[getClinVarColor(item.payload.data.clinvar.ucscNotes), 'px-2 py-1 rounded-full text-xs font-medium']">
                    {{ item.payload.data.clinvar.ucscNotes }}
                  </span>
                  <span v-else class="text-slate-400 text-xs">-</span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex gap-1">
                    <span v-for="src in item.payload?.sources_found" :key="src" class="bg-slate-100 px-2 py-1 rounded text-xs border">
                      {{ src }}
                    </span>
                  </div>
                </td>
              </tr>

              <!-- Expanded Detail Row (Identical to previous, but renders faster due to pagination) -->
              <tr v-if="expandedRows.has(item.rsid)" class="bg-slate-50">
                <td colspan="5" class="px-8 py-6">
                   <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div v-if="item.payload?.data?.common">
                      <h4 class="text-sm font-bold text-slate-900 mb-3">Population Frequencies (MAF)</h4>
                      <div class="grid grid-cols-2 gap-2">
                        <div v-for="(val, key) in getFrequencyData(item.payload.data.common)" :key="key" class="flex justify-between text-xs bg-white p-2 rounded border border-slate-200">
                          <span class="text-slate-500">{{ key.replace('_MAF', '') }}</span>
                          <span class="font-mono font-medium">{{ val }}</span>
                        </div>
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
  </div>
</template>