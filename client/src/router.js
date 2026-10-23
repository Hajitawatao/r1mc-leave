import { createRouter, createWebHashHistory } from 'vue-router';
import { store, loadMe, hasRole, currentWorkspace } from './store';

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/change-password', name: 'change-password', component: () => import('./views/ChangePassword.vue') },
  { path: '/', name: 'dashboard', component: () => import('./views/Dashboard.vue') },
  { path: '/file', name: 'file', component: () => import('./views/FileLeave.vue') },
  { path: '/requests/:id/edit', name: 'edit', component: () => import('./views/FileLeave.vue') },
  { path: '/my-requests', name: 'my-requests', component: () => import('./views/MyRequests.vue') },
  { path: '/requests/:id', name: 'request', component: () => import('./views/RequestDetail.vue') },
  { path: '/requests/:id/form6', name: 'form6', component: () => import('./views/Form6.vue'), meta: { bare: true } },
  { path: '/leave-card', name: 'leave-card', component: () => import('./views/LeaveCard.vue') },
  { path: '/leave-card/:employeeId', name: 'leave-card-emp', component: () => import('./views/LeaveCard.vue') },
  { path: '/approvals', name: 'approvals', component: () => import('./views/Approvals.vue') },
  { path: '/delegations', name: 'delegations', component: () => import('./views/Delegations.vue') },
  { path: '/notifications', name: 'notifications', component: () => import('./views/Notifications.vue') },
  { path: '/all-requests', name: 'all-requests', component: () => import('./views/AllRequests.vue'), meta: { team: true } },
  { path: '/reports', name: 'reports', component: () => import('./views/Reports.vue'), meta: { team: true } },
  { path: '/admin/employees', name: 'employees', component: () => import('./views/admin/Employees.vue'), meta: { roles: ['HR'] } },
  { path: '/admin/departments', name: 'departments', component: () => import('./views/admin/Departments.vue'), meta: { roles: ['HR'] } },
  { path: '/admin/leave-types', name: 'leave-types', component: () => import('./views/admin/LeaveTypes.vue'), meta: { roles: ['HR'] } },
  { path: '/admin/holidays', name: 'holidays', component: () => import('./views/admin/Holidays.vue'), meta: { roles: ['HR'] } },
  { path: '/admin/credits', name: 'credits', component: () => import('./views/admin/Credits.vue'), meta: { roles: ['HR'] } },
  { path: '/admin/import', name: 'import', component: () => import('./views/admin/Import.vue'), meta: { roles: ['HR'] } },
  { path: '/admin/settings', name: 'settings', component: () => import('./views/admin/Settings.vue'), meta: { roles: ['ADMIN'] } },
  { path: '/admin/roles', name: 'roles', component: () => import('./views/admin/Roles.vue'), meta: { roles: ['HR'] } },
  { path: '/home/approver', name: 'home-approver', component: () => import('./views/home/ApproverHome.vue') },
  { path: '/home/hr', name: 'home-hr', component: () => import('./views/home/HRHome.vue'), meta: { roles: ['HR'] } },
  { path: '/home/accounting', name: 'home-accounting', component: () => import('./views/home/AccountingHome.vue'), meta: { roles: ['ACCOUNTING'] } },
  { path: '/home/admin', name: 'home-admin', component: () => import('./views/home/AdminHome.vue'), meta: { roles: ['ADMIN'] } },
  { path: '/account', name: 'account', component: () => import('./views/Account.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHashHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!store.user) await loadMe();
  if (!store.user) return { name: 'login', query: { next: to.fullPath } };
  if (store.user.must_change_password && to.name !== 'change-password') return { name: 'change-password' };
  // "/" is the Employee dashboard; in any other workspace it opens that workspace's own home
  if (to.path === '/' && store.workspace !== 'EMPLOYEE') return currentWorkspace().home;
  if (to.meta.roles && !hasRole(...to.meta.roles)) return { name: 'dashboard' };
  if (to.meta.team && !(store.user.org_wide || store.user.is_supervisor)) return { name: 'dashboard' };
  return true;
});

export default router;
