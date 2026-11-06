import { Target } from 'lucide-react';
import type { Task } from '../contract';
import type { RunState } from './Workspace';

const goalLabels: Record<string,string> = {active:'推进中',paused:'已暂停',blocked:'等待条件',usageLimited:'用量受限',budgetLimited:'达到预算',complete:'目标完成'};
const runLabels: Record<string,string> = {running:'运行中',queued:'准备中',waiting:'等待继续',completed:'已结束',cancelled:'已停止',interrupted:'已中断',failed:'失败'};
const stopLabels: Record<string,string> = {max_turns_reached:'已到轮次上限',deadline_reached:'已到时限',goal_cleared:'目标已清除'};
export function GoalStatus({ task, run }: { task: Task; run: RunState }) {
  const last = task.lastRun; const mode = last?.goalMode || task.contract?.goalMode;
  if(!mode) return null;
  const goal = run.goal === undefined ? last?.goalState : run.goal;
  const count = run.turnCount ?? last?.turnCount;
  const reason = run.stopReason || last?.stopReason;
  const validation = last?.validationStatus;
  const state = ['running','approval','input'].includes(run.status)?'running':run.status==='complete'?'completed':last?.status;
  return <section className="goal-status"><header><Target size={15}/><strong>原生目标</strong><span>{goal ? goalLabels[goal.status] || goal.status : '等待目标状态'}</span></header><p>{mode.objective}</p><dl><div><dt>运行</dt><dd>{runLabels[state || ''] || '待确认'}</dd></div><div><dt>当前 turn</dt><dd>{count ?? '—'}{run.turnStatus==='running'?' · 执行中':run.turnStatus==='completed'?' · 已结束':''}</dd></div><div><dt>已用 token</dt><dd>{goal?.tokensUsed?.toLocaleString() ?? '—'}</dd></div><div><dt>CLI 运行时间</dt><dd>{goal?.timeUsedSeconds === undefined ? '—' : `${goal.timeUsedSeconds} 秒`}</dd></div><div><dt>独立验收</dt><dd>{validation==='passed'?'通过':validation==='failed'?'未通过':'尚未验收'}</dd></div></dl>{reason && <p className="goal-stop">{stopLabels[reason] || reason}</p>}<small>状态、用量和时间来自 CLI；目标完成不等同于验收通过。</small></section>;
}
