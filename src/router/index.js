import { createRouter, createWebHashHistory } from 'vue-router';
import { useAppStore } from '@/stores/state';

const routes = [
  { path: '/', redirect: '/sales' },
  { path: '/sales',     component: () => import('@/views/SalesPage.vue') },
  { path: '/inventory', component: () => import('@/views/InventoryPage.vue'),     meta: { adminOnly: true } },
  { path: '/po',        component: () => import('@/views/PurchaseOrdersPage.vue'), meta: { adminOnly: true } },
  { path: '/masterlist',component: () => import('@/views/MasterListPage.vue'),    meta: { adminOnly: true } },
  { path: '/settings',  component: () => import('@/views/SettingsPage.vue'),      meta: { adminOnly: true } },
  { path: '/setup',     component: () => import('@/views/SetupPage.vue'),         meta: { adminOnly: true } },
  { path: '/restock',   component: () => import('@/views/RestockPage.vue') },
  { path: '/payment-logs', component: () => import('@/views/PaymentLogsPage.vue') },
  { path: '/reports',   component: () => import('@/views/ReportsPage.vue'),       meta: { adminOnly: true } },
  { path: '/dashboard', component: () => import('@/views/DashboardPage.vue'),     meta: { adminOnly: true } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const store = useAppStore();
  if (to.meta.adminOnly && store.currentUser !== 'Admin') {
    return '/sales';
  }
});

export default router;
