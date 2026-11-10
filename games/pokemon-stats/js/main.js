import { getRandomPokemon, loadPokemonAssets } from "./Pokedex/pokemonUtility.js";
import { setStats } from "./FormControl/bars.js"
import { clear, prepareDocument } from "./DOMControl/basicDOMControl.js"
import { addAutocompleteToSelect } from "./DOMControl/Renderer/autocomplete.js";
import { renderBars } from "./DOMControl/Renderer/BarsRenderer.js";
import Help from "./DOMControl/Renderer/help.js";


if ('complete' === document.readyState) {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main);
}

function main() {
    renderBars();
    loadNewPokemon();
    prepareDocument();
    addAutocompleteToSelect();
        
    document.querySelectorAll('.reload').forEach(button => button.addEventListener('click', function() {
        loadNewPokemon();
    }));

    Help.addHelpListener();
}


function loadNewPokemon() {
    clear();

    let pokemon = getRandomPokemon();

    setStats(pokemon);
    loadPokemonAssets(pokemon);
    
    document.querySelector('.solution').innerHTML = pokemon.name;

    Help.setPokemon(pokemon);
    Help.init();
}
