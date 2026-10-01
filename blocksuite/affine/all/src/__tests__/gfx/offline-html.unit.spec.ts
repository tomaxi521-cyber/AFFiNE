import { describe, expect, test } from 'vitest';

import {
  buildOfflineHtmlSrcdoc,
  isOfflineHtml,
  OFFLINE_HTML_MAX_BYTES,
} from '../../../../blocks/attachment/src/offline-html.js';

describe('offline HTML attachment boundary', () => {
  test.each([
    ['demo.html', '', true],
    ['DEMO.HTM', 'application/octet-stream', true],
    ['data.HTML', 'text/plain', true],
    ['page', 'text/html', true],
    ['page.html', 'application/xhtml+xml', false],
    ['image.svg', 'image/svg+xml', false],
    ['file.pdf', 'application/pdf', false],
    ['readme.txt', 'text/plain', false],
  ])(
    'recognizes %s (%s) without widening other media',
    (name, type, expected) => {
      expect(isOfflineHtml({ name, type })).toBe(expected);
    }
  );

  test('caps interactive artifacts at five MiB independent of upload limits', () => {
    expect(OFFLINE_HTML_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  test('keeps executable artifact in one nested srcdoc, not trusted wrapper markup', () => {
    const source =
      '<!doctype html><html><body><button onclick="window.count=1">Go</button><!-- </iframe><script>window.escape=1</script> --><script>window.actual=1</script></body></html>';
    const wrapper = new DOMParser().parseFromString(
      buildOfflineHtmlSrcdoc(source),
      'text/html'
    );
    expect(wrapper.querySelectorAll('iframe')).toHaveLength(1);
    expect(wrapper.querySelectorAll('script')).toHaveLength(0);
    expect(wrapper.querySelector('iframe')?.getAttribute('sandbox')).toBe(
      'allow-scripts'
    );
    const inner = wrapper.querySelector('iframe')!.getAttribute('srcdoc')!;
    expect(inner).toContain(source);
    expect(inner.indexOf('Content-Security-Policy')).toBeLessThan(
      inner.indexOf(source)
    );
    const outerPolicy = wrapper
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    expect(outerPolicy).toContain('frame-src about:');
    expect(outerPolicy).toContain("connect-src 'none'");
    expect(outerPolicy).not.toContain('https:');
    const document = new DOMParser().parseFromString(inner, 'text/html');
    const policy = document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    for (const directive of [
      'connect-src',
      'frame-src',
      'object-src',
      'base-uri',
      'form-action',
    ]) {
      expect(policy).toContain(directive + " 'none'");
    }
    expect(policy).toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("style-src 'unsafe-inline'");
    expect(policy).toContain('img-src data:');
    expect(
      wrapper.querySelector('iframe')!.getAttribute('sandbox')
    ).not.toMatch(/allow-(same-origin|forms|popups|top-navigation)/);
  });

  test('roundtrips quote/entity/tag escape bytes without promoting them into wrapper', () => {
    const source =
      '<!-- &quot; &amp; "> </iframe> --><p title="a &amp; b">测试</p>';
    const wrapper = new DOMParser().parseFromString(
      buildOfflineHtmlSrcdoc(source),
      'text/html'
    );
    expect(wrapper.querySelectorAll('iframe')).toHaveLength(1);
    expect(wrapper.querySelectorAll('p')).toHaveLength(0);
    expect(wrapper.querySelector('iframe')!.getAttribute('srcdoc')).toContain(
      source
    );
  });
});
