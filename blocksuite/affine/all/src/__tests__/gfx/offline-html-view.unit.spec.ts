import { afterEach, describe, expect, test, vi } from 'vitest';
import { OfflineHtmlView } from '../../../../blocks/attachment/src/offline-html-view.js';
import { OFFLINE_HTML_MAX_BYTES } from '../../../../blocks/attachment/src/offline-html.js';
if (!customElements.get('dikw-offline-html-test'))
  customElements.define('dikw-offline-html-test', OfflineHtmlView);
const elements: OfflineHtmlView[] = [];
afterEach(() => elements.splice(0).forEach(el => el.remove()));
async function mount() {
  const el = document.createElement(
    'dikw-offline-html-test'
  ) as OfflineHtmlView;
  el.sourceId = 'a';
  el.canRun = true;
  elements.push(el);
  document.body.append(el);
  await el.updateComplete;
  return el;
}
function run(el: OfflineHtmlView) {
  void el.run();
}
async function flush(el: OfflineHtmlView) {
  await Promise.resolve();
  await Promise.resolve();
  await el.updateComplete;
}
describe('HTML execution lifecycle (DOM simulation, not CSP browser proof)', () => {
  test('never loads before consent or in readonly view', async () => {
    const el = await mount();
    const load = vi.fn();
    el.loadBlob = load;
    await flush(el);
    expect(load).not.toHaveBeenCalled();
    expect(el.shadowRoot!.querySelector('header,button,.hint')).toBeNull();
    el.canRun = false;
    el.readOnly = true;
    await flush(el);
    run(el);
    expect(load).not.toHaveBeenCalled();
    expect(el.shadowRoot!.querySelector('iframe')).toBeNull();
  });
  test('rejects stale source and revoked consent during pending load', async () => {
    const el = await mount();
    let resolve!: (value: Blob) => void;
    el.loadBlob = () =>
      new Promise(r => {
        resolve = r;
      });
    run(el);
    await flush(el);
    el.canRun = false;
    await flush(el);
    el.canRun = true;
    el.sourceId = 'b';
    await flush(el);
    resolve(new Blob(['<button>Old</button>']));
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBeNull();
    const state = vi.fn();
    el.onState = state;
    el.requestUpdate();
    await flush(el);
    expect(state).toHaveBeenLastCalledWith({
      active: false,
      running: false,
      loading: false,
    });
  });
  test('disconnect during loading can reconnect without stuck disabled state', async () => {
    const el = await mount();
    let resolve!: (value: Blob) => void;
    el.loadBlob = () =>
      new Promise(r => {
        resolve = r;
      });
    run(el);
    await flush(el);
    el.remove();
    document.body.append(el);
    await flush(el);
    resolve(new Blob(['Old']));
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBeNull();
    const state = vi.fn();
    el.onState = state;
    el.requestUpdate();
    await flush(el);
    expect(state).toHaveBeenLastCalledWith({
      active: false,
      running: false,
      loading: false,
    });
  });
  test('checks actual bytes independently of model size', async () => {
    const el = await mount();
    el.size = 1;
    el.loadBlob = async () =>
      new Blob(['x'.repeat(OFFLINE_HTML_MAX_BYTES + 1)]);
    run(el);
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBeNull();
    expect(el.shadowRoot!.querySelector('[role=alert]')?.textContent).toContain(
      '5 MiB'
    );
  });
  test('exit authenticates current frame and restores host focus', async () => {
    const el = await mount();
    el.loadBlob = async () => new Blob(['<input>']);
    run(el);
    await flush(el);
    const frame = el.shadowRoot!.querySelector('iframe')!;
    const data = { type: 'dikw:offline-html:exit', version: 1 };
    window.dispatchEvent(new MessageEvent('message', { source: window, data }));
    await flush(el);
    expect(el.shadowRoot!.querySelector('.frame')!.hasAttribute('inert')).toBe(
      false
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: { ...data, extra: true },
      })
    );
    await flush(el);
    expect(el.shadowRoot!.querySelector('.frame')!.hasAttribute('inert')).toBe(
      false
    );
    window.dispatchEvent(
      new MessageEvent('message', { source: frame.contentWindow, data })
    );
    await flush(el);
    expect(el.shadowRoot!.querySelector('.frame')!.hasAttribute('inert')).toBe(
      true
    );
    expect(document.activeElement).toBe(el);
    run(el);
    await flush(el);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBe(frame);
    expect(el.shadowRoot!.querySelector('.frame')!.hasAttribute('inert')).toBe(
      true
    );
  });
  test('exit retains iframe, reset and readonly revoke runtime', async () => {
    const el = await mount();
    el.loadBlob = async () => new Blob(['<button>Hi</button>']);
    run(el);
    await flush(el);
    const iframe = el.shadowRoot!.querySelector('iframe');
    expect(iframe).not.toBeNull();
    el.exit();
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBe(iframe);
    expect(el.shadowRoot!.querySelector('.frame')!.hasAttribute('inert')).toBe(
      true
    );
    run(el);
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBe(iframe);
    el.reset();
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBeNull();
    run(el);
    await flush(el);
    el.readOnly = true;
    el.canRun = false;
    await flush(el);
    expect(el.shadowRoot!.querySelector('iframe')).toBeNull();
  });
});
