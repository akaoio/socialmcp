const S = {
  newpostbtn:   'svg[aria-label="New post"]',
  composerimg:  'input[type="file"][accept*="image"]',
  compositext:  '[aria-label="Write a caption…"]',
  nextstep:     'button:has-text("Next"), div[role="button"]:has-text("Next")',
  sharebtn:     'div[role="button"]:has-text("Share")',

  article:      'article',
  postcontent:  'div > span:not([class])',
  postauthor:   'header a',
  postlink:     'a[href*="/p/"]',

  likebtn:      'svg[aria-label="Like"], svg[aria-label="Unlike"]',

  commentbtn:   'svg[aria-label="Comment"]',
  commentinput: 'textarea[aria-label="Add a comment…"]',
  commentpost:  'div[role="button"]:has-text("Post")',

  searchbox:    'input[placeholder="Search"]',
  searchresult: 'div[role="button"]',

  followbtn:    'button:has-text("Follow")',
  unfollowbtn:  'button:has-text("Following"), button:has-text("Requested")',
  unfollowconfirm: 'button:has-text("Unfollow")',

  dmcompose:    'svg[aria-label="New message"]',
  dmsearch:     'input[placeholder="Search…"]',
  dmresult:     'div[role="button"]',
  dmnext:       'div[role="button"]:has-text("Next")',
  dminput:      'textarea[placeholder="Message…"]',
  dmsend:       'div[role="button"]:has-text("Send")',

  profilename:     'h2',
  profilebio:      'div.-vDIg span, section > div:nth-child(2)',
  followerscount:  'a[href$="/followers/"] span, button:has-text("followers") span',
  followingcount:  'a[href$="/following/"] span',
};

export default S;
