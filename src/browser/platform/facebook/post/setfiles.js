export async function setfiles(fileinput, urls) {
  const dt = new DataTransfer();
  for (const url of urls) {
    const res  = await fetch(url);
    const blob = await res.blob();
    const ext  = blob.type.split('/')[1] ?? 'jpg';
    dt.items.add(new File([blob], `upload.${ext}`, { type: blob.type }));
  }
  fileinput.multiple = true;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (setter) setter.call(fileinput, dt.files);
  else fileinput.files = dt.files;
  fileinput.dispatchEvent(new Event('change',     { bubbles: true }));
  fileinput.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
