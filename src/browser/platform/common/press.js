export function press(el, key) {
  ['keydown', 'keypress', 'keyup'].forEach(t =>
    el.dispatchEvent(new KeyboardEvent(t, { key, code: key, bubbles: true }))
  );
}
