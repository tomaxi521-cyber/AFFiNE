/** Self-contained trusted-file runtime; not a complete network/CPU sandbox. */
export const OFFLINE_HTML_MAX_BYTES = 5 * 1024 * 1024;
export const OFFLINE_HTML_WIDTH = 800;
export const OFFLINE_HTML_HEIGHT = 560;
export function isOfflineHtml(file: { name: string; type: string }): boolean {
  const type = file.type.split(';')[0].trim().toLowerCase();
  if (type === 'application/xhtml+xml') return false;
  return type === 'text/html' || /\.html?$/i.test(file.name);
}
const resources =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const OFFLINE_HTML_PERMISSIONS =
  "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'";
function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
export function buildOfflineHtmlSrcdoc(source: string): string {
  // CSP precedes ALL artifact bytes. No parsing or insertion into host DOM.
  const inner =
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
    resources +
    "; frame-src 'none'\">" +
    source;
  // The trusted wrapper policy blocks HTTP self-navigation by the inner frame.
  // srcdoc inherits the wrapper CSP, including its resource permissions.
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
    resources +
    '; frame-src about:"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;overflow:hidden}</style></head><body><iframe title="离线 HTML 内容" sandbox="allow-scripts" referrerpolicy="no-referrer" allow="' +
    escapeAttribute(OFFLINE_HTML_PERMISSIONS) +
    '" srcdoc="' +
    escapeAttribute(inner) +
    '"></iframe></body></html>'
  );
}
