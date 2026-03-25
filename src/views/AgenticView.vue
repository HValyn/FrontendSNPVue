<script setup>
import { ref } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { SparklesIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'

const store = useVariantStore()
const query = ref('')
const file = ref(null)
const isDragging = ref(false)

const handleDrop = (e) => {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    file.value = e.dataTransfer.files[0]
  }
}

const handleFileSelect = (e) => {
  if (e.target.files && e.target.files[0]) {
    file.value = e.target.files[0]
  }
}

const clearFile = () => {
  file.value = null
}

const analyze = async () => {
  if (!file.value || !query.value) {
    alert('Please upload a file AND enter a question')
    return
  }

  try {
    await store.performAgenticSearch(file.value, query.value)
  } catch (error) {
    alert(`Search failed: ${error.message}`)
  }
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
      
      <!-- Header -->
      <div class="bg-slate-900 px-8 py-10 text-white relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-indigo-600 to-cyan-500 opacity-20"></div>
        <h2 class="text-3xl font-bold tracking-tight relative z-10 flex items-center gap-3">
          <span class="text-4xl">🧬</span> Agentic Analysis
        </h2>
        <p class="mt-4 text-slate-300 text-lg relative z-10 max-w-2xl">
          Leverage AI to interpret your variant data. Upload your rsIDs and ask complex clinical questions in plain English.
        </p>
      </div>

      <!-- Main Input Area -->
      <div class="p-8 lg:p-12 space-y-10">
        
        <!-- Query Section -->
        <div>
          <label class="block text-lg font-medium text-slate-700 mb-3">
            What would you like to know?
          </label>
          <div class="relative">
            <textarea 
              v-model="query"
              rows="4"
              class="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-4 bg-slate-50 placeholder-slate-400"
              placeholder="e.g. Find key clinical insights and Minor Allele Frequencies for these variants..."
            ></textarea>
            <div class="absolute bottom-3 right-3 text-slate-400 text-sm">
              AI-Powered
            </div>
          </div>
        </div>

        <!-- File Upload Section -->
        <div>
          <label class="block text-lg font-medium text-slate-700 mb-3">
            Variant List Input
          </label>
          
          <div 
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop="handleDrop"
            :class="[
              'relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 ease-in-out flex flex-col items-center justify-center text-center cursor-pointer group',
              isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
            ]"
          >
            <input type="file" ref="fileInput" class="hidden" @change="handleFileSelect" accept=".txt,.csv,.vcf" />
            
            <template v-if="!file">
              <div class="h-16 w-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p class="text-slate-600 font-medium text-lg">
                Drag & Drop your file here
              </p>
              <p class="text-slate-400 mt-2">
                or <button @click="$refs.fileInput.click()" class="text-indigo-600 hover:text-indigo-700 font-semibold">browse files</button>
              </p>
              <p class="text-xs text-slate-400 mt-4">
                Supported formats: .txt, .csv, .vcf (Max 50MB)
              </p>
            </template>

            <template v-else>
              <div class="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm w-full max-w-md">
                <div class="h-10 w-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div class="flex-1 text-left truncate">
                  <p class="font-medium text-slate-900 truncate">{{ file.name }}</p>
                  <p class="text-xs text-slate-500">{{ (file.size / 1024).toFixed(2) }} KB</p>
                </div>
                <button @click.stop="clearFile" class="text-slate-400 hover:text-red-500 p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </template>

          </div>
        </div>

        <!-- Action Area -->
        <div class="flex justify-end pt-6 border-t border-slate-100">
          <button 
            @click="analyze"
            :disabled="store.agenticLoading || !file || !query"
            class="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <ArrowPathIcon v-if="store.agenticLoading" class="animate-spin h-6 w-6" />
            <SparklesIcon v-else class="h-6 w-6" />
            {{ store.agenticLoading ? 'Analyzing...' : 'Analyze Variants' }}
          </button>
        </div>

        <!-- Results display -->
        <div v-if="store.agenticResults" class="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div class="bg-indigo-50 rounded-2xl p-8 border border-indigo-100">
            <h3 class="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
              <SparklesIcon class="h-6 w-6" />
              AI Summary
            </h3>
            <p class="text-indigo-800 text-lg leading-relaxed">
              {{ store.agenticResults.summary }}
            </p>
          </div>

          <div class="space-y-4">
            <h3 class="text-xl font-bold text-slate-900">Found Variants ({{ store.agenticResults.results.length }})</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                v-for="result in store.agenticResults.results" 
                :key="result.rsid"
                class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div class="font-mono text-lg text-indigo-600 font-bold mb-3">{{ result.rsid }}</div>
                <div class="space-y-2">
                  <div v-for="(val, key) in result.data" :key="key" class="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <span class="text-slate-500 font-medium capitalize">{{ key.replace(/_/g, ' ') }}</span>
                    <span class="text-slate-900 font-semibold">{{ val }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="store.agenticResults.missing_ids?.length" class="bg-amber-50 rounded-xl p-6 border border-amber-100">
            <h3 class="text-sm font-bold text-amber-800 mb-2 uppercase tracking-wider">Unrecognized IDs</h3>
            <div class="flex flex-wrap gap-2">
              <span v-for="id in store.agenticResults.missing_ids" :key="id" class="px-2 py-1 bg-white rounded border border-amber-200 text-amber-700 font-mono text-xs">
                {{ id }}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
