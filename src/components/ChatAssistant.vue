<!-- =============================================================================
  PATCH 3b — ChatAssistant.vue (full replacement)

  WHAT'S NEW vs the original:
    • Sends filter_description to /api/chat_analysis so the backend
      build_contextual_prompt() can tell the LLM WHY this subset exists
    • buildSmartContext() now includes functional scores (CADD, SIFT,
      PolyPhen) for pathogenic/interesting variants — model gets real data
      instead of pre-aggregated counts
    • Active filter badge shown in the chat header
    • Everything else (tabs, layout, streaming indicator) is identical
============================================================================= -->

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

const contextTabs = [
  { key: 'all',        label: 'All',        icon: SparklesIcon,            color: 'indigo' },
  { key: 'pathogenic', label: 'Pathogenic', icon: ExclamationTriangleIcon, color: 'red'    },
  { key: 'missing',    label: 'Missing',    icon: BeakerIcon,              color: 'yellow' },
  { key: 'custom',     label: 'Custom',     icon: FunnelIcon,              color: 'blue'   }
]

const activeChatHistory = computed(() => store.chatContexts[store.activeContext].history)
const activeVariantCount = computed(() => store.chatContexts[store.activeContext].variants.length)

// Show filter badge only on the custom context when a smart filter is active
const showFilterBadge = computed(() =>
  store.activeContext === 'custom' && store.activeFilterDescription
)

watch(() => activeChatHistory.value.length, async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
})

const switchContext = (contextKey) => {
  store.activeContext = contextKey
}

// ── buildSmartContext ─────────────────────────────────────────────────────────
// KEY IMPROVEMENT: now includes functional scores for interesting variants
// instead of stripping them out in the summarisation step.
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
    const clinvar   = v.payload?.data?.clinvar   || {}
    const functional = v.payload?.data?.functional || {}
    const sig = clinvar.ucscNotes || 'Unknown'

    clinvarCounts[sig] = (clinvarCounts[sig] || 0) + 1

    const genes = v.payload?.data?.genes || []
    genes.forEach(g => geneCounts[g] = (geneCounts[g] || 0) + 1)

    const isPathogenic  = sig.toLowerCase().includes('pathogenic') && !sig.toLowerCase().includes('benign')
    const hasFunctional = Object.keys(functional).length > 0

    if ((isPathogenic || hasFunctional) && interestingVariants.length < 50) {
      // Include the actual functional scores — this is what the model needs
      interestingVariants.push({
        rsid:  v.rsid,
        sig,
        genes,
        clinvar_review_status: clinvar.clinvar_review_status || null,
        phenotypes:            clinvar.phenotypes            || null,
        // Functional scores (null if not available)
        CADD_phred:              functional.CADD_phred              ?? null,
        SIFT_score:              functional.SIFT_score              ?? null,
        Polyphen2_HVAR_score:    functional.Polyphen2_HVAR_score    ?? null,
        fathmm_MKL_coding_score: functional.fathmm_MKL_coding_score ?? null,
        // Population frequency
        maf_1000G: v.payload?.data?.common?.freq_1000G_ALL ?? null,
        maf_gnomAD: v.payload?.data?.common?.freq_gnomAD_ALL ?? null,
      })
    }
  })

  return {
    summary: {
      total_variants:     total,
      clinical_breakdown: clinvarCounts,
      top_genes: Object.entries(geneCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([gene, count]) => ({ gene, count })),
    },
    // Variants with functional data or pathogenic calls
    // The model gets real scores, not a census report
    annotated_variants: interestingVariants,
    // Tell the model about data completeness
    data_coverage: {
      has_functional_scores: interestingVariants.some(v => v.CADD_phred !== null),
      has_clinvar:           interestingVariants.some(v => v.sig !== 'Unknown'),
      missing_functional:    total - interestingVariants.filter(v => v.CADD_phred !== null).length,
    }
  }
}

// ── sendMessage ───────────────────────────────────────────────────────────────
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

    const response = await fetch('http://172.16.48.59:5000/api/chat_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_question:      question,
        variant_context:    smartContext,
        context_type:       context,
        // NEW: inject the filter description so the LLM knows WHY this subset exists
        filter_description: store.activeFilterDescription || null
      })
    })

    const data = await response.json()
    store.chatContexts[context].history[aiMsgIndex].content =
      data.answer || "I couldn't generate a response."

  } catch (e) {
    store.chatContexts[context].history.push({
      role: 'assistant',
      content: 'Error connecting to AI service.'
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
    <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <SparklesIcon class="h-5 w-5 text-gen-primary" />
          <h3 class="font-semibold text-slate-900">
            {{ store.chatContexts[store.activeContext].label }}
          </h3>
        </div>
        <span class="text-xs text-slate-500">
          {{ activeVariantCount }} variants
        </span>
      </div>

      <!-- Active filter badge (shown on custom context when smart filter is active) -->
      <div
        v-if="showFilterBadge"
        class="mt-2 flex items-start gap-1.5 text-xs text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1.5 border border-indigo-100"
      >
        <FunnelIcon class="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span class="leading-snug">{{ store.activeFilterDescription }}</span>
      </div>
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
        <!-- Helpful prompts for the user to try -->
        <div v-if="store.activeContext === 'pathogenic'" class="mt-4 space-y-1.5">
          <p class="text-xs font-medium text-slate-500">Try asking:</p>
          <button
            v-for="q in ['Which variants have the strongest evidence?', 'Are any variants in the same gene?', 'What phenotypes are associated?']"
            :key="q"
            @click="userInput = q"
            class="block w-full text-left text-xs text-indigo-600 bg-white border border-indigo-100 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
          >
            {{ q }}
          </button>
        </div>
        <div v-if="store.activeContext === 'custom' && store.activeFilterDescription" class="mt-4 space-y-1.5">
          <p class="text-xs font-medium text-slate-500">Try asking:</p>
          <button
            v-for="q in ['Summarise the key findings in this subset', 'Which variants here need clinical follow-up?', 'Are there any unexpected results given the filter?']"
            :key="q"
            @click="userInput = q"
            class="block w-full text-left text-xs text-indigo-600 bg-white border border-indigo-100 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors"
          >
            {{ q }}
          </button>
        </div>
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

      <div
        v-if="isSending && activeChatHistory[activeChatHistory.length - 1]?.content === 'Thinking...'"
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
        />
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