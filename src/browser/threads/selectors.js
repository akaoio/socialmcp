const S = {
  newpostbtn:   '[aria-label="Create"]',
  composerbox:  'div[contenteditable="true"][role="textbox"]',
  mediainput:   'input[type="file"]',
  postbtn:      'div[role="button"]:has-text("Post")',

  article:      'article',
  postcontent:  'span[dir="auto"]',
  postauthor:   'a[role="link"] span',
  postlink:     'a[href*="/post/"]',

  likebtn:      'svg[aria-label="Like"], svg[aria-label="Unlike"]',

  replybtn:     'svg[aria-label="Reply"]',
  replyinput:   'div[contenteditable="true"][role="textbox"]',
  replypost:    'div[role="button"]:has-text("Post")',

  searchbox:    'input[name="q"], input[placeholder*="earch"]',

  followbtn:    'div[role="button"]:has-text("Follow")',
  unfollowbtn:  'div[role="button"]:has-text("Following")',
  unfollowconfirm: 'div[role="button"]:has-text("Unfollow")',

  profilename:  'h1, h2',
  profilebio:   'span[dir="auto"]:not(h1 span):not(h2 span)',
};

export default S;
