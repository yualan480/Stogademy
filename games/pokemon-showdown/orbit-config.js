// Orbit's AGPL client adaptation uses upstream's supported custom-client mode.
Config.testclient=true;
Config.roomsFirstOpenScript=function(){};
Config.includes={};

window.ga=function(){};

// Keep every battle connection encrypted, including fallback transports.
Config.defaultserver.port=443;
Config.defaultserver.altport=443;
Config.defaultserver.https=true;
Config.orbitDirectWebSocket=true;
