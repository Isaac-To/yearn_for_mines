const fs = require('fs');
const file = 'packages/mc-mcp-server/src/tools/macro/craft_macro.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
/                 await bot\.craft\(tableRecipes\[0\], 1, undefined\);\n               matching: \(b\) => \{/,
`               await bot.craft(tableRecipes[0], 1, undefined);
            }

          // Equip and Place Table
          const refBlocks = bot.findBlocks({
             matching: (b) => {`
);
fs.writeFileSync(file, code);
