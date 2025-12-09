<script setup>
import { ref, nextTick, watch } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { PaperAirplaneIcon, ChatBubbleLeftRightIcon, SparklesIcon } from '@heroicons/vue/24/solid'

const store = useVariantStore()
const userInput = ref('')
const chatContainer = ref(null)
const isSending = ref(false)

// Auto-scroll logic
watch(() => store.chatHistory.length, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
})

// --- Smart Context Builder ---
const buildSmartContext = () => {
  const allvars = store.variants
  
  // 1. Calculate Stats
  const total = allvars.length
  const clinvarCounts = {}
  const geneCounts = {}
  
  // 2. Identify "Interesting" Variants (Pathogenic or Annotated)
  const interestingVariants = []

  allvars.forEach(v => {
    // Stats
    const sig = v.payload.data.clinvar?.ucscNotes || 'Unknown'
    clinvarCounts[sig] = (clinvarCounts[sig] || 0) + 1
    
    const genes = v.payload.data.genes || []
    genes.forEach(g => geneCounts[g] = (geneCounts[g] || 0) + 1)

    // Filter Logic: If Pathogenic OR has functional data, prioritize it
    if (sig.toLowerCase().includes('pathogenic') || v.payload.data.functional) {
      if (interestingVariants.length < 50) { // Limit to 50 tokens max
        interestingVariants.push({
          rsid: v.rsid,
          sig: sig,
          genes: genes,
          scores: v.payload.data.functional || 'N/A'
        })
      }
    }
  })

  // 3. Construct the Payload
  return {
    summary: {
      total_variants: total,
      clinical_breakdown: clinvarCounts,
      top_genes: Object.entries(geneCounts).sort((a,b) => b[1]-a[1]).slice(0, 5)
    },
    sample_variants: interestingVariants // Only send the most important ones
  }
}

const sendMessage = async () => {
  if (!userInput.value.trim()) return
  
  const question = userInput.value
  userInput.value = '' 
  isSending.value = true

  store.chatHistory.push({ role: 'user', content: question })

  try {
    // Generate Optimized Context
    const smartContext = buildSmartContext()

    const aiMsgIndex = store.chatHistory.push({ role: 'assistant', content: 'Thinking...' }) - 1

    const response = await fetch('http://localhost:5000/api/chat_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question: question,
        variant_context: smartContext 
      })
    })

    const data = await response.json()
    store.chatHistory[aiMsgIndex].content = data.answer || "I couldn't generate a response."

  } catch (e) {
    store.chatHistory.push({ role: 'assistant', content: "Error connecting to AI service." })
  } finally {
    isSending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-4">
    <div class="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <SparklesIcon class="h-5 w-5 text-gen-primary" />
        <h3 class="font-semibold text-slate-900">Genomics AI</h3>
      </div>
      <span class="text-xs text-slate-500">Smart Context</span>
    </div>

    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
      <div v-if="store.chatHistory.length === 0" class="text-center py-10 px-4">
        <p class="text-sm text-slate-600">
          I've analyzed {{ store.variants.length }} variants. I'll summarize the key findings for you to save processing power.
        </p>
      </div>

      <div v-for="(msg, idx) in store.chatHistory" :key="idx" :class="['flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start']">
        <div :class="['max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm', msg.role === 'user' ? 'bg-gen-primary text-white rounded-br-none' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none']">
          <p class="whitespace-pre-wrap">{{ msg.content }}</p>
        </div>
      </div>
      
       <!-- Loading Indicator -->
      <div v-if="isSending && store.chatHistory[store.chatHistory.length-1]?.content === 'Thinking...'" class="flex justify-start animate-pulse">
        <div class="bg-slate-200 h-8 w-12 rounded-full"></div>
      </div>
    </div>

    <div class="p-4 bg-white border-t border-slate-200">
      <div class="relative flex items-center">
        <input v-model="userInput" @keydown.enter="sendMessage" :disabled="isSending" type="text" placeholder="Ask about trends..." class="block w-full rounded-full border-slate-300 pr-12 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm py-3">
        <button @click="sendMessage" :disabled="!userInput.trim() || isSending" class="absolute right-2 bg-slate-100 p-1.5 rounded-full text-slate-500 hover:text-gen-primary hover:bg-indigo-50 transition-colors disabled:opacity-50">
          <PaperAirplaneIcon class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
</template>