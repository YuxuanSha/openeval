// SPDX-License-Identifier: MIT
// OpenEval adapter around react-markdown and remark-gfm. No custom Markdown parser.
import { useState, type MouseEvent, type ReactNode, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export interface RenderMarkdownOptions {
  resolveImage?: (src: string) => string | undefined;
  onLinkClick?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
  syntaxHighlight?: boolean;
}
function safeUrl(value:string) {
  const url=value.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//') || /[\x00-\x20\\]/.test(url)) return '';
  return url;
}
function CodePanel({children}:{children:ReactNode}) {
  const [copied,setCopied]=useState(false); const [copyFailed,setCopyFailed]=useState(false);
  const child=children as ReactElement<{children?:ReactNode}>;
  const text=typeof child?.props?.children==='string'?child.props.children:'';
  return <div className="md-code-block"><div className="md-code-head"><span>Code</span><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);setCopyFailed(false);}catch{setCopied(false);setCopyFailed(true);}}}>{copied?'已复制':copyFailed?'复制失败，请手动选择':'复制'}</button></div><pre>{children}</pre></div>;
}
export function renderMarkdown(input:string,options:RenderMarkdownOptions={}):ReactNode {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={{
    p:({children})=><p className="md-p">{children}</p>,
    h1:({children})=><h1 className="md-h1">{children}</h1>, h2:({children})=><h2 className="md-h2">{children}</h2>, h3:({children})=><h3 className="md-h3">{children}</h3>,
    ul:({children})=><ul className="md-ul">{children}</ul>, ol:({children})=><ol className="md-ol">{children}</ol>,
    blockquote:({children})=><blockquote className="md-blockquote">{children}</blockquote>,
    hr:()=><hr className="md-hr"/>,
    a:({href,children})=>href?<a className="md-link" href={href} target={/^https?:/i.test(href)?'_blank':undefined} rel="noreferrer noopener" onClick={event=>options.onLinkClick?.(href,event)}>{children}</a>:<span>{children}</span>,
    img:({alt,src})=>{const url=src&&options.resolveImage?.(src);return url?<img className="artifact-image" src={url} alt={alt||'分享包图片'} loading="lazy"/>:<span className="markdown-image-placeholder">{alt?`[图片：${alt}]`:'[图片未内嵌]'}</span>;},
    pre:({children})=><CodePanel>{children}</CodePanel>,
    table:({children})=><div className="md-table-wrap"><table className="md-table">{children}</table></div>,
  }}>{input}</ReactMarkdown>;
}
