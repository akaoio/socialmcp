/**
 * common/utils.js
 * Shared DOM utilities for all platform content scripts.
 * Exported as plain functions — rollup tree-shakes unused ones per platform.
 */

export function wait(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return reject(new Error(`Timeout: ${selector}`));
      setTimeout(check, 200);
    })();
  });
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function type(el, text) {
  el.focus();
  if (el.isContentEditable) {
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, text);
  } else {
    const proto  = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function press(el, key) {
  ['keydown', 'keypress', 'keyup'].forEach(t =>
    el.dispatchEvent(new KeyboardEvent(t, { key, code: key, bubbles: true }))
  );
}
