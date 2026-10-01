/** Self-contained trusted-file runtime; not a complete network/CPU sandbox. */
export const OFFLINE_HTML_MAX_BYTES = 5 * 1024 * 1024;
export const OFFLINE_HTML_WIDTH = 800;
export const OFFLINE_HTML_HEIGHT = 560;
export function offlineHtmlScale(value: number | undefined): number {
  return Number.isFinite(value) && value! >= 0.1 && value! <= 5 ? value! : 1;
}
export function isOfflineHtml(file: { name: string; type: string }): boolean {
  const type = file.type.split(';')[0].trim().toLowerCase();
  if (type === 'application/xhtml+xml') return false;
  return type === 'text/html' || /\.html?$/i.test(file.name);
}
const resources =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const OFFLINE_HTML_PERMISSIONS =
  "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'";
export const OFFLINE_HTML_EXIT_TYPE = 'dikw:offline-html:exit';
export function isOfflineHtmlExit(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === OFFLINE_HTML_EXIT_TYPE &&
    (data as { version?: unknown }).version === 1 &&
    Object.keys(data).length === 2
  );
}
function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
export function buildOfflineHtmlSrcdoc(source: string): string {
  // Fixed exit-only code precedes artifact scripts; artifact bytes never enter trusted JS.
  const exitScript =
    '<script>addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();parent.postMessage({type:"dikw:offline-html:exit",version:1},"*")}},true)</script>';
  const relay =
    '<script>addEventListener("message",e=>{const f=document.querySelector("iframe"),d=e.data;if(e.source===f.contentWindow&&d&&d.type==="dikw:offline-html:exit"&&d.version===1&&Object.keys(d).length===2){parent.postMessage({type:"dikw:offline-html:exit",version:1},"*")}})</script>';
  const inner =
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
    resources +
    "; frame-src 'none'\">" +
    exitScript +
    source;
  // Wrapper CSP still blocks child HTTP self-navigation. No data/Agent bridge.
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
    resources +
    '; frame-src about:"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;overflow:hidden}</style></head><body><iframe title="离线 HTML 内容" sandbox="allow-scripts" referrerpolicy="no-referrer" allow="' +
    escapeAttribute(OFFLINE_HTML_PERMISSIONS) +
    '" srcdoc="' +
    escapeAttribute(inner) +
    '"></iframe>' +
    relay +
    '</body></html>'
  );
}
