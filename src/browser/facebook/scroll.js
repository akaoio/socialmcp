import S from './selectors.js';
import { scroll as commonscroll } from '../common/scroll.js';

export function scroll(params) {
  return commonscroll(params, {
    article: S.article,
    text:    S.postcontent,
    author:  S.postauthor,
    link:    S.postlink,
  });
}
