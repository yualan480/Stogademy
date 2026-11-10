import { BattlePokedex } from "./pokedex.js";

function getRandomPokemon() {
    const activeTiers = findActiveTiers();
    const available = Object.values(BattlePokedex).filter(p => p.num > 0 && p.num <= 807 && !p.forme && !p.isNonstandard);
    const filtered = available.filter(p => activeTiers.includes(p.tier));
    const pool = filtered.length ? filtered : available;
    return pool[Math.floor(Math.random() * pool.length)];
}

function findActiveTiers() {
    let tiers = [];

    document.querySelectorAll('.tiers-select-area input[id^=tier-checkbox-]').forEach((checkbox) => {
        if (true !== checkbox.checked) {
            return;
        }

        tiers.push(checkbox.name);
    });

    return tiers;
}

function getMaxOfEachStat() {
    let max = {
        "hp": 0,
        "atk": 0,
        "def": 0,
        "spa": 0,
        "spd": 0,
        "spe": 0,
    }

    for (let mon in BattlePokedex) {
        for (let stat in BattlePokedex[mon].baseStats) {
            if (BattlePokedex[mon].baseStats[stat] > max[stat]) {
                max[stat] = BattlePokedex[mon].baseStats[stat];
            }
        }
    }

    return max;
}

function loadPokemonAssets(pokemon) {
    const n = pokemon.num;
    const dir = n <= 151 ? 'yellow' : n <= 251 ? 'crystal' : n <= 386 ? 'emerald' : n <= 493 ? 'platinum' : n <= 649 ? 'black-white' : n <= 721 ? 'x-y' : 'sun-moon';
    const img = document.querySelector('.modal-body-image img');
    img.hidden = false;
    img.alt = pokemon.name;
    img.onerror = () => { img.hidden = true; };
    img.src = '../pokemon-cry/media/sprites/' + dir + '/' + n + '.png';
}

function cleanupName(name) {
    const regex = /[^a-zA-Z]/;
    
    return name.toLowerCase().replace(regex, "");
}

export {getRandomPokemon, getMaxOfEachStat, loadPokemonAssets};