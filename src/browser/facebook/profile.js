import S from './selectors.js';

export async function profile() {
  const name      = document.querySelector(S.profilename)?.innerText?.trim();
  const bio       = document.querySelector(S.profilebio)?.innerText?.trim();
  const followers = document.querySelector('[aria-label*="follower"]')?.innerText?.trim();
  const following = document.querySelector('[aria-label*="following"]')?.innerText?.trim();

  return { name, bio, followers, following, url: window.location.href };
}
