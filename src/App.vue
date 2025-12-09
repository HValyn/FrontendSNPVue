<script setup>
import HomeView from './views/HomeView.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-gen-dark text-white shadow-lg">
      <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="text-2xl">🧬</span>
          <h1 class="text-xl font-bold tracking-tight">IBGE Search</h1>
        </div>
        <div class="text-sm text-slate-400">
          v2.0 • Vue.js + SQLite + dbNSFP + dbSNP
        </div>
      </div>
    </header>

    <main class="flex-1 bg-slate-50">
      <HomeView />
    </main>
  </div>
</template>