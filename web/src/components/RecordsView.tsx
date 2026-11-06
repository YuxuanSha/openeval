import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { adapter } from '../adapters';
import type { RecordPage, ResourceKind, Snapshot, SourceRecord } from '../contract';
const display = (value: unknown) => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const stateLabels: Record<string, string> = { scored: '已评分', insufficient_evidence: '证据不足', not_delivered: '未交付', execution_failed: '执行失败', not_applicable: '不适用', pending: '待处理' };
export function RecordsView({ snapshot, kind }: { snapshot: Snapshot; kind: ResourceKind }) {
  const [page, setPage] = useState<RecordPage>(); const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<SourceRecord>(); const [error, setError] = useState(''); const [raw, setRaw] = useState(false);
  useEffect(() => { setOffset(0); setSelected(undefined); setRaw(false); }, [snapshot.id]);
  useEffect(() => { let current=true; setError(''); setPage(undefined); setSelected(undefined); adapter.listRecords(snapshot.id, offset, 30).then(p => { if(current)setPage(p); }).catch(e=>{if(current)setError(e.message);}); return()=>{current=false;}; }, [snapshot.id, offset]);
  let denominator = snapshot.metadata?.denominator;
  if(denominator === undefined){try{const source=JSON.parse(snapshot.content); if(source && !Array.isArray(source) && typeof source==='object')denominator=source.denominator;}catch{/* Unstructured source has no declared denominator. */}}
  const fields = Array.from(new Set(page?.records.flatMap(r => Object.keys(r.raw)) || []));
  const preferred = ['case_id','sample_id','id','original_prompt','prompt','task','status','evidence_status','delivery_status','score'];
  const columns = [...preferred.filter(k=>fields.includes(k)), ...fields.filter(k=>!preferred.includes(k))].slice(0,5);
  const states = page?.records.reduce<Record<string, number>>((all,r)=>{const status=r.raw.status; if(typeof status==='string')all[status]=(all[status]||0)+1;return all;},{});
  return <div className="records-view"><div className="records-heading"><strong>{kind === 'dataset' ? '样本记录' : '批次记录'}{page && <small>{page.total} 条</small>}</strong><button className="text-button" onClick={()=>setRaw(!raw)}>{raw ? '查看记录' : '查看原文'}</button></div>
    {denominator !== undefined && <div className="notice record-denominator"><strong>来源声明的统计分母</strong><span>{display(denominator)}</span></div>}
    {states && Object.keys(states).length > 0 && <div className="record-statuses">{Object.entries(states).map(([key,count])=><span key={key}>{stateLabels[key] || key}<b>{count}</b></span>)}<small>{page!.total > page!.records.length ? '当前页状态计数' : '源记录状态计数'}；不替代评测分母。</small></div>}
    {error && <p className="form-error">{error}</p>}{raw ? <pre>{snapshot.content || '没有可用文字提取，请下载原文件。'}</pre> : !page ? !error && <p className="empty-small">正在读取记录…</p> : !page.records.length ? <div className="empty-small"><FileText size={18} /><p>此快照未提取到结构化记录。可查看原文或下载原文件。</p><pre>{snapshot.content}</pre></div> : <><div className="records-table-wrap"><table className="records-table"><thead><tr><th>原始行</th>{columns.map(c=><th key={c}>{c}</th>)}<th /></tr></thead><tbody>{page.records.map(r=><tr key={r.recordId} className={selected?.recordId===r.recordId?'selected':''}><td>{r.sourceRow}</td>{columns.map(c=><td key={c} title={display(r.raw[c])}>{display(r.raw[c])}</td>)}<td><button className="text-link record-detail-button" aria-label={`查看第 ${r.sourceRow} 行详情`} onClick={()=>setSelected(r)}>详情</button></td></tr>)}</tbody></table></div><div className="records-pagination"><span>{offset+1}–{offset+page.records.length} / {page.total}</span><button className="icon-button" aria-label="上一页记录" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-30))}><ChevronLeft size={16}/></button><button className="icon-button" aria-label="下一页记录" disabled={offset+page.records.length>=page.total} onClick={()=>setOffset(offset+30)}><ChevronRight size={16}/></button></div></>}
    {selected && <section className="case-detail"><header><strong>{kind==='dataset'?'Case 详情':'记录详情'}</strong><small>原始行 {selected.sourceRow} · {selected.identityStatus==='mapped'?'已映射身份字段':'按来源行定位'}</small></header><dl>{Object.entries(selected.raw).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{display(value)}</dd></div>)}</dl></section>}
  </div>;
}
