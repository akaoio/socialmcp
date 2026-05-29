import S from './selectors.js';

export async function profile() {
  const name      = document.querySelector(S.profilename)?.innerText?.trim();
  const bio       = document.querySelector(S.profilebio)?.innerText?.trim();
  const followers = document.querySelector(S.followerslink)?.innerText?.trim();
  const following = document.querySelector(S.followinglink)?.innerText?.trim();

  return { name, bio, followers, following, url: window.location.href };
}
