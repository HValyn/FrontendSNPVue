import { createRouter, createWebHistory } from 'vue-router'
import HomeView    from '../views/HomeView.vue'
import AgenticView from '../views/AgenticView.vue'
import LoginView   from '../views/LoginView.vue'

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
      path: '/agentic',
      name: 'agentic',
      component: AgenticView
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