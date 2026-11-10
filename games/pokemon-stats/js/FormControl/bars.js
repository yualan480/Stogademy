function setStats(pokemon) {
    const maxStats = {
        "hp": 255,
        "atk": 250,
        "def": 250,
        "spa": 250,
        "spd": 250,
        "spe": 250,
    }   

    function getStatPercentile(stat, statlist) {
        let max = maxStats[stat];

        return 100 * (statlist[stat] / max);
    }

    function getColorBasedOnStat(stat, statlist) {
        let color = {
            "red": 0,
            "green": 0,
            "blue": 0,
        };

        let flatPercentMultiplier = 1.15;

        color["red"] = Math.max(Math.min(400 - 4 * (getStatPercentile(stat, statlist) * flatPercentMultiplier), 200), 0);
        color["green"] = Math.min(Math.max(4 * (getStatPercentile(stat, statlist)  * flatPercentMultiplier), 0), 200);

        return "rgb(" + color["red"] + ", " + color["green"] + ", " + color["blue"] + ")";
    }

    let statlist = pokemon.baseStats;

    for (let stat in statlist) {    
        document.querySelector('.js-' + stat).style.width =  String(getStatPercentile(stat, statlist)) + "%";
        document.querySelector('.js-' + stat).style.background = getColorBasedOnStat(stat, statlist);
        document.querySelector('.js-' + stat + '-value').innerHTML = statlist[stat];
    }
}

export { setStats };