export const permissionProfiles = {
  ask: { sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user' },
  auto: { sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' },
  full: { sandbox: 'danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user' },
} as const;
export type PermissionMode = keyof typeof permissionProfiles;
export function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'ask' || value === 'auto' || value === 'full';
}
export const permissionLabels: Record<PermissionMode, string> = { ask: '请求批准', auto: '自动审批', full: '完全访问' };
