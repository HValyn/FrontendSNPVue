<script setup>
import { ref } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { MagnifyingGlassIcon, ArrowPathIcon, DocumentArrowUpIcon, ClipboardDocumentListIcon, SparklesIcon } from '@heroicons/vue/24/outline'

const store = useVariantStore()
const inputRaw = ref('')
const activeTab = ref('manual') // 'manual' | 'file' | 'agentic'
const fileName = ref('')
const isDragOver = ref(false)
const lastUploadedFile = ref(null)
const agenticQuery = ref('')

const handleSearch = () => {
  if (!inputRaw.value) return
  
  const idList = inputRaw.value
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0) // Simple regex clean

  store.analyzeVariants(idList)
}

// --- File Handling Logic ---
const processFile = (file) => {
  if (!file) return
  fileName.value = file.name
  lastUploadedFile.value = file
  
  if (activeTab.value === 'agentic') return // Don't parse for agentic mode
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target.result
    // Basic CSV parser: assume rsIDs are in the first column OR look for 'rsid' header
    const lines = text.split('\n')
    const ids = []
    
    lines.forEach(line => {
      const cols = line.split(',')
      // cleanup quotes and whitespace
      const firstCol = cols[0]?.replace(/['"]+/g, '').trim()
      if (firstCol && firstCol.toLowerCase().startsWith('rs')) {
        ids.push(firstCol)
      }
    })

    if (ids.length > 0) {
      inputRaw.value = ids.join(', ')
      // Auto-switch to manual tab to show result
      activeTab.value = 'manual'
    } else {
      alert("No valid rsIDs found in the first column of the CSV.")
    }
  }
  reader.readAsText(file)
}

const onDrop = (e) => {
  isDragOver.value = false
  const file = e.dataTransfer.files[0]
  if (file && (file.type === "text/csv" || file.name.endsWith('.csv'))) {
    processFile(file)
  } else {
    alert("Please upload a valid .csv file")
  }
}

const onFileSelect = (e) => {
  const file = e.target.files[0]
  processFile(file)
}

const loadExample = () => {
  inputRaw.value = "rs123, rs456, rs6903203, rs429358"
}

const handleAgenticSearch = async () => {
  if (!lastUploadedFile.value || !agenticQuery.value) {
    alert('Please upload a file AND enter a question')
    return
  }

  try {
    await store.performAgenticSearch(lastUploadedFile.value, agenticQuery.value)
  } catch (error) {
    alert(`Search failed: ${error.message}`)
  }
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
    
    <!-- Tabs -->
    <div class="flex border-b border-slate-200">
      <button 
        @click="activeTab = 'manual'"
        :class="['flex-1 py-3 text-sm font-medium text-center transition-colors', activeTab === 'manual' ? 'bg-white text-gen-primary border-b-2 border-gen-primary' : 'bg-slate-50 text-slate-500 hover:text-slate-700']"
      >
        <div class="flex items-center justify-center gap-2">
          <ClipboardDocumentListIcon class="h-4 w-4" />
          Manual Entry
        </div>
      </button>
      <button 
        @click="activeTab = 'file'"
        :class="['flex-1 py-3 text-sm font-medium text-center transition-colors', activeTab === 'file' ? 'bg-white text-gen-primary border-b-2 border-gen-primary' : 'bg-slate-50 text-slate-500 hover:text-slate-700']"
      >
        <div class="flex items-center justify-center gap-2">
          <DocumentArrowUpIcon class="h-4 w-4" />
          Upload CSV
        </div>
      </button>
      <button 
        @click="activeTab = 'agentic'"
        :class="['flex-1 py-3 text-sm font-medium text-center transition-colors', activeTab === 'agentic' ? 'bg-white text-gen-primary border-b-2 border-gen-primary' : 'bg-slate-50 text-slate-500 hover:text-slate-700']"
      >
        <div class="flex items-center justify-center gap-2">
          <SparklesIcon class="h-4 w-4" />
          Smart Analysis
        </div>
      </button>
    </div>

    <div class="p-6">
      
      <!-- TAB 1: Manual Entry -->
      <div v-if="activeTab === 'manual'" class="relative transition-opacity duration-200">
        <div class="flex justify-between items-end mb-2">
          <label class="block text-sm font-medium text-slate-700">
            Paste Variant IDs
          </label>
          <button @click="loadExample" class="text-xs text-gen-primary hover:text-indigo-700 font-medium">
            Load Example
          </button>
        </div>
        
        <textarea 
          v-model="inputRaw"
          rows="3"
          class="block w-full rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm font-mono text-slate-600 p-3"
          placeholder="rs123, rs456..."
        ></textarea>

        <div class="mt-4 flex justify-end">
          <button 
            @click="handleSearch"
            :disabled="store.loading || !inputRaw"
            class="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gen-primary hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ArrowPathIcon v-if="store.loading" class="animate-spin -ml-1 mr-2 h-4 w-4" />
            <MagnifyingGlassIcon v-else class="-ml-1 mr-2 h-4 w-4" />
            {{ store.loading ? 'Analyzing...' : 'Analyze Variants' }}
          </button>
        </div>
      </div>

      <!-- TAB 2: File Upload -->
      <div v-else-if="activeTab === 'file'" class="transition-opacity duration-200">
        <div 
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="onDrop"
          :class="['border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer', isDragOver ? 'border-gen-primary bg-indigo-50' : 'border-slate-300 hover:border-gen-primary hover:bg-slate-50']"
        >
          <input type="file" id="file-upload" class="hidden" accept=".csv" @change="onFileSelect">
          <label for="file-upload" class="cursor-pointer">
            <DocumentArrowUpIcon class="mx-auto h-12 w-12 text-slate-400" />
            <p class="mt-2 text-sm font-medium text-slate-900">
              <span class="text-gen-primary">Upload a file</span> or drag and drop
            </p>
            <p class="mt-1 text-xs text-slate-500">CSV files only (First column must contain rsIDs)</p>
          </label>
        </div>
        <p v-if="fileName" class="text-sm text-green-600 mt-2 text-center">
          ✓ {{ fileName }} loaded
        </p>
      </div>

      <!-- TAB 3: Agentic Search -->
      <div v-else-if="activeTab === 'agentic'" class="transition-opacity duration-200">
        <!-- Reuse file upload for Agentic -->
        <div 
          v-if="!fileName"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="onDrop"
          :class="['border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer', isDragOver ? 'border-gen-primary bg-indigo-50' : 'border-slate-300 hover:border-gen-primary hover:bg-slate-50']"
        >
          <input type="file" id="agentic-file-upload" class="hidden" @change="onFileSelect">
          <label for="agentic-file-upload" class="cursor-pointer">
            <DocumentArrowUpIcon class="mx-auto h-8 w-8 text-slate-400" />
            <p class="mt-1 text-sm font-medium text-slate-900">
              <span class="text-gen-primary">Upload variants</span>
            </p>
          </label>
        </div>
        <div v-else class="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
          <div class="flex items-center gap-2">
            <DocumentArrowUpIcon class="h-5 w-5 text-slate-400" />
            <span class="text-sm font-medium text-slate-700">{{ fileName }}</span>
          </div>
          <button @click="fileName = ''; lastUploadedFile = null" class="text-xs text-red-500 hover:text-red-700">Change</button>
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-700 mb-2">
            What do you want to know about these variants?
          </label>
          <textarea 
            v-model="agenticQuery"
            rows="2"
            class="block w-full rounded-lg border-slate-300 shadow-sm focus:border-gen-primary focus:ring-gen-primary sm:text-sm p-3"
            placeholder="e.g., 'What is the MAF for these variants?' or 'Which ones are pathogenic?'"
          ></textarea>
        </div>

        <div class="flex justify-end">
          <button 
            @click="handleAgenticSearch"
            :disabled="store.agenticLoading || !fileName || !agenticQuery"
            class="inline-flex items-center px-6 py-2.5 bg-gen-primary text-white rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <SparklesIcon v-if="!store.agenticLoading" class="h-4 w-4 mr-2" />
            <ArrowPathIcon v-else class="animate-spin h-4 w-4 mr-2" />
            {{ store.agenticLoading ? 'Analyzing...' : 'Smart Search' }}
          </button>
        </div>

        <!-- Agentic Results display -->
        <div v-if="store.agenticResults" class="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h4 class="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <SparklesIcon class="h-4 w-4 text-gen-primary" />
            Summary
          </h4>
          <p class="text-sm text-slate-700 mb-4">{{ store.agenticResults.summary }}</p>

          <h4 class="font-semibold text-slate-900 mb-2">Results ({{ store.agenticResults.results.length }})</h4>
          <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
            <div 
              v-for="result in store.agenticResults.results" 
              :key="result.rsid"
              class="bg-white p-3 rounded border border-slate-200"
            >
              <div class="font-mono text-xs text-gen-primary font-medium">{{ result.rsid }}</div>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <div v-for="(val, key) in result.data" :key="key" class="text-[10px]">
                  <span class="text-slate-400 font-medium uppercase">{{ key }}:</span>
                  <span class="text-slate-600 ml-1">{{ val }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Progress Bar (Global) -->
      <div v-if="store.loading || store.progress > 0" class="mt-6">
        <div class="flex justify-between text-xs text-slate-500 mb-1">
          <span>Streaming Analysis...</span>
          <span>{{ store.progress }}%</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div 
            class="bg-gen-primary h-2 rounded-full transition-all duration-300 ease-out"
            :style="{ width: `${store.progress}%` }"
          ></div>
        </div>
      </div>

    </div>
  </div>
</template>