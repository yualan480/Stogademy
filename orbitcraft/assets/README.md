# Block textures

`block-textures.png` is the flat texture sheet previously generated from the
user's supplied Minecraft block chart. It is reference-matched artwork, not an
exact extraction of Mojang's resource files. The chart's perspective, labels,
lighting and logo are not painted onto the block faces.

The latest chart request uses this sheet consistently, including its brighter
green grass and warm dirt. The separate, darker `grass-reference.png` from an
earlier request is retained as an asset but no longer overrides these faces.

The atlas has seven columns and three rows:

| Row | Tiles, left to right |
| --- | --- |
| 1 | Grass top, dirt, stone, sand, oak bark, oak leaves, snow |
| 2 | Water, bedrock, oak planks, grass side, oak log end, snowy grass side, grass plant |
| 3 | Red poppy, red poppy variant, cobblestone, gravel, coal ore, iron ore, diamond ore |

Grass uses green on top, hanging grass over dirt on its sides, and dirt below.
Oak logs have bark on their sides and end-grain rings above and below. Snow
uses snow on all faces. Leaves and plants retain cutout transparency. Water
retains its blue texture and transparent material. Decorative flowers use the
red poppy tile from the chart.

The world, held blocks, inventory/crafting icons, dropped items and block
particles all use the same nearest-filtered 16-pixel atlas and face mapping.
The survival block IDs for cobblestone, gravel and the three ores point to their
matching chart tiles. Other survival blocks and item sprites extend the atlas
with original procedural artwork. The built-in fallback remains available if
an image request fails. World generation and saved block IDs are unchanged.
