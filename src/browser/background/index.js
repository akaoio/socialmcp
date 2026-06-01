import { onmessage } from './onmessage.js';
import './peer.js';

chrome.runtime.onMessage.addListener(onmessage);
