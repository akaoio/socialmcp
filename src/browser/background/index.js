import { opendashboard } from './opendashboard.js';
import { onmessage }     from './onmessage.js';

chrome.action.onClicked.addListener(opendashboard);
chrome.runtime.onMessage.addListener(onmessage);
