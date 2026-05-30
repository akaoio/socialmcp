export function finddialog() {
  return [...document.querySelectorAll('[role="dialog"]')]
    .find(d => d.querySelector('[contenteditable="true"]')) ?? null;
}
