import { X, FileText, Download, ArrowUpRight } from 'lucide-react';
import type { Artifact, Resource, ResourceRef } from '../contract';
import { kindLabels } from '../contract';
import { useEffect, useRef } from 'react';
export function RefChip({ reference, resources, onRemove, onInspect }: { reference: ResourceRef; resources: Resource[]; onRemove?: () => void; onInspect: () => void }) {
  const resource = resources.find(r => r.id === reference.resourceId); const snapshot = resource?.snapshots.find(s => s.id === reference.snapshotId);
  return <span className="ref-chip"><button onClick={onInspect}><span className="at">@</span>{resource?.name || '引用不可用'}<em>{snapshot?.label || '版本缺失'}</em></button>{onRemove && <button aria-label={`移除引用 ${resource?.name}`} onClick={onRemove}><X size={12} /></button>}</span>;
}
export function ResourceType({ kind }: { kind: Resource['kind'] }) { return <span className={`type-tag type-${kind}`}>{kindLabels[kind]}</span>; }
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; ref.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]')); const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', escape); return () => { document.removeEventListener('keydown', escape); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></header>{children}</div></div>;
}
export function downloadArtifact(artifact: Artifact) {
  const a = document.createElement('a'); const objectUrl = artifact.content !== undefined ? URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType })) : null;
  if (!objectUrl && !artifact.downloadUrl) return;
  a.href = objectUrl || artifact.downloadUrl!; a.download = artifact.title; a.click(); if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
}
export function ArtifactCard({ artifact, onPreview }: { artifact: Artifact; onPreview: () => void }) {
  return <article className="artifact-card"><span className="file-symbol"><FileText size={21} /></span><button className="artifact-title" onClick={onPreview}><strong>{artifact.title}</strong><small>{artifact.demo ? '模拟产物 · 可检查与下载' : '任务产物'} <ArrowUpRight size={12} /></small></button><button className="icon-button" aria-label={`下载 ${artifact.title}`} onClick={() => downloadArtifact(artifact)}><Download size={17} /></button></article>;
}
