<script setup>
import { ref } from 'vue'
import { useVariantStore } from '../stores/variantStore'
import { MagnifyingGlassIcon, ArrowPathIcon, DocumentArrowUpIcon, ClipboardDocumentListIcon } from '@heroicons/vue/24/outline'

const store = useVariantStore()
const inputRaw = ref('')
const activeTab = ref('manual') // 'manual' | 'file'
const fileName = ref('')
const isDragOver = ref(false)

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
      <div v-else class="transition-opacity duration-200">
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