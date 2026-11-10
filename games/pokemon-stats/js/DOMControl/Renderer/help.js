class Help {
    #button;
    #container;
    #abilities;
    #types;
    #pokemon;
    #elements = [];

    constructor () {
        this.#button = document.querySelector('.js-show-help');
        this.#container = document.querySelector('.help-container');

        this.#abilities = {
            '0': this.#container.querySelector('.ability1'),
            '1': this.#container.querySelector('.ability2'),
            'H': this.#container.querySelector('.hidden-ability')
        }

        this.#types = {
            '0': this.#container.querySelector('.type1'),
            '1': this.#container.querySelector('.type2')
        }
    }

    setPokemon(pokemon) {
        this.#pokemon = pokemon;
    }

    init() {
        this.#elements = [];

        for (let key in this.#abilities) {
            this.#fillValueAndAddElementToList(this.#abilities[key], this.#pokemon.abilities[key]);
        }

        for (let key in this.#types) {
            this.#fillValueAndAddElementToList(this.#types[key], this.#pokemon.types[key]);
        }
    }

    addHelpListener() {
        const self = this;
        
        this.#button.addEventListener('click', function() {
            self.#showNextHelp();
        });
    }

    #showNextHelp() {
        for (let element of this.#elements) {
            if (element.classList.contains('d-none')) {
                element.classList.remove('d-none');
                return;
            }
       }
    }

    clear() {
        this.#elements = [];
    }

    #fillValueAndAddElementToList(element, value) {
        if (undefined === value) {
            return;
        }

        element.innerHTML = value;
        this.#elements.push(element.parentElement);
    }
}

export default new Help();
