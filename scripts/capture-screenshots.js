const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const screenshotsDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const indexHtmlPath = path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const fileUrl = 'file:///' + indexHtmlPath;

console.log('Using browser:', CHROME_PATH);

const desktopShot = path.join(screenshotsDir, 'screenshot-desktop.png');
const mobileShot = path.join(screenshotsDir, 'screenshot-mobile.png');
const phonePortraitShot = path.join(screenshotsDir, 'screenshot-phone-portrait.png');

console.log('1. Capturing desktop screenshot (1280x720)...');
execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=1280,720 --screenshot="${desktopShot}" "${fileUrl}"`, { stdio: 'inherit' });

console.log('2. Capturing mobile screenshot (750x1334)...');
execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=750,1334 --screenshot="${mobileShot}" "${fileUrl}#drums"`, { stdio: 'inherit' });

console.log('3. Capturing phone portrait screenshot (390x844)...');
execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=390,844 --screenshot="${phonePortraitShot}" "${fileUrl}#synth"`, { stdio: 'inherit' });

const phoneFullShot = path.join(screenshotsDir, 'screenshot-phone-full.png');
console.log('4. Capturing phone full-page screenshot (390x1400)...');
execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=390,1400 --screenshot="${phoneFullShot}" "${fileUrl}#synth"`, { stdio: 'inherit' });

console.log('✓ Desktop screenshot:', fs.statSync(desktopShot).size, 'bytes');
console.log('✓ Mobile screenshot:', fs.statSync(mobileShot).size, 'bytes');
console.log('✓ Phone portrait screenshot:', fs.statSync(phonePortraitShot).size, 'bytes');

