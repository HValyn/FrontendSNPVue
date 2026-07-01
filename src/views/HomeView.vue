<script setup>
import SearchInput from '../components/SearchInput.vue'
import FilterPanel from '../components/FilterPanel.vue'
import VariantTable from '../components/VariantTable.vue'
import VizPanel from '../components/VizPanel.vue'
import ChatAssistant from '../components/ChatAssistant.vue'
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    
    <!-- Page Title -->
    <div class="py-8 border-b border-slate-200 mb-8">
      <h2 class="text-3xl font-bold tracking-tight text-slate-900">SNP Search Platform</h2>
      <p class="mt-2 text-lg text-slate-600">
        Analysis powered by dbSNP, ClinVar, dbNSFP and Local AI.
      </p>
    </div>

    <!-- Main Grid Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      <!-- Left Column: Search, Filter & Data (8/12 columns) -->
      <div class="lg:col-span-8 space-y-8">
        <SearchInput />
        <FilterPanel />
        <VizPanel />
        <VariantTable />
      </div>

      <!-- Right Column: AI Chat (4/12 columns) -->
      <div class="lg:col-span-4">
        <ChatAssistant />
      </div>

    </div>
  </div>
</template>