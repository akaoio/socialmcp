import S from './selectors.js';

export async function profile() {
  const name = document.querySelector(S.profilename)?.innerText?.trim();
  const bios = [...document.querySelectorAll(S.profilebio)];
  const bio  = bios.find(el => el.innerText?.trim())?.innerText?.trim();

  return { name, bio, url: window.location.href };
}
