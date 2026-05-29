const S = {
  composerbtn:  '[data-testid="SideNav_NewTweet_Button"], [aria-label="Post"]',
  composerbox:  '[data-testid="tweetTextarea_0"]',
  postbtn:      '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',

  article:      'article[data-testid="tweet"]',
  tweettext:    '[data-testid="tweetText"]',
  tweetauthor:  '[data-testid="User-Name"]',
  tweetlink:    'a[href*="/status/"]',

  likebtn:      '[data-testid="like"]',

  replybtn:     '[data-testid="reply"]',
  replyinput:   '[data-testid="tweetTextarea_0"]',
  replybtnpost: '[data-testid="tweetButton"]',

  searchbox:    '[data-testid="SearchBox_Search_Input"]',

  followbtn:    '[data-testid$="-follow"]',
  unfollowbtn:  '[data-testid$="-unfollow"]',
  unfollowconfirm: '[data-testid="confirmationSheetConfirm"]',

  dmcompose:    '[aria-label="New message"]',
  dmsearch:     '[aria-label="Search people"]',
  dmresult:     '[data-testid="TypeaheadUser"]',
  dmnext:       '[data-testid="multi-destination-user-form-next-button"]',
  dminput:      '[data-testid="dmComposerTextInput"]',
  dmsend:       '[data-testid="dmComposerSendButton"]',

  profilename:   '[data-testid="UserName"]',
  profilebio:    '[data-testid="UserDescription"]',
  followerslink: 'a[href$="/followers"]',
  followinglink: 'a[href$="/following"]',
};

export default S;
