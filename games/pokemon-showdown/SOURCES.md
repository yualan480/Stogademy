# Pokémon Showdown client

Source: https://github.com/smogon/pokemon-showdown-client

AGPL-3.0, see [LICENSE](LICENSE). Browser build mirrored from the official client on November 9, 2026. Upstream source revision: 1b614d894c706d074cfcc199d1da1a9728f59f27.

Orbit source and modifications: https://github.com/yualan480/Stogademy/tree/main/games/pokemon-showdown . The hosted fork initializes within Orbit, uses custom-client mode, removes ads/analytics and external navigation, and provides anonymous-name authentication through a restricted same-origin endpoint. Guest battles connect to the official Showdown battle servers; registered-account login is not relayed. Artwork and game data retain their original ownership.

Sprites, fonts and the large generated teambuilder tables are loaded as resources from the official asset CDN; they do not navigate the page. Generated Pokémon data originates from https://github.com/smogon/pokemon-showdown .

Connection adaptation: direct secure WebSocket with a 10-second initial connection timeout, falling back to upstream SockJS over HTTPS on port 443. Plain HTTP fallback is disabled.
