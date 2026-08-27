import { createRouter, createWebHistory } from 'vue-router'
import HomeView        from '../views/HomeView.vue'
import LoginView       from '../views/LoginView.vue'
import BatchReportView from '../views/BatchReportView.vue'
// AgenticView is intentionally NOT imported/routed here — see the note in
// src/views/AgenticView.vue. It's an incomplete prototype (empty gene/context
// fields, results not useful) that predates the ClinVar/scoring fixes made
// throughout this codebase. Batch Report (below) covers its intended use
// case — "I have a big rsID/variant list, tell me what matters" — using the
// corrected pipeline. The file is kept for reference, not deleted, in case
// something in it is worth salvaging later.

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true }
    },
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/batch-report',
      name: 'batch-report',
      component: BatchReportView
    }
  ]
})

// Auth guard — check sessionStorage on every navigation
router.beforeEach((to) => {
  const authed = sessionStorage.getItem('ibge_auth') === '1'
  if (!to.meta.public && !authed) {
    return { name: 'login' }
  }
})

export default router