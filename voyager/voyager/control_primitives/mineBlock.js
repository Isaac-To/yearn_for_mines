async function mineBlock(bot, name, count = 1) {
    if (typeof name !== "string") {
        throw new Error(`name for mineBlock must be a string`);
    }
    if (typeof count !== "number") {
        throw new Error(`count for mineBlock must be a number`);
    }
    const blockByName = mcData.blocksByName[name];
    if (!blockByName) {
        throw new Error(`No block named ${name}`);
    }
    const blocks = bot.findBlocks({
        matching: [blockByName.id],
        maxDistance: 32,
        count: 1024,
    });
    if (blocks.length === 0) {
        bot.chat(`No ${name} nearby, please explore first`);
        _mineBlockFailCount++;
        if (_mineBlockFailCount > 10) {
            throw new Error(
                "mineBlock failed too many times, make sure you explore before calling mineBlock"
            );
        }
        return;
    }

    let collected = 0;
    for (let i = 0; i < blocks.length && collected < count; i++) {
        const block = bot.blockAt(blocks[i]);
        if (!block) continue;
        try {
            // Navigate adjacent to the block
            await bot.pathfinder.goto(new GoalLookAtBlock(block.position, bot.world));
            // Dig the block directly
            await bot.dig(block);
            collected++;
            // Move right on top of where the block was to trigger item pickup
            await bot.pathfinder.goto(
                new GoalBlock(block.position.x, block.position.y, block.position.z)
            );
            // Wait for item to be collected (up to 2 seconds)
            await bot.waitForTicks(40);
        } catch (err) {
            // fallback: try collectBlock
            try {
                await bot.collectBlock.collect(block, { ignoreNoPath: true });
                collected++;
            } catch (_) {}
        }
    }

    bot.save(`${name}_mined`);
}
