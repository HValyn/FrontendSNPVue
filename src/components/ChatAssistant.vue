<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { 
  PaperAirplaneIcon, 
  SparklesIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  FunnelIcon
} from '@heroicons/vue/24/solid'

const store = useVariantStore()
const userInput = ref('')
const chatContainer = ref(null)
const isSending = ref(false)

// Context tabs configuration
const contextTabs = [
  { key: 'all', label: 'All', icon: SparklesIcon, color: 'indigo' },
  { key: 'pathogenic', label: 'Pathogenic', icon: ExclamationTriangleIcon, color: 'red' },
  { key: 'missing', label: 'Missing', icon: BeakerIcon, color: 'yellow' },
  { key: 'custom', label: 'Custom', icon: FunnelIcon, color: 'blue' }
]

// Get active chat history
const activeChatHistory = computed(() => {
  return store.chatContexts[store.activeContext].history
})

// Get active variant count
const activeVariantCount = computed(() => {
  return store.chatContexts[store.activeContext].variants.length
})

// Auto-scroll on new messages
watch(() => activeChatHistory.value.length, async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
})

// Switch context
const switchContext = (contextKey) => {
  store.activeContext = contextKey
}

// Build smart context (now context-aware)
const buildSmartContext = () => {
  const contextVariants = store.chatContexts[store.activeContext].variants
  
  if (contextVariants.length === 0) {
    return { message: 'No variants in this context' }
  }
  
  const total = contextVariants.length
  const clinvarCounts = {}
  const geneCounts = {}
  const interestingVariants = []

  contextVariants.forEach(v => {
    const sig = v.payload.data.clinvar?.ucscNotes || 'Unknown'
    clinvarCounts[sig] = (clinvarCounts[sig] || 0) + 1
    
    const genes = v.payload.data.genes || []
    genes.forEach(g => geneCounts[g] = (geneCounts[g] || 0) + 1)

    // Prioritize pathogenic or functionally annotated variants
    if (sig.toLowerCase().includes('pathogenic') || v.payload.data.functional) {
      if (interestingVariants.length < 50) {
        interestingVariants.push({
          rsid: v.rsid,
          sig: sig,
          genes: genes,
          scores: v.payload.data.functional || 'N/A'
        })
      }
    }
  })

  return {
    summary: {
      total_variants: total,
      clinical_breakdown: clinvarCounts,
      top_genes: Object.entries(geneCounts).sort((a,b) => b[1]-a[1]).slice(0, 5)
    },
    sample_variants: interestingVariants
  }
}

const sendMessage = async () => {
  if (!userInput.value.trim()) return
  
  const question = userInput.value
  userInput.value = '' 
  isSending.value = true

  const context = store.activeContext
  store.chatContexts[context].history.push({ role: 'user', content: question })

  try {
    const smartContext = buildSmartContext()
    const aiMsgIndex = store.chatContexts[context].history.push({ 
      role: 'assistant', 
      content: 'Thinking...' 
    }) - 1

    const response = await fetch('http://localhost:5000/api/chat_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question: question,
        variant_context: smartContext,
        context_type: context
      })
    })

    const data = await response.json()
    store.chatContexts[context].history[aiMsgIndex].content = 
      data.answer || "I couldn't generate a response."

  } catch (e) {
    store.chatContexts[context].history.push({ 
      role: 'assistant', 
      content: "Error connecting to AI service." 
    })
  } finally {
    isSending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-4">
    
    <!-- Context Tab Switcher -->
    <div class="border-b border-slate-200 bg-slate-50">
      <div class="flex">
        <button
          v-for="tab in contextTabs"
          :key="tab.key"
          @click="switchContext(tab.key)"
          :class="[
            'flex-1 px-3 py-3 text-xs font-medium transition-colors relative',
            store.activeContext === tab.key
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-500'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          ]"
        >
          <div class="flex items-center justify-center gap-1.5">
            <component :is="tab.icon" class="h-4 w-4" />
            <span>{{ tab.label }}</span>
            <span 
              v-if="store.chatContexts[tab.key].variants.length > 0"
              class="text-xs bg-slate-200 px-1.5 rounded-full"
            >
              {{ store.chatContexts[tab.key].variants.length }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Chat Header -->
    <div class="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <SparklesIcon class="h-5 w-5 text-gen-primary" />
        <h3 class="font-semibold text-slate-900">
          {{ store.chatContexts[store.activeContext].label }}
        </h3>
      </div>
      <span class="text-xs text-slate-500">
        {{ activeVariantCount }} variants in context
      </span>
    </div>

    <!-- Chat Messages -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
      <div v-if="activeChatHistory.length === 0" class="text-center py-10 px-4">
        <p class="text-sm text-slate-600">
          Ask questions about {{ store.chatContexts[store.activeContext].label.toLowerCase() }}
        </p>
        <p class="text-xs text-slate-400 mt-2">
          Context includes {{ activeVariantCount }} variants
        </p>
      </div>

      <div 
        v-for="(msg, idx) in activeChatHistory" 
        :key="idx" 
        :class="['flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start']"
      >
        <div 
          :class="[
            'max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm',
            msg.role === 'user' 
              ? 'bg-gen-primary text-white rounded-br-none' 
              : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'
          ]"
        >
          <p class="whitespace-pre-wrap">{{ msg.content }}</p>
        </div>
      </div>
      
      <!-- Loading Indicator -->
      <div 
        v-if="isSending && activeChatHistory[activeChatHistory.length-1]?.content === 'Thinking...'" 
        class="flex justify-start animate-pulse"
      >
        <div class="bg-slate-200 h-8 w-12 rounded-full"></div>
      </div>
    </div>

    <!-- Input Box -->
    <div class="p-4 bg-white border-t border-slate-200">
      <div class="relative flex items-center">
        <input 
          v-model="userInput" 
          @keydown.enter="sendMessage" 
          :disabled="isSending || activeVariantCount === 0"
          type="text" 
          :placeholder="activeVariantCount > 0 ? 'Ask about these variants...' : 'No variants in this context'"
          class="block w-full rounded-full border-slate-300 pr-12 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm py-3 disabled:bg-slate-100"
        >
        <button 
          @click="sendMessage" 
          :disabled="!userInput.trim() || isSending || activeVariantCount === 0" 
          class="absolute right-2 bg-slate-100 p-1.5 rounded-full text-slate-500 hover:text-gen-primary hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          <PaperAirplaneIcon class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
</template>