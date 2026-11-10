function addImpressumListener() {
    let impressum = document.querySelector('.impressum');

    impressum.addEventListener('mouseenter', function () {
        impressum.style.opacity = "100%";
    })
}

export {addImpressumListener};
