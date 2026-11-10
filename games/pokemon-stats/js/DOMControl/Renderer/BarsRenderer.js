function renderBars() {
    let barsContainer = document.querySelector('.js-bars-container');

    let statlist = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    let htmlLines = [];

    for (let stat of statlist) {
        let html = [
            '<div class="stat-wrapper">',
            '<div class="stat-label">',
            stat,
            '</div>',
            '<div class="stat js-',
            stat,
            '">',
            '</div>',
            '<div class="stat-value">',
            ' <span class="js-',
            stat,
            '-value d-none">',
            '</span>',
            '</div></div>',
        ];

        htmlLines.push(html.join(""));
    }

    barsContainer.innerHTML = htmlLines.join("");
}

export {renderBars};