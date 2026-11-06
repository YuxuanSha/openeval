// Decode Markdown URL escapes once; API receives a relative package path.
export function packageImageURL(downloadURL: string | undefined, src: string): string | undefined {
  if (!downloadURL) return undefined;
  let path: string;
  try { path = decodeURIComponent(src); } catch { return undefined; }
  if (!path || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(path) || /[\\\x00-\x1f]/.test(path)) return undefined;
  return `${downloadURL.replace(/\/download$/, '/package-image')}?path=${encodeURIComponent(path)}`;
}
