import type { ResourceKind } from './contract';
export type ResourceView = 'standards' | 'datasets' | 'results' | 'reports' | 'references';
export const resourceViews: Record<ResourceView, { title: string; description: string; kinds: ResourceKind[]; defaultKind: ResourceKind }> = {
  standards: { title: '评测标准', description: '记录标准、判定条款和独立版本。', kinds: ['standard'], defaultKind: 'standard' },
  datasets: { title: '评测集', description: '查看样本、覆盖场景和 case 原始记录。', kinds: ['dataset'], defaultKind: 'dataset' },
  results: { title: '评测结果', description: '产物批次、已有评分和分析分别保存。', kinds: ['artifactBatch', 'scoringBatch', 'analysis'], defaultKind: 'scoringBatch' },
  reports: { title: '评测报告', description: '查看已生成报告，复用自己的报告模板。', kinds: ['report', 'template'], defaultKind: 'template' },
  references: { title: '参考资料', description: '保存可复用的文件、链接与背景资料。', kinds: ['reference'], defaultKind: 'reference' },
};
