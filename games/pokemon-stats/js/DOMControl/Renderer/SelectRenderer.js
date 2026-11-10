import { BattlePokedex } from "../../Pokedex/pokedex.js";

function loadShowdownTiersIntoSelect() {
    let tiers = [];
    let tierSelect = document.querySelector('.tiers-select-area');

    for (let pokemon in BattlePokedex) {
        if(tiers.includes(BattlePokedex[pokemon]["tier"])) {
            continue; 
        }
    
        tiers.push(BattlePokedex[pokemon]["tier"]);
    }

    let counter = 0;

    for (let tier of tiers) {
        counter++;

        if (tier) {
            let htmlParts = [
                '<div>',
                '<input type="checkbox" id="tier-checkbox-',
                counter.toString(),
                '" name="',
                tier,
                '" checked/>',
                '<label for="tier-checkbox-',
                counter.toString(),
                '"> ',
                tier,
                '</label>',
                '</div>'
            ];

            tierSelect.querySelector('.tier-col-' + (counter % 3).toString()).innerHTML += htmlParts.join('');
        }
    }

    attachListeners();
}

function attachListeners() {
    document.querySelector('button#tiers-select-all').addEventListener('click', function() {
        document.querySelectorAll('.tiers-select-area input[id^=tier-checkbox-]').forEach((checkbox) => {
            checkbox.checked = true;
        });
    });

    document.querySelector('button#tiers-select-none').addEventListener('click', function() {
        document.querySelectorAll('.tiers-select-area input[id^=tier-checkbox-]').forEach((checkbox) => {
            checkbox.checked = false;
        });
    });
}

export {loadShowdownTiersIntoSelect};
