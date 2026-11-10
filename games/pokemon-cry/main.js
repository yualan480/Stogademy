"use strict";
const REVEAL_TIMEOUT = 1200;
const PING_TIMEOUT = 600;
const VOLUME = 0.5;
const enrichPokemon = (def, paths) => {
    var _a, _b;
    let spriteId = def.species_id;
    let cryId = def.species_id;
    const formsAvailable = def.formSprites === false ? [] : ((_a = def.forms) !== null && _a !== void 0 ? _a : []).filter((form) => form[0] !== '!');
    // 50/50 to select another form.
    if (formsAvailable.length > 0 && Math.random() > 0.5) {
        const form = formsAvailable[Math.floor(Math.random() * formsAvailable.length)];
        const formName = form.replace(/^@/, '');
        spriteId += `-${formName}`;
        if (def.formSounds || form.startsWith('@')) {
            cryId += `-${formName}`;
        }
    }
    return Object.assign(Object.assign({}, def), { sprite: `media/sprites/${paths.spritesDir}/${spriteId}.png`, cry: `media/cries${paths.criesDir}/${cryId}${(_b = paths.criesExt) !== null && _b !== void 0 ? _b : '.mp3'}` });
};
const createGeneration = (defs, config) => {
    const list = defs.map((def) => enrichPokemon(def, config));
    return Object.assign(Object.assign({}, config), { pokemon: list, pokemonLeft: list.slice() });
};
// For every generation, keep a copy of all pokemon and the pokemon
// that are left to be guessed from that generation.
const gens = {
    1: createGeneration(pokemon.gen1, { enabled: true, spritesDir: 'yellow', criesDir: '/old' }),
    2: createGeneration(pokemon.gen2, { enabled: false, spritesDir: 'crystal', criesDir: '/old' }),
    3: createGeneration(pokemon.gen3, { enabled: false, spritesDir: 'emerald', criesDir: '/old' }),
    4: createGeneration(pokemon.gen4, { enabled: false, spritesDir: 'platinum', criesDir: '/old' }),
    5: createGeneration(pokemon.gen5, {
        enabled: false,
        spritesDir: 'black-white',
        criesDir: '/old',
    }),
    6: createGeneration(pokemon.gen6, { enabled: false, spritesDir: 'x-y', criesDir: '' }),
    7: createGeneration(pokemon.gen7, {
        enabled: false,
        spritesDir: 'sun-moon',
        criesDir: '',
        criesExt: '.wav',
    }),
};
// Gets a list of lists of pokemon from all enabled generations.
const getPokemon = (key) => {
    const all = [];
    for (const gen in gens) {
        const d = gens[gen];
        if (d.enabled) {
            all.push(d[key]);
        }
    }
    return all;
};
const getAllPokemon = () => getPokemon('pokemon');
const getPokemonLeft = () => getPokemon('pokemonLeft');
let allPokemon, pokemonLeft;
// This is called when the game first begins, and whenever
// the generations enabled is updated.
const updatePokemon = () => {
    allPokemon = getAllPokemon();
    pokemonLeft = getPokemonLeft();
};
updatePokemon();
// Gets a random pokemon from a list of lists, which will be either
// all pokemon from enabled generations, or all pokemon that are left.
const randomFromLists = (lists, remove) => {
    const list = lists[~~(Math.random() * lists.length)];
    const index = ~~(Math.random() * list.length);
    const pkm = list[index];
    if (remove) {
        list.splice(index, 1);
    }
    return pkm;
};
// Returns true if there are any pokemon left to play.
const arePokemonLeft = () => {
    for (let i = 0, len = pokemonLeft.length; i < len; i++) {
        if (pokemonLeft[i].length) {
            return true;
        }
    }
    return false;
};
// Keep track of player stats.
let totalGuesses = 0;
let correctGuesses = 0;
let restorePlayFocus = false;
const guessedWrong = [];
const requireElement = (selector) => {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error('Missing required element: ' + selector);
    }
    return element;
};
const optionsElement = requireElement('.options');
const optionElements = document.querySelectorAll('.option');
const genElements = document.querySelectorAll('.gen');
const successElement = requireElement('.success');
const failureElement = requireElement('.failure');
const fillerElement = requireElement('.filler');
const scoreElement = requireElement('.score');
const spriteElement = requireElement('.pokemon-sprite');
const playElement = requireElement('.play');
const statusElement = requireElement('.status');
const setHidden = (element, hidden) => {
    element.classList.toggle('hidden', hidden);
};
const setRumble = (element, active) => {
    element.classList.toggle('rumble', active);
};
const displayName = (pokemon) => pokemon.name || pokemon.identifier;
playElement.addEventListener('click', () => {
    theCry.play();
});
for (let i = 0, len = genElements.length; i < len; i++) {
    const genElement = genElements[i];
    const generation = Number(genElement.dataset.gen);
    genElement.setAttribute('aria-pressed', String(gens[generation].enabled));
    genElement.addEventListener('click', () => {
        const data = gens[generation];
        data.enabled = !data.enabled;
        genElement.setAttribute('aria-pressed', String(data.enabled));
        updatePokemon();
    });
}
// Pick decoys that are not the answer, for the player to choose between.
const pickDecoyPokemon = (speciesId, count) => {
    const seenIds = new Set([speciesId]);
    const decoys = [];
    while (decoys.length < count) {
        const candidate = randomFromLists(allPokemon, false);
        if (!seenIds.has(candidate.species_id)) {
            seenIds.add(candidate.species_id);
            decoys.push(candidate);
        }
    }
    return decoys;
};
const shuffle = (array) => {
    let currentIndex = array.length;
    let tmp, randomIndex;
    while (0 !== currentIndex) {
        randomIndex = ~~(Math.random() * currentIndex);
        currentIndex--;
        tmp = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = tmp;
    }
    return array;
};
let thePokemon;
let theCry;
// Called whenever the user guesses on a pokemon.
const guess = (option) => {
    totalGuesses++;
    const isCorrect = option.dataset.speciesId === thePokemon.species_id;
    restorePlayFocus = document.activeElement === option;
    if (isCorrect) {
        correctGuesses++;
    }
    else {
        guessedWrong.push(thePokemon);
    }
    const scoreText = `${correctGuesses} / ${totalGuesses}`;
    const resultElement = isCorrect ? successElement : failureElement;
    setHidden(successElement, !isCorrect);
    setHidden(failureElement, isCorrect);
    scoreElement.textContent = scoreText;
    resultElement.appendChild(scoreElement);
    statusElement.textContent = isCorrect
        ? `Correct. Score ${scoreText}.`
        : `Wrong. The answer was ${displayName(thePokemon)}. Score ${scoreText}.`;
    setHidden(fillerElement, true);
    // Disable all buttons.
    for (let i = 0, len = optionElements.length; i < len; i++) {
        const optionElement = optionElements[i];
        optionElement.disabled = true;
        // Label the pokemon that was the answer.
        if (optionElement.dataset.speciesId === thePokemon.species_id) {
            optionElement.classList.add('right');
        }
    }
    // Remove the play button and show the pokemon.
    setHidden(playElement, true);
    spriteElement.setAttribute('src', thePokemon.sprite);
    spriteElement.alt = displayName(thePokemon);
    setHidden(spriteElement, false);
    if (arePokemonLeft()) {
        setTimeout(nextRound, REVEAL_TIMEOUT);
    }
    else {
        displayEndScreen();
    }
};
const startRumble = () => setRumble(playElement, true);
const stopRumble = () => setRumble(playElement, false);
const nextRound = () => {
    thePokemon = randomFromLists(pokemonLeft, true);
    let roundPokemons = pickDecoyPokemon(thePokemon.species_id, 3);
    roundPokemons.push(thePokemon);
    roundPokemons = shuffle(roundPokemons);
    for (let i = 0, len = optionElements.length; i < len; i++) {
        const optionElement = optionElements[i];
        const pokemon = roundPokemons[i];
        optionElement.dataset.speciesId = pokemon.species_id;
        optionElement.textContent = displayName(pokemon);
        optionElement.disabled = false;
        optionElement.classList.remove('right');
    }
    theCry = new Audio(thePokemon.cry);
    theCry.volume = VOLUME;
    theCry.autoplay = true;
    theCry.addEventListener('play', startRumble);
    theCry.addEventListener('ended', stopRumble);
    setHidden(playElement, false);
    if (restorePlayFocus) {
        playElement.focus();
        restorePlayFocus = false;
    }
    spriteElement.alt = 'Mystery Pokemon';
    setHidden(spriteElement, true);
};
// Start the very first round in the beginning.
nextRound();
const displayEndScreen = () => {
    const endScreen = requireElement('.end-screen');
    endScreen.classList.remove('hidden');
    endScreen.tabIndex = -1;
    endScreen.focus();
    const ping = new Audio('media/ping.mp3');
    ping.volume = VOLUME;
    for (let i = 0, len = guessedWrong.length; i < len; i++) {
        const pokemon = guessedWrong[i];
        const cry = new Audio(pokemon.cry);
        cry.volume = VOLUME;
        const wrapper = document.createElement('button');
        wrapper.type = 'button';
        wrapper.className = 'end-pokemon';
        wrapper.dataset.tooltip = displayName(pokemon);
        wrapper.setAttribute('aria-label', `Play ${displayName(pokemon)}'s cry`);
        const image = document.createElement('img');
        image.className = 'pokemon-sprite';
        image.setAttribute('src', pokemon.sprite);
        image.alt = '';
        cry.addEventListener('play', () => setRumble(image, true));
        cry.addEventListener('ended', () => setRumble(image, false));
        wrapper.addEventListener('click', () => cry.play());
        wrapper.appendChild(image);
        setTimeout(() => {
            ping.play();
            endScreen.appendChild(wrapper);
        }, (i + 1) * PING_TIMEOUT);
    }
};
// Called when the user clicks on one of the guesses.
optionsElement.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    const option = target.closest('.option');
    if (!option || option.disabled) {
        return;
    }
    guess(option);
});
