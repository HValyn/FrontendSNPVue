<script setup>
import { computed } from 'vue'
import { useVariantDetailStore } from '../stores/variantDetailStore'
import { XMarkIcon, ArrowPathIcon, ExclamationTriangleIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'

const store = useVariantDetailStore()
const d = computed(() => store.detail)

const priorityColor = (score) =>
  score >= 70 ? 'text-red-700 bg-red-50 border-red-200'
  : score >= 40 ? 'text-orange-700 bg-orange-50 border-orange-200'
  : 'text-slate-600 bg-slate-50 border-slate-200'

const severityPillClass = (term) => {
  if (term.includes('pathogenic') && !term.includes('benign')) return 'bg-red-100 text-red-800'
  if (term.includes('benign')) return 'bg-green-100 text-green-800'
  return 'bg-yellow-100 text-yellow-800'
}

function copyRsid() {
  if (d.value?.rsid) navigator.clipboard?.writeText(d.value.rsid)
}

const WARNING_LABELS = {
  no_frequency_data: 'No population frequency data found — this does not mean the variant is rare, only that it wasn\u2019t found in the local reference tables.',
  no_annotation_found: 'No annotation found in any local database for this variant.',
  conflicting_clinvar_classifications: 'ClinVar submitters have conflicting classifications for this variant — treat the classification as unsettled, not a confident call.',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="store.isOpen" class="fixed inset-0 z-40 bg-slate-900/30" @click="store.close()" />
    </Transition>
    <Transition name="drawer-slide">
      <aside v-if="store.isOpen && d" class="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 overflow-y-auto">

        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg font-bold text-slate-900">{{ d.rsid || 'Novel variant' }}</h2>
              <button v-if="d.rsid" @click="copyRsid" title="Copy rsID" class="text-slate-300 hover:text-slate-500">
                <ClipboardDocumentIcon class="w-4 h-4" />
              </button>
            </div>
            <p class="text-sm text-slate-500 font-mono mt-0.5">
              {{ d.chrom }}:{{ d.pos?.toLocaleString() }}
              <span v-if="d.ref && d.alt">{{ d.ref }}&gt;{{ d.alt }}</span>
            </p>
            <p v-if="d.gene" class="text-sm text-indigo-600 font-medium mt-1">{{ d.gene }}</p>
          </div>
          <button @click="store.close()" class="text-slate-400 hover:text-slate-600">
            <XMarkIcon class="w-6 h-6" />
          </button>
        </div>

        <div class="p-6 space-y-6">

          <!-- Warnings -->
          <div v-if="d.warnings?.length || d.alleleMismatch || d.deepLookupMissing" class="space-y-2">
            <div v-for="w in d.warnings" :key="w"
              class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <ExclamationTriangleIcon class="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{{ WARNING_LABELS[w] || w }}</span>
            </div>
            <div v-if="d.alleleMismatch"
              class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <ExclamationTriangleIcon class="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>The reference/alt allele from your input differs from the database record at this position — double check this is the intended variant.</span>
            </div>
          </div>

          <!-- Priority score -->
          <div v-if="d.priority !== undefined" class="rounded-xl border p-4" :class="priorityColor(d.priority)">
            <div class="flex items-baseline justify-between">
              <span class="text-xs font-medium uppercase tracking-wide opacity-70">Priority score</span>
              <span class="text-3xl font-bold">{{ d.priority }}</span>
            </div>
            <p class="text-xs mt-2 opacity-80">
              ClinVar classification + CADD + rarity + predictor concordance. A triage aid, not a clinical classification.
            </p>
          </div>

          <!-- ClinVar -->
          <div>
            <h3 class="text-sm font-bold text-slate-900 mb-2">ClinVar classification</h3>
            <div v-if="d.clinvar.hasRecord" class="space-y-2">
              <div class="flex flex-wrap gap-1.5">
                <span v-for="t in d.clinvar.severityTerms" :key="t"
                  :class="[severityPillClass(t), 'px-2.5 py-1 rounded-full text-xs font-medium capitalize']">
                  {{ t }}
                </span>
                <span v-for="t in d.clinvar.otherTerms" :key="t"
                  class="px-2.5 py-1 rounded-full text-xs font-medium capitalize bg-slate-100 text-slate-500"
                  title="ClinVar category, not a pathogenicity call">
                  {{ t }}
                </span>
                <span v-if="d.clinvar.conflicting"
                  class="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                  ⚠ Conflicting classifications
                </span>
              </div>
              <div class="flex items-center gap-3 text-xs text-slate-500">
                <span v-if="d.clinvar.stars !== null">
                  {{ '★'.repeat(d.clinvar.stars) }}{{ '☆'.repeat(4 - d.clinvar.stars) }}
                  <span class="ml-1">({{ d.clinvar.stars }}/4 review confidence)</span>
                </span>
              </div>
              <p v-if="d.clinvar.traitRaw" class="text-xs text-slate-500">Associated condition: {{ d.clinvar.traitRaw }}</p>
            </div>
            <p v-else class="text-sm text-slate-400">No ClinVar record found.</p>
          </div>

          <!-- Functional predictions -->
          <div>
            <h3 class="text-sm font-bold text-slate-900 mb-2">Functional predictions</h3>
            <div v-if="store.loadingDeep" class="flex items-center gap-2 text-sm text-slate-400 py-4">
              <ArrowPathIcon class="w-4 h-4 animate-spin" /> Loading full detail…
            </div>
            <div v-else-if="d.functional.cadd !== null || d.functional.revel !== null || d.functional.alphamissensePred || d.functional.sift !== null"
              class="grid grid-cols-2 gap-2">
              <div v-if="d.functional.cadd !== null" class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">CADD</p>
                <p class="font-mono text-lg font-semibold text-slate-900">{{ d.functional.cadd }}</p>
                <p class="text-[10px] text-slate-400">≥20 deleterious, ≥30 top 0.1%</p>
              </div>
              <div v-if="d.functional.revel !== null" class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">REVEL</p>
                <p class="font-mono text-lg font-semibold text-slate-900">{{ d.functional.revel }}</p>
                <p class="text-[10px] text-slate-400">≥0.5 commonly used damaging threshold</p>
              </div>
              <div v-if="d.functional.alphamissensePred" class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">AlphaMissense</p>
                <p class="font-mono text-lg font-semibold text-slate-900">{{ d.functional.alphamissensePred }}</p>
              </div>
              <div v-if="d.functional.sift !== null" class="bg-slate-50 rounded-lg p-3">
                <p class="text-xs text-slate-500">SIFT</p>
                <p class="font-mono text-lg font-semibold text-slate-900">{{ d.functional.sift }}</p>
                <p class="text-[10px] text-slate-400">&lt;0.05 damaging</p>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">No functional prediction scores found.</p>

            <!-- Raw per-transcript detail -->
            <details v-if="d.functional.transcripts?.length" class="mt-3">
              <summary class="text-xs text-indigo-600 cursor-pointer hover:text-indigo-700">
                Show all {{ d.functional.transcripts.length }} overlapping transcript{{ d.functional.transcripts.length > 1 ? 's' : '' }}
              </summary>
              <div class="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="bg-slate-50 text-slate-500">
                      <th class="text-left font-medium py-1.5 px-2">CADD</th>
                      <th class="text-left font-medium py-1.5 px-2">REVEL</th>
                      <th class="text-left font-medium py-1.5 px-2">AlphaMissense</th>
                      <th class="text-left font-medium py-1.5 px-2">SIFT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(t, i) in d.functional.transcripts" :key="i" class="border-t border-slate-100">
                      <td class="py-1.5 px-2 font-mono">{{ t.cadd }}</td>
                      <td class="py-1.5 px-2 font-mono">{{ t.revel }}</td>
                      <td class="py-1.5 px-2 font-mono">{{ t.alphamissense }}</td>
                      <td class="py-1.5 px-2 font-mono">{{ t.sift }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <!-- Population frequencies -->
          <div>
            <h3 class="text-sm font-bold text-slate-900 mb-2">Population frequencies (MAF)</h3>
            <div v-if="store.loadingDeep" class="flex items-center gap-2 text-sm text-slate-400 py-4">
              <ArrowPathIcon class="w-4 h-4 animate-spin" /> Loading full detail…
            </div>
            <div v-else-if="d.frequencies?.length" class="grid grid-cols-2 gap-2">
              <div v-for="f in d.frequencies" :key="f.label"
                class="flex justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
                <span class="text-slate-500">{{ f.label }}</span>
                <span class="font-mono font-medium">{{ f.value }}</span>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">
              No frequency data found — this does not necessarily mean the variant is rare.
            </p>
          </div>

          <!-- Sources -->
          <div v-if="d.sourcesFound?.length">
            <h3 class="text-sm font-bold text-slate-900 mb-2">Found in</h3>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="s in d.sourcesFound" :key="s"
                class="px-2 py-1 rounded text-xs bg-green-50 text-green-700 border border-green-200">{{ s }}</span>
            </div>
          </div>

        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-slide-enter-active, .drawer-slide-leave-active { transition: transform 0.25s ease; }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateX(100%); }
.drawer-fade-enter-active, .drawer-fade-leave-active { transition: opacity 0.2s ease; }
.drawer-fade-enter-from, .drawer-fade-leave-to { opacity: 0; }
</style>