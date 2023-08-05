const path = require('path');

module.exports = function AutoDice(mod) {

    mod.dispatch.protocol.loadCustomDefinitions(path.resolve(__dirname, 'defs'));
    mod.dispatch.addOpcode("C_ITEM_BIDDING", 20277);

    mod.game.initialize("me");

    var current_roll = null;

    var dungeon_loot = {};

    function assure(item, player)
    {
        if (!dungeon_loot[item])
        {
            dungeon_loot[item] = {};
        }

        if(!dungeon_loot[item][player])
        {
            dungeon_loot[item][player] = 0;
        }
    }

    function won(item, player)
    {
        assure(item, player);
        ++dungeon_loot[item][player];
    }

    mod.hook("S_ASK_BIDDING_RARE_ITEM", 1, event => {

        if (event.index == 1) { // the first rollable drop's index in a party will be 1
            dungeon_loot = {};
        }

		current_roll = event;

        if (handleRoll(event))
        {
            event.unk6 = 0;
            return true;
        }

	});

    mod.hook("S_RESULT_BIDDING_DICE_THROW", 1, event => {
        // gather players who participate in rolling
        if (current_roll && event.roll > -1)
        {
            assure(current_roll.item, event.id);
        }
    })

    mod.hook("S_RESULT_ITEM_BIDDING", 2, event => {
        won(current_roll.item, event.id);
        current_roll = null;
    })

    mod.hook("S_SYSTEM_MESSAGE", 1, event => {
        if (event.message == "@1193") // all dungeons are reset
        {
            dungeon_loot = {};
        }
    })

    function handleRoll(event)
    {   
        if (mod.settings.enabled)
        {
            if (mod.settings.roll.indexOf(event.item) > -1)
            {
                doRoll(event.index, true);
                return true
            }
            else if (mod.settings.pass.indexOf(event.item) > -1)
            {
                doRoll(event.index, false);
                return true
            }
            else if (mod.settings.share.indexOf(event.item) > -1)
            {
                doShare(event);
                return true
            }
        }

        return false;
    }

    function doRoll(index, askRoll)
    {
        mod.send("C_ITEM_BIDDING", 1, {
            index,
            roll: askRoll,
            pass: !askRoll,
        })
    }

    function doShare(event)
    {
        if (dungeon_loot[event.item]) // if no rolls have taken place, just roll
        {
            let my_amount = dungeon_loot[event.item][mod.game.me.gameId] ? dungeon_loot[event.item][mod.game.me.gameId] : 0;

            for (let player in dungeon_loot[event.item])
            {
                if (player == mod.game.me.gameId) continue;
    
                // if there is a player who has gotten less than me, pass
                if (dungeon_loot[event.item][player] < my_amount)
                {
                    doRoll(event.index, false);
                    return;
                }
            }
        }

        doRoll(event.index, true); 
    }

    function parseItem(itemlink)
    {
        const regex = /param="1#####(\d+)@/;
        const match = itemlink.match(regex);
        if (!match)
        {
            mod.command.message("Unable to parse item");
        }
        return match ? parseInt(match[1]) : null;
    }

    function getItemId(itemlink)
    {
        let item_id = null;

        if (itemlink)
        {
            item_id = parseItem(itemlink);
        }
        else if (current_roll)
        {
            item_id = current_roll.item;
        }
        else
        {
            mod.command.message("No item to add");
        }

        return item_id;
    }

    function addItem(type, itemlink)
    {
        const types = ["roll", "pass", "share"];
        if (types.indexOf(type) < 0)
        {
            return;
        }

        let item_id = getItemId(itemlink);
        if (item_id != null )
        {
            if (mod.settings[type].indexOf(item_id) < 0)
            {
                mod.settings[type].push(item_id);

                for (let t of types)
                {
                    if (t == type) continue;
                    mod.settings[t] = mod.settings[t].filter(it => it !== item_id);
                }

                mod.command.message(`item added to ${type}`);
            } else{
                mod.command.message("item already set");
            }

            if (current_roll && item_id == current_roll.item)
            {
                handleRoll(current_roll);
            }
        }
    }

    function roll(itemlink)
    {
        addItem("roll", itemlink);
    }

    function pass(itemlink)
    {
        addItem("pass", itemlink);
    }

    function share(itemlink)
    {
        addItem("share", itemlink);
    }

    function toggleEnabled()
    {
        mod.settings.enabled = !mod.settings.enabled;
        mod.command.message(`auto dice turned ${mod.settings.enabled ? "ON" : "OFF"}`);
    }
    
    function manual(item)
    {
        let item_id = getItemId(itemlink);

        if (item_id != null )
        {
            mod.settings.roll = mod.settings.roll.filter(it => it !== item_id);
            mod.settings.pass = mod.settings.pass.filter(it => it !== item_id);
            mod.command.message("item added to manual");
        }else{
            mod.command.message("item already set");
        }
    }

    function requestRoll()
    {
        if (current_roll)
        {
            doRoll(current_roll.index, true);
        }
    }

    function requestPass()
    {
        if (current_roll)
        {
            doRoll(current_roll.index, false);
        }
    }

    mod.command.add("dice", { $default: toggleEnabled, roll, pass, manual, share, do: {roll: requestRoll, pass: requestPass} });

    this.destructor = () => {
        mod.command.remove(['dice']);
    }
}