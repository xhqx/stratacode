const fs = require('fs');
const pngPath = 'icon.png';
const base64Data = fs.readFileSync(pngPath, 'base64');
const svgContent = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image href="data:image/png;base64,${base64Data}" width="512" height="512" />
</svg>`;

const targets = [
  'packages/strata-docs/public/img/strata-v1-white.svg',
  'packages/strata-docs/public/img/strata-v1.svg',
  'packages/strata-docs/public/img/logo.svg',
  'packages/ui/src/assets/favicon/favicon-v3.svg',
  'packages/ui/src/assets/favicon/favicon.svg',
  'packages/app/public/favicon.svg',
  'packages/app/public/favicon-v3.svg'
];

for (const target of targets) {
  if (fs.existsSync(target)) {
    fs.writeFileSync(target, svgContent);
    console.log('Updated ' + target);
  }
}
