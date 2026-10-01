/** Kept pure for focused safety tests. No DOM parsing or execution. */
export function isFolderHtml(file: { name: string; type: string }): boolean {
  const type = file.type.split(';')[0].trim().toLowerCase();
  return (
    type !== 'application/xhtml+xml' &&
    (type === 'text/html' || /\.html?$/i.test(file.name))
  );
}
export function safeDownloadName(name: string): string {
  return name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim() || 'download';
}
export function folderTitle(title: string): string {
  return title.trim().slice(0, 160) || '文件夹';
}
export function importSizeError(size: number, max: number): string | undefined {
  if (!Number.isFinite(max) || max < 0) return '无法确认上传大小限制';
  if (!Number.isFinite(size) || size < 0 || size > max)
    return '文件超过上传大小限制';
  return undefined;
}
