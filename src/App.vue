<!-- <script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

const isHome     = computed(() => route.path === '/')
const isAgentic  = computed(() => route.path === '/agentic')
const isLoggedIn = computed(() => sessionStorage.getItem('ibge_auth') === '1')

const logout = () => {
  sessionStorage.removeItem('ibge_auth')
  router.push('/login')
}
</script> -->
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 1. Create a reactive reference for authentication
const isLoggedIn = ref(sessionStorage.getItem('ibge_auth') === '1')

// 2. Use router.afterEach to update the state on every navigation
router.afterEach(() => {
  isLoggedIn.value = sessionStorage.getItem('ibge_auth') === '1'
})

const isHome = (path) => route.path === path

const logout = () => {
  sessionStorage.removeItem('ibge_auth')
  isLoggedIn.value = false // Explicitly update state
  router.push('/login')
}
</script>
<template>
  <div class="min-h-screen flex flex-col font-sans">

    <!-- Only show header/nav when logged in -->
    <header v-if="isLoggedIn && route.path !== '/login'" class="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="h-16 flex justify-between items-center">

          <!-- Brand -->
          <div class="flex items-center gap-3">
            <span class="text-2xl animate-pulse">🧬</span>
            <h1 class="text-xl font-bold tracking-tight text-slate-100">IBGE Search</h1>
          </div>

          <!-- Right side: nav + logout -->
          <div class="flex items-center gap-4">
            <nav class="flex space-x-1">
              <router-link
                to="/"
                class="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                :class="isHome ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
              >
                Overview
              </router-link>
            </nav>

            <!-- Logout -->
            <button
              @click="logout"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Sign out"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
              </svg>
              Sign out
            </button>
          </div>

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

    <footer v-if="isLoggedIn" class="bg-white border-t border-slate-200 py-6">
      <div class="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
        &copy; {{ new Date().getFullYear() }} IBGE Search Platform · AITeC, NCP
      </div>
    </footer>

  </div>
</template>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>