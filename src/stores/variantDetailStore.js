import { defineStore } from 'pinia'
import { ref } from 'vue'
import { API_BASE } from '../config.js'
import {
  adaptLookupVariant, adaptBatchRow, mergeDeepDetail,
} from '../utils/variantDetailAdapters.js'

export const useVariantDetailStore = defineStore('variantDetail', () => {
  const isOpen = ref(false)
  const detail = ref(null)
  const loadingDeep = ref(false)

  function openLookup(variant) {
    detail.value = adaptLookupVariant(variant)
    loadingDeep.value = false
    isOpen.value = true
  }

  async function openBatch(row, jobId) {
    detail.value = adaptBatchRow(row)
    isOpen.value = true

    // Batch rows are already-reduced summaries; fetch the full-depth
    // detail (raw per-transcript scores, complete frequency list) on
    // demand rather than precomputing it for every row in a 200k-variant job.
    if (!row.chrom || !row.pos || !row.alt) return
    loadingDeep.value = true
    try {
      const resp = await fetch(`${API_BASE}/api/v2/batch/${jobId}/variant/${row.chrom}/${row.pos}/${row.alt}`)
      const deep = await resp.json()
      // Guard against a stale response landing after the user already
      // clicked into a different variant.
      if (detail.value?.rsid === row.rsid || (detail.value?.chrom === row.chrom && detail.value?.pos === row.pos)) {
        detail.value = mergeDeepDetail(detail.value, deep)
      }
    } catch (e) {
      console.error('Failed to load variant detail:', e)
    } finally {
      loadingDeep.value = false
    }
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, detail, loadingDeep, openLookup, openBatch, close }
})