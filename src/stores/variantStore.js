import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVariantStore = defineStore('variant', () => {
  // --- Core State ---
  const variants = ref([])       
  const missing = ref([])        
  const loading = ref(false)     
  const progress = ref(0)        
  const totalProcessed = ref(0)
  
  // --- Legacy Chat State (kept for backwards compatibility) ---
  const chatHistory = ref([])
  
  // --- NEW: Multi-context Chat State ---
  const chatContexts = ref({
    all: {
      variants: [],
      history: [],
      label: 'All Variants'
    },
    pathogenic: {
      variants: [],
      history: [],
      label: 'Pathogenic'
    },
    missing: {
      variants: [],
      history: [],
      label: 'Missing Data'
    },
    custom: {
      variants: [],
      history: [],
      label: 'Custom Filter'
    }
  })

  const activeContext = ref('all')
  
  // --- Actions ---
  function clearResults() {
    variants.value = []
    missing.value = []
    progress.value = 0
    totalProcessed.value = 0
    chatHistory.value = []
    
    // Clear all context histories but keep structure
    Object.keys(chatContexts.value).forEach(key => {
      chatContexts.value[key].variants = []
      chatContexts.value[key].history = []
    })
  }

  // NEW: Update chat contexts after variants change
  function updateChatContexts() {
    // All context = all variants
    chatContexts.value.all.variants = variants.value
    
    // Pathogenic context = ClinVar pathogenic/likely pathogenic
    chatContexts.value.pathogenic.variants = variants.value.filter(v => {
      const sig = v.payload?.data?.clinvar?.ucscNotes || ''
      const sigLower = sig.toLowerCase()
      return sigLower.includes('pathogenic') && !sigLower.includes('benign')
    })
    
    // Missing context = variants with incomplete database coverage
    chatContexts.value.missing.variants = variants.value.filter(v => {
      const sources = v.payload?.sources_found || []
      return sources.length < 3  // Missing at least one database
    })
    
    // Custom context managed by FilterPanel - don't auto-populate
  }

  // Process variants in chunks to avoid timeouts
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
        console.error(`Error processing chunk ${i}-${i+CHUNK_SIZE}`, err)
      }
    }
    
    loading.value = false
    progress.value = 100
    
    // Update chat contexts after all variants loaded
    updateChatContexts()
  }

  async function processChunk(rsIdList) {
    const response = await fetch('http://localhost:5000/api/stream_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rs_id_list: rsIdList })
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk
      const lines = buffer.split('\n\n')
      buffer = lines.pop() 
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const payload = JSON.parse(line.replace('data: ', ''))
            handleStreamEvent(payload)
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
        break
      case 'variant_missing':
        missing.value.push(event.rsid)
        break
    }
  }

  return { 
    // Core state
    variants, 
    missing, 
    loading, 
    progress,
    totalProcessed,
    
    // Legacy chat (keep for now)
    chatHistory,
    
    // NEW: Multi-context chat
    chatContexts,
    activeContext,
    
    // Actions
    analyzeVariants, 
    clearResults,
    updateChatContexts
  }
})