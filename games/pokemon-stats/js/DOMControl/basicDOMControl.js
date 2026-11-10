import { loadShowdownTiersIntoSelect } from "./Renderer/SelectRenderer.js";
import { showModal, showResult } from "./Renderer/ModalControl.js";

function clear() {
    document.body.style.backgroundColor = "";
    document.querySelector('input#solution').value = "";

    document.querySelectorAll('span[class*="-value"]').forEach(el => el.classList.add('d-none'));
    document.querySelectorAll('.help-row').forEach(el => el.classList.add('d-none'));
}

function prepareDocument() {
    loadShowdownTiersIntoSelect();


    document.querySelector('#giveUp').addEventListener('click', function() {        
        showModal(false);
    });
    
    document.querySelector('button[type="submit"]').addEventListener('click', showResult);
    document.querySelector('.js-show-values').addEventListener('click', function() {
        document.querySelectorAll('span[class*="-value"]').forEach(el => el.classList.remove('d-none'));
    });
}

function addSubmitListener() {
    document.addEventListener('keydown', function(event) {
        if ("Enter" === event.key ) { 
            document.querySelector('button[type="submit"]').click();
        }   
    });
}


export { clear, prepareDocument };