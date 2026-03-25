<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// Simple active state check
const isHome = computed(() => route.path === '/')
const isAgentic = computed(() => route.path === '/agentic')
</script>

<template>
  <div class="min-h-screen flex flex-col font-sans">
    <header class="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4">
        <!-- Top Bar -->
        <div class="h-16 flex justify-between items-center">
          <div class="flex items-center gap-3">
            <span class="text-2xl animate-pulse">🧬</span>
            <h1 class="text-xl font-bold tracking-tight text-slate-100">IBGE Search</h1>
          </div>
          
          <!-- Navigation Tabs -->
          <nav class="flex space-x-1">
            <router-link 
              to="/" 
              class="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              :class="isHome ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
            >
              Overview
            </router-link>
            <router-link 
              to="/agentic" 
              class="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
              :class="isAgentic ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:text-white hover:bg-slate-800'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM2.75 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012.75 10zM15 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM4.757 4.757a.75.75 0 011.061 0l1.06 1.061a.75.75 0 01-1.06 1.06l-1.061-1.06a.75.75 0 010-1.061zM14.182 14.182a.75.75 0 011.061 0l1.06 1.061a.75.75 0 01-1.06 1.06l-1.061-1.06a.75.75 0 010-1.061zM4.757 15.243a.75.75 0 010 1.061l-1.061 1.06a.75.75 0 01-1.06-1.06l1.06-1.061a.75.75 0 011.061 0zM14.182 5.818a.75.75 0 010-1.06l1.061-1.061a.75.75 0 011.06 1.06l-1.06 1.061a.75.75 0 01-1.061 0z" />
              </svg>
              Agentic View
            </router-link>
          </nav>
        </div>
      </div>
    </header>

    <main class="flex-1 bg-slate-50 relative">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    
    <footer class="bg-white border-t border-slate-200 py-6">
      <div class="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
        &copy; 2023 IBGE Search Platform. v2.1 Agentic Enabled.
      </div>
    </footer>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>