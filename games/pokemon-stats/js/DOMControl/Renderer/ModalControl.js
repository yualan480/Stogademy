function showResult() {
    if (document.querySelector('.solution').textContent.trim().toLowerCase() === document.querySelector('#solution').value.trim().toLowerCase()) {
        showModal(true);
        return;
    }

    showInputError();
}

function showModal(success) {
    var myModal = new bootstrap.Modal(document.getElementById('reloadModal'), {
        keyboard: false
    });

    if (true == success) {
        document.body.style.backgroundColor = "green";
        document.querySelector('.modal-body-text').innerHTML = "You identified the Pokémon from its base stats!";
        document.querySelector('.modal-title').innerHTML = "Correct!";

        myModal.toggle();


        return;
    }

    document.body.style.backgroundColor = "yellow";

    document.querySelector('.modal-body-text').innerHTML = "The Pokémon was " + document.querySelector('.solution').innerHTML;
    document.querySelector('.modal-title').innerHTML = "Answer revealed";

    myModal.toggle();
}

function showInputError() {
    let input = document.querySelector('#solution');

    input.classList.add('border-error');
    document.querySelector('span.input-error').classList.remove('d-none');

    window.setTimeout(function() {
        input.classList.remove('border-error');
        document.querySelector('span.input-error').classList.add('d-none');
    }, 3000)
}

export {showInputError, showModal, showResult};
