<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

// Hardcoded credentials — swap for backend auth when ready
const VALID_USERS = [
  { username: 'ibge',  password: 'genomics2024' },
  { username: 'admin', password: 'ncp@AITeC'    },
  { username: 'ds', password: '1234'        },
]

const handleLogin = async () => {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = 'Enter a username and password.'
    return
  }

  loading.value = true
  // Small delay so it doesn't feel instantaneous (looks more credible)
  await new Promise(r => setTimeout(r, 400))

  const match = VALID_USERS.find(
    u => u.username === username.value.trim() && u.password === password.value
  )

  if (match) {
    sessionStorage.setItem('ibge_auth', '1')
    router.push('/')
  } else {
    error.value = 'Incorrect username or password.'
    password.value = ''
  }

  loading.value = false
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 flex items-center justify-center px-4">

    <!-- Background DNA grid texture -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none opacity-5">
      <div class="absolute inset-0" style="background-image: repeating-linear-gradient(0deg, #6366f1 0px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #6366f1 0px, transparent 1px, transparent 40px);"></div>
    </div>

    <div class="relative w-full max-w-sm">

      <!-- Logo / Brand -->
      <div class="text-center mb-8">
        <span class="text-5xl">🧬</span>
        <h1 class="mt-4 text-2xl font-bold text-white tracking-tight">IBGE Search</h1>
        <p class="mt-1 text-slate-400 text-sm">Genomic Variant Analysis Platform</p>
      </div>

      <!-- Card -->
      <div class="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
        <h2 class="text-lg font-semibold text-white mb-6">Sign in to continue</h2>

        <div class="space-y-4">
          <!-- Username -->
          <div>
            <label class="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Username
            </label>
            <input
              v-model="username"
              @keydown.enter="handleLogin"
              type="text"
              autocomplete="username"
              placeholder="Enter username"
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Password
            </label>
            <input
              v-model="password"
              @keydown.enter="handleLogin"
              type="password"
              autocomplete="current-password"
              placeholder="Enter password"
              class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <!-- Error -->
          <p v-if="error" class="text-red-400 text-xs flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            {{ error }}
          </p>

          <!-- Submit -->
          <button
            @click="handleLogin"
            :disabled="loading"
            class="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-all duration-150 flex items-center justify-center gap-2"
          >
            <svg v-if="loading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {{ loading ? 'Signing in...' : 'Sign in' }}
          </button>
        </div>
      </div>

      <p class="text-center text-slate-600 text-xs mt-6">
        © {{ new Date().getFullYear() }} AITeC · National Centre for Physics
      </p>
    </div>
  </div>
</template>