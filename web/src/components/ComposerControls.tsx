import { useEffect, useRef, useState } from 'react';
import { AtSign, Check, ChevronDown, FilePlus2, Plus, Target, X } from 'lucide-react';
import type { Capabilities, GoalMode, Intent } from '../contract';
import { intentLabels } from '../contract';

type Menu = 'add' | 'model' | 'reasoning' | 'intent' | null;
const effortLabel: Record<string, string> = { minimal:'极简', low:'低', medium:'中', high:'高', xhigh:'超高', max:'最高' };
export function ComposerControls({ capabilities, disabled, model, reasoning, intent, goal, onModel, onReasoning, onIntent, onGoal, onImport, onReference, onRuntime }: {
  capabilities?: Capabilities; disabled: boolean; model: string; reasoning: string; intent: Intent; goal?: GoalMode | null;
  onModel: (v: string) => void; onReasoning: (v: string) => void; onIntent: (v: Intent) => void; onGoal: (v: GoalMode | null) => void;
  onImport: () => void; onReference: () => void; onRuntime: () => void;
}) {
  const [menu, setMenu] = useState<Menu>(null); const root = useRef<HTMLDivElement>(null);
  const selected = capabilities?.models.find(m => m.id === model);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(null); };
    const key = (e: KeyboardEvent) => { if(e.key === 'Escape') { setMenu(null); root.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { if(disabled) setMenu(null); }, [disabled]);
  const choose = (action: () => void) => { action(); setMenu(null); };
  const toggle = (name: Menu) => setMenu(current => current === name ? null : name);
  return <div className="composer-controls" ref={root}>
    <div className="composer-control">
      <button className="composer-add" aria-label="添加资料与工具" aria-expanded={menu === 'add'} disabled={disabled} onClick={() => toggle('add')}><Plus size={20} strokeWidth={1.7}/></button>
      {menu === 'add' && <div className="composer-menu" aria-label="添加资料与工具">
        <button onClick={() => choose(onImport)}><FilePlus2 size={17}/><span>导入资料</span><small>文件、文字或链接</small></button>
        <button onClick={() => choose(onReference)}><AtSign size={17}/><span>引用资料库</span><small>@</small></button>
        <div className="menu-divider"/>
        <button disabled={!capabilities?.goals?.supported} onClick={() => choose(() => onGoal(goal ? null : {objective:'',origin:'user'}))}><Target size={17}/><span>目标模式</span>{goal ? <Check size={15}/> : !capabilities?.goals?.supported && <small>CLI 暂不可用</small>}</button>
      </div>}
    </div>
    <div className="composer-control">
      <button className="composer-choice" aria-label="选择模型" aria-expanded={menu === 'model'} disabled={disabled} onClick={() => toggle('model')}><span>{selected?.label || model || 'Codex'}</span><ChevronDown size={12}/></button>
      {menu === 'model' && <div className="composer-menu model-menu" aria-label="可用模型">
        {capabilities?.models.map(m => <button key={m.id} aria-pressed={model === m.id} onClick={() => choose(() => {onModel(m.id);onReasoning('');})}><span>{m.label}</span>{model === m.id && <Check size={15}/>}</button>)}
        {!capabilities?.models.length && <p>{capabilities?.diagnostic || '尚未读取到 Codex 模型'}</p>}
        <div className="menu-divider"/><button onClick={() => choose(onRuntime)}><span>连接详情</span></button>
      </div>}
    </div>
    <div className="composer-control">
      <button className="composer-choice" aria-label="选择思考力度" aria-expanded={menu === 'reasoning'} disabled={disabled || !selected?.reasoning.length} onClick={() => toggle('reasoning')}><span>{reasoning ? effortLabel[reasoning] || reasoning : '默认'}思考</span><ChevronDown size={12}/></button>
      {menu === 'reasoning' && <div className="composer-menu compact-menu" aria-label="思考力度">
        {['', ...(selected?.reasoning || [])].map(value => <button key={value} aria-pressed={reasoning === value} onClick={() => choose(() => onReasoning(value))}><span>{value ? effortLabel[value] || value : '默认'}</span>{reasoning === value && <Check size={15}/>}</button>)}
      </div>}
    </div>
    <div className="composer-control task-control">
      <button className="composer-choice" aria-label="选择任务方式" aria-expanded={menu === 'intent'} disabled={disabled} onClick={() => toggle('intent')}><span>{intentLabels[intent]}</span><ChevronDown size={12}/></button>
      {menu === 'intent' && <div className="composer-menu compact-menu" aria-label="任务方式">{Object.entries(intentLabels).map(([key,label]) => <button key={key} aria-pressed={intent === key} onClick={() => choose(() => onIntent(key as Intent))}><span>{label}</span>{intent === key && <Check size={15}/>}</button>)}</div>}
    </div>
  </div>;
}
export function GoalInput({ value, disabled, onChange }: { value?: GoalMode | null; disabled: boolean; onChange: (v: GoalMode | null) => void }) {
  if(!value) return null;
  return <div className="composer-goal"><Target size={15}/><input aria-label="目标描述" value={value.objective} disabled={disabled} maxLength={3500} placeholder="目标（留空时使用本条任务）" onChange={e=>onChange({objective:e.target.value,origin:'user'})}/><button aria-label="关闭目标模式" disabled={disabled} onClick={()=>onChange(null)}><X size={15}/></button></div>;
}
