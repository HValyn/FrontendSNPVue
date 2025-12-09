import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVariantStore = defineStore('variant', () => {
  // --- State ---
  const variants = ref([])       
  const missing = ref([])        
  const loading = ref(false)     
  const progress = ref(0)        
  const chatHistory = ref([])    
  const totalProcessed = ref(0)
  
  // --- Actions ---
  function clearResults() {
    variants.value = []
    missing.value = []
    progress.value = 0
    totalProcessed.value = 0
    chatHistory.value = []
  }

  // NEW: Process in Batches
  async function analyzeVariants(allIds) {
    clearResults()
    loading.value = true
    
    // Config: Chunk size of 200 prevents timeouts and UI freeze
    const CHUNK_SIZE = 200 
    const total = allIds.length
    
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = allIds.slice(i, i + CHUNK_SIZE)
      
      try {
        await processChunk(chunk)
        
        // Update global progress
        totalProcessed.value += chunk.length
        progress.value = Math.min(100, Math.round((totalProcessed.value / total) * 100))
        
      } catch (err) {
        console.error(`Error processing chunk ${i}-${i+CHUNK_SIZE}`, err)
        // Continue to next chunk even if one fails
      }
    }
    
    loading.value = false
    progress.value = 100
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
          } catch (e) { console.error(e) }
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
    variants, 
    missing, 
    loading, 
    progress, 
    chatHistory, 
    analyzeVariants, 
    clearResults 
  }
})