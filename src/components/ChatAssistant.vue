<script setup>
import { API_BASE } from '../config.js'
import { ref, computed, nextTick, watch } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import {
  PaperAirplaneIcon,
  SparklesIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  ChevronDownIcon
} from '@heroicons/vue/24/solid'

const store = useVariantStore()
const userInput = ref('')
const chatContainer = ref(null)
const isSending = ref(false)

const contextTabs = [
  { key: 'all',        label: 'All',        icon: SparklesIcon,            color: 'indigo' },
  { key: 'pathogenic', label: 'Pathogenic', icon: ExclamationTriangleIcon, color: 'red'    },
  { key: 'missing',    label: 'Missing',    icon: BeakerIcon,              color: 'yellow' },
  { key: 'custom',     label: 'Custom',     icon: FunnelIcon,              color: 'blue'   }
]

const activeChatHistory = computed(() => store.chatContexts[store.activeContext].history)
const activeVariantCount = computed(() => store.chatContexts[store.activeContext].variants.length)
const showFilterBadge = computed(() =>
  store.activeContext === 'custom' && store.activeFilterDescription
)

watch(() => activeChatHistory.value.length, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
})

// Also scroll when content of last message changes (streaming)
watch(() => {
  const h = activeChatHistory.value
  return h.length > 0 ? h[h.length - 1].content : ''
}, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
})

const switchContext = (key) => { store.activeContext = key }

// ── buildSmartContext ─────────────────────────────────────────────────────────
const buildSmartContext = () => {
  const contextVariants = store.chatContexts[store.activeContext].variants
  if (contextVariants.length === 0) return { message: 'No variants in this context' }

  const total = contextVariants.length
  const clinvarCounts = {}
  const geneCounts = {}
  const interestingVariants = []

  contextVariants.forEach(v => {
    const clinvar    = v.payload?.data?.clinvar    || {}
    const functional = v.payload?.data?.functional || {}
    const sig = clinvar.ucscNotes || 'Unknown'

    clinvarCounts[sig] = (clinvarCounts[sig] || 0) + 1
    const genes = v.payload?.data?.genes || []
    genes.forEach(g => geneCounts[g] = (geneCounts[g] || 0) + 1)

    const isPathogenic  = sig.toLowerCase().includes('pathogenic') && !sig.toLowerCase().includes('benign')
    const hasFunctional = Object.keys(functional).length > 0

    if ((isPathogenic || hasFunctional) && interestingVariants.length < 50) {
      interestingVariants.push({
        rsid: v.rsid, sig, genes,
        clinvar_review_status:   clinvar.clinvar_review_status   ?? null,
        phenotypes:              clinvar.phenotypes               ?? null,
        CADD_phred:              functional.CADD_phred            ?? null,
        SIFT_score:              functional.SIFT_score            ?? null,
        Polyphen2_HVAR_score:    functional.Polyphen2_HVAR_score  ?? null,
        fathmm_MKL_coding_score: functional.fathmm_MKL_coding_score ?? null,
        maf_1000G:   v.payload?.data?.common?.freq_1000G_ALL  ?? null,
        maf_gnomAD:  v.payload?.data?.common?.freq_gnomAD_ALL ?? null,
      })
    }
  })

  return {
    summary: {
      total_variants: total,
      clinical_breakdown: clinvarCounts,
      top_genes: Object.entries(geneCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([gene, count]) => ({ gene, count })),
    },
    annotated_variants: interestingVariants,
    data_coverage: {
      has_functional_scores: interestingVariants.some(v => v.CADD_phred !== null),
      has_clinvar:           interestingVariants.some(v => v.sig !== 'Unknown'),
      missing_functional:    total - interestingVariants.filter(v => v.CADD_phred !== null).length,
    }
  }
}

// ── Send message — brief first, then expandable full analysis ─────────────────
const sendMessage = async () => {
  if (!userInput.value.trim()) return

  const question = userInput.value
  userInput.value = ''
  isSending.value = true

  const context = store.activeContext
  store.chatContexts[context].history.push({ role: 'user', content: question })

  // Push placeholder with brief/full state
  const aiMsgIndex = store.chatContexts[context].history.push({
    role:        'assistant',
    content:     '',          // brief answer goes here
    fullContent: '',          // full streaming answer goes here
    showFull:    false,       // toggle state
    loadingFull: false,       // streaming in progress
    question,                 // save for the expand call
    briefDone:   false
  }) - 1

  const msg = store.chatContexts[context].history[aiMsgIndex]
  const smartContext = buildSmartContext()

  // ── Step 1: Get brief answer (fast, ~2-5s) ──────────────────────────────
  try {
    const resp = await fetch(`${API_BASE}/api/chat_brief`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question:   question,
        variant_context: smartContext,
        context_type:    context
      })
    })
    const data = await resp.json()
    msg.content   = data.brief || "I couldn't generate a response."
    msg.briefDone = true
  } catch {
    msg.content   = 'Error connecting to AI service.'
    msg.briefDone = true
  } finally {
    isSending.value = false
  }
}

// ── Step 2: Expand to full streaming analysis ─────────────────────────────────
const expandToFull = async (msg) => {
  if (msg.loadingFull || msg.fullContent) {
    msg.showFull = !msg.showFull
    return
  }

  msg.showFull    = true
  msg.loadingFull = true
  msg.fullContent = ''

  const context      = store.activeContext
  const smartContext = buildSmartContext()

  try {
    const response = await fetch(`${API_BASE}/api/chat_analysis`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question:      msg.question,
        variant_context:    smartContext,
        context_type:       context,
        filter_description: store.activeFilterDescription || null,
        stream:             true
      })
    })

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'token') msg.fullContent += event.text
        } catch { /* skip */ }
      }
    }

    if (!msg.fullContent) msg.fullContent = 'No detailed response available.'
  } catch {
    msg.fullContent = 'Error loading full analysis.'
  } finally {
    msg.loadingFull = false
  }
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-4">

    <!-- Context Tab Switcher -->
    <div class="border-b border-slate-200 bg-slate-50">
      <div class="flex">
        <button v-for="tab in contextTabs" :key="tab.key" @click="switchContext(tab.key)"
          :class="['flex-1 px-3 py-3 text-xs font-medium transition-colors relative',
            store.activeContext === tab.key
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-500'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']">
          <div class="flex items-center justify-center gap-1.5">
            <component :is="tab.icon" class="h-4 w-4" />
            <span>{{ tab.label }}</span>
            <span v-if="store.chatContexts[tab.key].variants.length > 0"
              class="text-xs bg-slate-200 px-1.5 rounded-full">
              {{ store.chatContexts[tab.key].variants.length }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Chat Header -->
    <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <SparklesIcon class="h-5 w-5 text-gen-primary" />
          <h3 class="font-semibold text-slate-900">{{ store.chatContexts[store.activeContext].label }}</h3>
        </div>
        <span class="text-xs text-slate-500">{{ activeVariantCount }} variants</span>
      </div>
      <div v-if="showFilterBadge"
        class="mt-2 flex items-start gap-1.5 text-xs text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1.5 border border-indigo-100">
        <FunnelIcon class="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span class="leading-snug">{{ store.activeFilterDescription }}</span>
      </div>
    </div>

    <!-- Chat Messages -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">

      <!-- Empty state -->
      <div v-if="activeChatHistory.length === 0" class="text-center py-10 px-4">
        <p class="text-sm text-slate-600">Ask questions about {{ store.chatContexts[store.activeContext].label.toLowerCase() }}</p>
        <p class="text-xs text-slate-400 mt-2">Context includes {{ activeVariantCount }} variants</p>
        <div v-if="store.activeContext === 'pathogenic'" class="mt-4 space-y-1.5">
          <p class="text-xs font-medium text-slate-500">Try asking:</p>
          <button v-for="q in ['Which variants have the strongest evidence?', 'Are any variants in the same gene?', 'What phenotypes are associated?']"
            :key="q" @click="userInput = q"
            class="block w-full text-left text-xs text-indigo-600 bg-white border border-indigo-100 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">
            {{ q }}
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div v-for="(msg, idx) in activeChatHistory" :key="idx"
        :class="['flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start']">

        <!-- User message -->
        <div v-if="msg.role === 'user'"
          class="max-w-[85%] rounded-2xl rounded-br-none px-4 py-2 text-sm shadow-sm bg-gen-primary text-white">
          <p class="whitespace-pre-wrap">{{ msg.content }}</p>
        </div>

        <!-- Assistant message — brief + optional expand -->
        <div v-else class="max-w-[85%] space-y-1">

          <!-- Brief answer bubble -->
          <div class="rounded-2xl rounded-bl-none px-4 py-2.5 text-sm shadow-sm bg-white text-slate-700 border border-slate-200">

            <!-- Loading state (waiting for brief) -->
            <div v-if="!msg.briefDone" class="flex items-center gap-2 text-slate-400">
              <span class="inline-flex gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:0ms"/>
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:150ms"/>
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style="animation-delay:300ms"/>
              </span>
              <span class="text-xs">Analysing…</span>
            </div>

            <!-- Brief answer text -->
            <p v-else class="whitespace-pre-wrap leading-relaxed">{{ msg.content }}</p>
          </div>

          <!-- Expand button (only shown once brief is ready) -->
          <button v-if="msg.briefDone"
            @click="expandToFull(msg)"
            class="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-1 transition-colors">
            <ChevronDownIcon :class="['h-3.5 w-3.5 transition-transform', msg.showFull ? 'rotate-180' : '']" />
            {{ msg.showFull ? 'Hide' : 'Full analysis' }}
            <span v-if="msg.loadingFull" class="text-slate-400 font-normal">— streaming…</span>
          </button>

          <!-- Full streaming answer (shown when expanded) -->
          <div v-if="msg.showFull"
            class="rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed">
            <div v-if="msg.loadingFull && !msg.fullContent" class="flex items-center gap-2 text-slate-400">
              <span class="inline-flex gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:0ms"/>
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:150ms"/>
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style="animation-delay:300ms"/>
              </span>
              <span class="text-xs text-indigo-500">Generating full analysis…</span>
            </div>
            <p v-else class="whitespace-pre-wrap">{{ msg.fullContent }}</p>
          </div>

        </div>
      </div>
    </div>

    <!-- Input Box -->
    <div class="p-4 bg-white border-t border-slate-200">
      <div class="relative flex items-center">
        <input v-model="userInput" @keydown.enter="sendMessage"
          :disabled="isSending || activeVariantCount === 0"
          type="text"
          :placeholder="activeVariantCount > 0 ? 'Ask about these variants...' : 'No variants in this context'"
          class="block w-full rounded-full border-slate-300 pr-12 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm py-3 disabled:bg-slate-100" />
        <button @click="sendMessage"
          :disabled="!userInput.trim() || isSending || activeVariantCount === 0"
          class="absolute right-2 bg-slate-100 p-1.5 rounded-full text-slate-500 hover:text-gen-primary hover:bg-indigo-50 transition-colors disabled:opacity-50">
          <PaperAirplaneIcon class="h-5 w-5" />
        </button>
      </div>
    </div>

  </div>
</template>