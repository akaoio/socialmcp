/**
 * facebook/selectors.js
 * All CSS selectors for facebook.com in one place.
 * Update only here when Facebook changes markup.
 */

const S = {
  // Feed composer
  composerbox:     '[contenteditable="true"][role="textbox"]',

  // Feed articles
  article:         '[role="article"]',
  postcontent:     '[data-ad-comet-preview="message"], [data-ad-preview="message"]',
  postauthor:      'h3 a, h4 a',
  postlink:        'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]',

  // Reactions
  likebtn:         '[aria-label^="Like"][role="button"]:not([aria-label*="comment"])',

  // Comments
  commentarea:     '[aria-label="Write a comment…"]',
  commentinput:    '[contenteditable="true"][aria-label="Write a comment…"]',

  // Search
  searchbox:       '[aria-label="Search Facebook"]',

  // Follow / Unfollow
  followbtn:       '[aria-label="Follow"][role="button"]',
  followingbtn:    '[aria-label="Following"][role="button"]',
  unfollowconfirm: '[aria-label="Unfollow"][role="button"]',

  // Message
  messagebtn:      '[aria-label="Message"][role="button"]',
  messageinput:    '[contenteditable="true"][aria-label*="essage"]',

  // Profile
  profilename:     'h1',
  profilebio:      '[data-overflowtooltip-content]',

  // Post composer (inside compose dialog)
  photobtn:        '[aria-label="Photo/video"]',
  fileinput:       'input[type="file"][accept*="video/mp4"]',
  nextbtn:         '[aria-label="Next"]',
  postbtn:         '[aria-label="Post"]',
  whatsappdismiss: '[aria-label="Not now"]',
};

export default S;
