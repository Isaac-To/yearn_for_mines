const fs = require('fs');
const file = 'openspec/changes/crafting-macro-tool/tasks.md';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/- \[ \] /g, '- [x] ');
fs.writeFileSync(file, content);
