/* Orbit home backdrop: the supplied blue space picture (orbit-space.jpg: ringed planet, big curved planet with city lights, two moons, purple nebula), brought to life on a canvas.
   Everything is SLOW and repeats exactly every LOOP seconds (49s), so the loop never jumps:
   • a very slow camera drift and breathing zoom over the whole scene, with the layers moving at different depths
   • stars that twinkle gently, bright flare stars with spikes that blink, city lights that flicker on the dark planet, two layers of stars drifting past, and the odd shooting star
   • glints and flowing sparkles that travel around every ring and along the long light streaks; the rings shimmer
   • soft cloud light that turns across both planets, and a glint that runs along the bright planet and moon edges
   • tumbling asteroids drifting in small loops, plus a few that cross the whole screen
   • breathing nebula light and floating light dust
   The element behaves like the old <video> (currentTime, duration, play, pause, readyState, paused) so orbit.js and ambient.js
   work unchanged. currentTime / duration still use the 2.74s sound-loop length; the picture's own cycle is eighteen of those. */

export const PERIOD = 2.74;                         // the sound loop length (ambient.js and orbit.js sync to this)
const LOOP = PERIOD * 18;                           // one full picture cycle = eighteen sound loops, 49.32s (slow, calm motion)
const TAU = Math.PI * 2;
const MAX_PX = 4.6e6;                               // keeps big / hi-dpi screens smooth
const IW = 1672, IH = 941;                          // size of the picture; every coordinate below is in picture pixels
const IMG = 'orbit-space.jpg?v=2';

/* stars found in the picture: x, y, brightness, then the colour of the sky around each one (used to dim it while it blinks) */
const STARS = [614,33,255,0,2,25,673,13,255,1,2,26,580,101,255,1,4,34,126,29,255,0,3,36,560,12,240,0,1,26,1416,37,255,0,5,41,1416,28,249,0,3,37,695,81,246,0,2,33,611,848,237,0,0,23,587,127,234,0,2,29,876,110,244,1,5,39,964,59,255,0,9,53,1068,47,255,1,9,51,1031,21,255,0,9,50,831,145,253,0,7,54,1267,13,233,0,1,32,1394,66,252,0,8,53,655,119,228,0,2,30,1010,149,254,1,9,58,757,106,255,0,7,60,833,38,255,0,8,58,1023,144,255,0,9,62,900,50,237,0,6,43,764,87,252,0,5,58,1188,41,238,0,5,46,633,213,234,0,5,43,992,57,228,0,5,39,173,88,254,0,8,66,1068,59,255,1,11,70,1361,113,255,0,11,68,1091,823,255,0,9,62,937,144,255,0,10,68,732,142,232,0,6,49,576,141,214,1,3,32,1324,63,255,0,7,72,1332,139,244,0,11,64,765,794,225,0,3,38,758,142,255,0,11,77,937,111,234,0,8,53,1456,9,223,1,4,42,831,112,216,0,4,38,706,296,243,0,8,65,719,266,255,0,11,78,624,872,205,0,1,28,155,100,248,1,9,66,917,166,255,0,11,76,716,857,201,0,2,24,170,61,230,0,7,57,660,189,213,0,5,39,192,103,236,0,7,62,37,81,255,0,8,84,281,52,224,0,9,56,351,20,255,0,16,83,807,698,248,0,11,76,751,152,226,0,7,56,624,817,198,0,1,23,854,263,254,0,13,87,1354,152,246,0,15,80,759,189,255,0,14,91,691,300,227,0,8,62,755,205,255,0,14,85,629,881,202,0,2,37,703,674,238,0,12,76,902,297,251,0,9,88,1049,200,255,0,15,86,922,250,247,0,11,86,772,42,195,0,3,33,922,269,244,0,8,77,1148,72,247,0,13,73,1156,850,233,2,11,69,732,161,218,0,6,49,496,153,252,0,17,89,398,71,240,0,13,70,382,621,255,1,13,78,870,238,230,0,12,70,1378,29,198,0,3,36,771,243,252,0,16,95,299,152,252,1,18,93,711,278,229,0,10,69,1296,76,223,0,7,63,1187,901,213,1,9,59,678,913,233,0,7,64,947,105,206,1,7,50,441,86,249,0,20,91,420,109,220,0,12,64,1322,12,208,0,3,46,1059,20,204,1,7,44,356,671,220,0,6,51,1198,63,219,0,8,64,460,105,255,0,27,110,810,179,226,0,12,72,57,849,214,0,6,59,724,237,226,0,12,75,1608,708,228,0,10,78,801,697,244,1,14,83,128,109,232,0,8,81,717,189,255,0,16,97,386,27,211,1,12,62,751,671,250,1,18,97,67,99,255,0,11,105,1632,722,224,0,10,76,769,262,255,0,19,106,986,765,242,1,14,85,1369,12,178,0,2,31,287,85,217,0,11,67,941,87,194,1,7,48,209,610,247,1,21,99,1313,29,197,0,3,41,918,214,249,0,14,95,1082,815,206,0,7,54,31,47,219,0,7,74,375,602,245,0,18,97,771,732,206,0,8,53,1385,673,255,0,16,110,741,129,197,0,6,51,235,26,196,0,7,49,874,256,220,1,12,73,738,165,200,1,7,50,94,295,230,0,12,85,700,713,197,0,7,53,136,116,223,0,8,80,1102,73,220,0,13,73,1057,14,190,0,6,44,895,237,213,0,9,68,354,39,238,0,18,92,1085,829,200,1,6,48,791,354,242,0,11,107,209,109,225,0,11,80,763,718,195,1,7,57,459,233,255,0,23,117,519,12,177,0,4,36,653,337,213,0,11,75,1587,720,225,0,11,87,727,932,198,0,3,50,1115,846,195,1,6,51,380,44,212,1,15,71,656,905,223,1,8,70,996,199,227,0,15,87,894,98,180,0,5,43,1281,82,212,0,7,64,1094,210,254,0,20,113,294,113,240,0,18,106,298,730,170,1,4,34,1412,688,239,0,15,103,1003,130,182,0,7,48,68,80,222,0,9,90,208,24,173,1,4,36,499,138,230,0,19,97,611,216,182,0,7,48,928,719,234,0,13,87,1052,167,203,0,12,71,361,18,209,0,13,70,872,739,209,0,8,66,403,108,201,0,13,68,737,675,216,0,14,81,869,263,219,0,11,84,276,149,215,0,15,81,662,907,210,0,5,71,886,263,199,0,9,68,57,680,191,0,8,58,899,113,175,0,5,44,1069,195,239,0,20,106,643,709,192,1,11,59,955,49,190,0,11,58,1558,149,195,0,8,56,489,239,244,0,24,105,1236,56,177,0,5,46,1150,182,255,0,21,116,410,623,223,0,13,90,847,293,200,0,9,66,1221,89,201,0,10,68,821,286,195,0,9,66,699,921,200,0,5,64,374,619,218,0,14,83,819,349,224,0,10,93,707,317,197,1,10,67,721,355,194,0,8,65,766,159,213,0,13,81,573,641,230,0,20,93,1181,24,171,0,4,42,287,600,255,1,28,123,967,263,251,0,18,120,1544,735,243,0,18,119,865,38,168,0,6,40,471,841,215,1,5,87,1014,782,216,0,16,92,348,46,228,0,17,92,384,102,224,0,18,92,837,700,213,1,12,84,755,713,186,0,8,56,266,69,177,0,7,48,130,369,247,0,20,120,453,213,241,0,23,112,714,927,191,0,6,56,1086,59,195,0,10,63,305,167,222,1,17,91,814,709,193,0,9,65,171,80,190,0,8,64,1484,724,250,0,18,124,539,99,157,0,3,32,949,37,179,0,9,54,627,668,213,0,20,86,1065,12,169,1,7,43,855,715,198,0,11,68,19,655,211,2,18,88,967,154,183,0,9,59,1270,102,255,0,14,128,1202,48,175,0,5,46,1196,92,216,0,12,85,1184,848,203,0,12,75,74,110,255,1,12,130,456,711,169,1,7,44,1199,167,246,0,19,120,1512,719,217,0,14,93,231,813,250,0,27,144,782,233,212,0,15,90,100,116,254,1,12,130,1159,243,237,0,16,113,824,116,164,0,4,42,1000,118,165,0,6,44,465,352,255,0,21,129,631,644,237,0,22,100,1259,69,181,0,6,59,1204,113,228,0,16,102,953,167,202,1,13,79,1523,628,199,0,9,80,1274,118,231,0,11,104,1082,237,248,0,24,125,1160,822,212,0,17,91,373,756,163,0,4,41,382,593,255,0,29,135,334,57,220,0,18,100,1152,273,251,0,19,128,1160,58,174,0,8,53,346,139,246,0,22,116,247,815,255,0,24,152,1366,171,223,1,22,101,1070,853,170,1,5,43,133,762,160,1,6,40,1058,872,166,0,5,42,468,170,199,0,15,79,1393,125,206,0,17,81,934,703,245,1,23,121,271,769,153,1,3,34,1139,796,229,0,22,103,554,120,154,1,4,36,452,761,159,1,5,41,774,669,234,0,20,105,1317,649,255,0,21,127,1309,162,182,0,9,64,910,46,162,0,6,44,812,739,172,0,5,50,716,71,152,0,3,35,1319,73,192,1,8,80,484,50,168,0,9,50,985,197,205,0,13,81,505,198,186,0,13,69,181,808,252,0,24,132,787,764,159,1,5,43,823,705,193,0,10,74,173,157,199,0,10,75,1218,822,229,0,20,114,224,812,241,0,27,148,313,58,217,0,19,98,1141,184,220,0,15,96,485,609,236,0,21,121,1052,191,197,1,15,82,1260,240,220,0,12,101,1000,45,152,1,5,37,272,70,168,0,7,51,681,669,200,1,16,85,857,359,220,0,12,101,71,48,180,0,6,69,970,104,155,1,5,40,503,12,159,0,6,45,206,89,173,0,7,56,245,102,174,0,8,58,107,105,209,0,9,94,1106,57,178,0,11,62,239,814,248,0,25,148,1048,156,188,0,12,72,255,816,250,0,25,159,1337,61,173,0,5,54,1575,82,190,0,14,76,362,143,255,0,26,137,79,247,191,0,7,65,684,677,188,0,12,72,764,70,154,0,3,39,953,151,181,0,10,64,476,15,157,1,7,44,1175,832,196,1,13,79,937,102,168,1,8,52,1249,102,212,1,12,96,878,227,185,0,10,69,1494,196,250,0,28,132,453,64,177,0,13,62,45,345,192,0,12,78,748,221,195,0,12,82,976,22,171,1,12,58,1228,134,239,0,19,123,501,606,247,0,26,127,1272,882,197,1,16,80,319,66,236,0,23,120,511,458,250,0,23,136,219,713,159,0,5,44,458,791,155,1,3,41,323,48,195,0,14,82,209,153,255,0,18,135,482,196,195,0,16,80,1268,894,179,0,13,67,659,658,219,1,20,102,772,181,207,0,16,91,151,33,151,1,4,40,946,13,160,0,8,48,465,362,255,0,24,139,819,694,199,0,12,84,826,690,197,0,13,90,357,49,213,0,19,100,898,706,199,0,14,84,1144,775,255,0,25,133,594,382,252,0,25,138,1116,196,255,0,26,128,444,42,162,0,9,48,764,682,232,1,16,125,220,129,200,0,12,90,1067,105,180,0,13,71,465,185,203,0,18,85,873,335,236,1,13,113,1238,876,181,1,12,71,779,275,205,0,15,87,1136,769,255,0,28,133,248,144,203,0,14,91,965,188,196,0,13,84,103,735,163,1,10,51,935,280,221,0,12,105,881,771,162,1,8,53,272,818,255,0,27,167,1232,278,220,0,14,107,518,397,241,0,18,132,341,786,155,0,4,46,1435,657,190,0,10,79,1067,772,200,0,16,88,598,368,225,0,21,119,58,79,197,0,9,87,1072,209,226,0,22,116,350,923,227,0,17,110,863,271,214,0,16,105,448,826,175,1,5,68,1183,73,188,0,12,76,389,86,184,0,14,70,1225,865,182,1,13,73,1345,865,240,0,24,114,852,146,150,0,5,42,693,672,184,0,11,77,501,699,166,1,12,59,1507,176,224,0,19,113,737,180,169,0,10,62,402,915,235,1,13,131,873,313,198,0,10,89,264,817,246,0,25,159,1563,106,180,0,14,73,1206,932,157,1,5,41,856,366,217,0,12,110,463,740,150,1,6,43,563,431,241,0,23,132,170,729,167,15,18,55,576,361,220,0,19,111,1406,910,209,1,20,101,353,598,222,0,26,117,1288,206,203,0,13,98,1188,911,159,0,7,51,1318,208,189,0,14,82,919,547,255,0,24,149,579,393,240,0,25,134,308,823,255,3,24,152,793,214,190,0,14,77,411,359,255,0,25,148,461,833,176,0,4,69,110,152,239,1,15,125,594,445,213,1,19,110,617,437,210,0,18,102,94,390,244,0,26,140,1175,208,251,0,25,155,1383,582,241,0,21,135,664,404,207,0,17,102,1321,610,244,0,21,141,653,642,219,0,22,112,442,421,255,0,24,147,1530,742,255,0,21,149,460,336,233,0,21,130,43,177,254,0,18,142,321,825,255,0,23,170,431,395,255,0,24,153,701,201,163,0,9,59,1174,803,236,1,23,118,1261,849,236,1,24,128,664,377,192,0,15,91,1319,129,162,1,8,58,880,295,184,0,8,80,1112,150,232,0,26,128,1018,215,252,0,23,145,683,446,251,0,28,148,1157,70,187,0,16,89,1420,712,245,0,24,143,1277,88,202,0,11,95,690,493,235,1,24,133,508,115,178,0,15,77,1052,178,179,0,14,78,883,178,159,1,7,53,463,815,151,0,3,46,499,251,251,0,28,143,332,827,255,1,22,159,1358,655,223,1,20,114,235,601,225,2,28,120,1271,274,205,0,16,104,926,238,196,0,13,90,98,143,234,1,15,129,739,683,180,0,12,76,884,697,212,0,14,107,815,731,165,0,8,56,1366,925,236,5,36,137,369,332,239,0,17,136,758,380,249,1,16,145,785,225,188,0,14,91,1246,914,162,1,11,60,597,669,196,2,22,94,196,656,184,0,17,84,858,241,182,1,14,80,597,280,155,0,8,55,177,683,168,1,10,65,253,127,165,0,10,65,1198,864,181,1,15,79,804,229,222,0,24,126,345,829,255,1,22,165,115,394,236,0,23,136,302,800,153,1,4,50,746,392,202,0,10,97,1403,621,216,0,17,117,462,91,201,0,23,99,1253,97,204,1,14,101,433,404,254,0,24,155,1008,196,194,0,16,96,786,258,201,0,16,100,946,237,182,0,11,80,1209,880,172,2,15,69,689,210,153,0,7,54,125,149,219,0,14,121,302,661,174,0,10,65,450,730,157,1,9,51,482,183,179,0,14,77,945,752,180,0,9,72,1185,146,255,0,23,158,143,370,233,0,23,135,211,852,232,0,23,131,49,142,191,0,9,90,22,687,166,1,10,68,777,696,177,0,9,68,1176,844,178,1,13,78,887,758,164,1,10,61,573,437,216,0,21,117,421,153,214,0,23,113,193,614,191,1,19,91,1148,800,214,0,22,113,499,653,195,1,18,91,615,477,255,0,30,157,125,396,239,0,25,139,353,344,232,0,18,127,1642,724,166,0,7,68,51,69,163,0,6,63,955,710,217,0,22,118,1422,896,229,0,25,127,1107,140,234,0,26,134,391,47,168,0,13,71,1310,655,254,1,27,157,1308,145,159,0,8,61,933,191,192,0,15,95,195,867,174,0,13,77,160,47,151,1,6,52,979,733,247,4,38,154,676,316,163,0,10,66,668,427,217,0,22,119,370,805,178,1,10,81,100,391,235,0,24,136,662,370,188,0,15,91,569,274,154,0,8,57,1051,220,203,0,20,106,1355,638,223,0,20,124,511,230,169,0,12,70];
/* big flare stars: x, y, size, blink speed (whole blinks per cycle) */
const FLARES = [[1057,420,1.1,6],[716,189,.7,9],[822,240,.65,12],[532,346,.65,8],[290,436,.5,10],[614,33,.55,7],[673,13,.55,11],[580,101,.5,9],[126,29,.5,8],[1416,32,.55,6],[964,59,.5,12],[831,145,.5,7],[1394,66,.5,10],[1360,343,.5,9],[1010,149,.5,8],[876,110,.5,11],[587,127,.45,6]];
/* city lights on the dark planet: x, y, brightness */
const CITY = [1506,48,255,684,55,255,36,81,255,75,110,255,800,128,255,715,189,255,564,233,255,482,433,255,614,477,255,301,585,255,1288,603,255,19,605,255,130,605,255,26,615,255,122,626,255,130,627,255,261,630,255,90,634,255,114,637,255,236,644,255,105,654,255,660,680,255,580,688,255,139,693,255,148,702,255,116,704,255,535,708,255,583,716,255,137,718,255,602,723,255,123,725,255,111,727,255,193,736,255,519,736,255,148,738,255,155,744,255,434,751,255,432,762,255,418,775,255,422,785,255,403,801,255,391,806,255,382,810,255,428,820,255,414,826,255,645,827,255,230,878,255,11,881,255,1233,896,255];

const prng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const mod = (a, n) => ((a % n) + n) % n;

/* ───── ring paths, traced from the picture ───── */
function ringDefs() {
  /* nested swoosh loops traced from the picture: bezier chains in picture pixels */
  return [
    { pts: [[1380,405],[1260,380],[1150,385],[1145,412],[1140,436],[1260,440],[1370,422]], col: '150,205,255', dir: 1, m: 1, w: 1, p: .3 },
    { pts: [[1385,392],[1250,365],[1140,372],[1135,408],[1132,442],[1260,452],[1380,430]], col: '110,170,255', dir: -1, m: 2, w: .8, p: 1.4 },
    { pts: [[1400,478],[1330,462],[1270,470],[1260,488],[1280,505],[1340,505],[1395,490]], col: '170,200,255', dir: 1, m: 1, w: .9, p: 2.2 },
    { pts: [[1410,468],[1320,448],[1240,462],[1230,490],[1250,520],[1340,522],[1400,500]], col: '140,150,255', dir: -1, m: 2, w: .8, p: 3.1 },
    { pts: [[1200,712],[1400,730],[1560,765],[1630,805],[1680,840],[1680,890],[1620,908]], col: '200,170,255', dir: 1, m: 1, w: 1.2, p: 4 },
    { pts: [[1200,718],[1400,744],[1540,782],[1610,825],[1660,860],[1650,900],[1590,914]], col: '120,180,255', dir: -1, m: 2, w: .8, p: 5.2 },
    { pts: [[0,826],[200,830],[420,880],[640,941]], col: '110,190,255', dir: 1, m: 1, w: 1.3, p: 6 },
    { pts: [[0,800],[250,800],[500,850],[720,941]], col: '90,160,255', dir: -1, m: 2, w: .9, p: 7.1 },
  ];
}
const STREAKS = [   // the long light streaks: pts (bezier chain), colour, direction, loops per cycle, width
  { pts: [[1100,445],[1250,448],[1330,430],[1400,412],[1480,392],[1580,365],[1672,335]], col: '225,190,255', dir: 1, m: 1, w: 1.7, p: 0 },
  { pts: [[1060,420],[1150,370],[1260,320],[1365,270]], col: '140,200,255', dir: 1, m: 1, w: 1.2, p: 2 },
  { pts: [[1100,408],[1200,362],[1290,322],[1365,285]], col: '120,180,255', dir: -1, m: 2, w: .9, p: 3 },
  { pts: [[1050,583],[1200,560],[1320,540],[1400,490]], col: '190,170,255', dir: 1, m: 1, w: 1.1, p: 4 },
  { pts: [[1672,455],[1580,500],[1480,556],[1380,598]], col: '175,150,255', dir: 1, m: 1, w: 1, p: 5 },
  { pts: [[0,380],[150,395],[330,445],[540,522]], col: '130,200,255', dir: 1, m: 1, w: 1.1, p: 6 },
  { pts: [[0,395],[150,412],[330,458],[520,516]], col: '100,170,255', dir: -1, m: 1, w: .8, p: 7 },
];
/* bright edges of the planets: centre, radius, angles (in radians) */
const LIMBS = [
  { c: [1625, 350], r: 262, a0: 2.3, a1: 4.2, col: '170,215,255', dir: -1, m: 1, p: 1 },
  { c: [166.3, 3279.5], r: 2759.1, a0: -1.6311, a1: -1.0652, col: '190,215,255', dir: 1, m: 1, p: 3 },
  { c: [238, 212], r: 53, a0: -.9, a1: 1.7, col: '170,200,255', dir: 1, m: 1, p: 5 },
  { c: [1497, 660], r: 30, a0: 1.7, a1: 4.4, col: '170,200,255', dir: -1, m: 1, p: 2 },
];
const PLANETS = [   // cloud-light layer: centre, radius, which way the lit side faces, drift direction (gr = size of the light patch)
  { c: [1625, 350], r: 262, lx: -.75, ly: .1, dir: -1, p: 0 },
  { c: [166.3, 3279.5], r: 2759.1, lx: .12, ly: -1, dir: 1, p: 2, gr: 1300 },
];
const NEB = [   // breathing nebula light: x, y, radius, colour, strength
  [1010, 400, 230, '175,100,255', .14], [940, 320, 150, '255,140,225', .08], [480, 170, 230, '80,120,255', .10], [90, 230, 200, '130,90,255', .10],
  [330, 90, 170, '70,120,255', .08], [1180, 170, 200, '90,130,255', .08], [1250, 720, 220, '80,110,255', .07],
];
const SHOOT = [[.07, .12, .07, 27], [.44, .28, .05, 31], [.76, .3, .1, 24]];   // start (cycle fraction), x, y (screen fraction), angle (degrees)
const ROCKS = [   // drifting asteroids, in picture pixels: x, y, radius, depth, orbit size, spin (turns per cycle)
  [450, 300, 14, .9, 22, 2], [870, 160, 16, 1.0, 28, -2], [1235, 120, 22, 1.1, 34, -1], [700, 500, 12, .8, 18, 1],
  [1150, 620, 18, 1.1, 30, -1], [1480, 790, 24, 1.3, 36, 1], [250, 100, 12, .8, 18, 2], [1000, 250, 13, .9, 20, -1], [60, 300, 18, 1.2, 26, 1],
];
const CROSS = [   // asteroids that cross the whole screen: y (fraction), radius, direction, depth, spin, start phase
  [.15, 16, -1, .9, 1, .1], [.30, 11, 1, .6, 2, .35], [.58, 24, 1, 1.3, -1, .55], [.88, 28, -1, 1.4, 1, .8],
];

export function createBackdrop() {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { alpha: false });
  if (!ctx) return null;

  let W = 0, H = 0, S = 1, sc = 1, ox = 0, oy = 0, mx = 0, my = 0, base = null, fx = null, fxs = .5;
  let pls = [], city = [], nebSpr = {}, rings = [], streaks = [], limbs = [], twinkle = [], flares = [], dust1 = [], dust2 = [], motes = [], rocks = [], crossers = [], pats = [];
  let playing = false, raf = 0, clock0 = 0, off = 0, ready = false, lite = false, lastT = 0, avg = 16, nfr = 0;   // lite: drops the heaviest extras on slow devices
  const img = new Image(); img.decoding = 'async';
  img.onload = () => { ready = true; base = null; if (cv.isConnected && !playing) draw(off % LOOP); };
  img.src = new URL(IMG, import.meta.url).href;

  /* soft glow and spike sprites, drawn once */
  const glow = (() => { const c = mk(64, 64), g = c.getContext('2d'), q = g.createRadialGradient(32, 32, 0, 32, 32, 32); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(.12, 'rgba(205,225,255,.8)'); q.addColorStop(.4, 'rgba(110,150,255,.25)'); q.addColorStop(1, 'rgba(60,90,255,0)'); g.fillStyle = q; g.fillRect(0, 0, 64, 64); return c; })();
  const warmGlow = (() => { const c = mk(64, 64), g = c.getContext('2d'), q = g.createRadialGradient(32, 32, 0, 32, 32, 32); q.addColorStop(0, 'rgba(255,235,190,1)'); q.addColorStop(.18, 'rgba(255,190,110,.7)'); q.addColorStop(.5, 'rgba(255,150,70,.2)'); q.addColorStop(1, 'rgba(255,120,50,0)'); g.fillStyle = q; g.fillRect(0, 0, 64, 64); return c; })();
  const cross = (() => { const n = 128, c = mk(n, n), g = c.getContext('2d');
    const arm = (a, len, w, al) => { g.save(); g.translate(n / 2, n / 2); g.rotate(a); const q = g.createLinearGradient(-len, 0, len, 0); q.addColorStop(0, 'rgba(180,210,255,0)'); q.addColorStop(.5, `rgba(235,245,255,${al})`); q.addColorStop(1, 'rgba(180,210,255,0)'); g.fillStyle = q; g.fillRect(-len, -w / 2, len * 2, w); g.restore(); };
    arm(0, 62, 2, 1); arm(Math.PI / 2, 62, 2, 1); arm(Math.PI / 4, 34, 1.2, .45); arm(-Math.PI / 4, 34, 1.2, .45);
    const q = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, 14); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(1, 'rgba(160,190,255,0)'); g.fillStyle = q; g.fillRect(0, 0, n, n); return c; })();
  const cloud = (() => { const n = 512, c = mk(n, n), g = c.getContext('2d'), rnd = prng(5);
    for (let i = 0; i < 120; i++) {
      const x = rnd() * n, y = rnd() * n, rx = 24 + rnd() * 70, ry = 4 + rnd() * 16, col = rnd() < .3 ? '175,150,255' : rnd() < .5 ? '140,200,255' : '110,160,255', a = .06 + rnd() * .16;
      for (const o of [-n, 0, n]) for (const o2 of [-n, 0, n]) { g.save(); g.translate(x + o, y + o2); g.scale(1, ry / rx); const q = g.createRadialGradient(0, 0, 0, 0, 0, rx); q.addColorStop(0, `rgba(${col},${a})`); q.addColorStop(1, `rgba(${col},0)`); g.fillStyle = q; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); }
    }
    return c; })();

  /* a rocky asteroid sprite: dark faceted body, cracks and craters, blue or violet edge light */
  function rock(r, seed) {
    const rnd = prng(seed), pad = Math.ceil(r * .5) + 10, size = Math.ceil((r + pad) * 2), c = mk(size, size), g = c.getContext('2d'), cx = size / 2, cy = size / 2;
    const n = 9 + ((rnd() * 5) | 0), v = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU + (rnd() - .5) * .4, rr = r * (.68 + rnd() * .44); v.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (.8 + rnd() * .25)]); }
    const shape = () => { g.beginPath(); v.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
    const rim = rnd() < .5 ? '110,160,255' : '170,120,255', rim2 = rim === '110,160,255' ? '170,120,255' : '110,160,255';
    g.save(); g.shadowColor = `rgba(${rim},.8)`; g.shadowBlur = Math.max(4, r * .35); shape(); g.fillStyle = '#050a30'; g.fill(); g.restore();
    g.save(); shape(); g.clip();
    const b = g.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r * 1.15); b.addColorStop(0, '#1a2a80'); b.addColorStop(.5, '#0a1248'); b.addColorStop(1, '#02061f'); g.fillStyle = b; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 6; i++) { const a = v[(rnd() * n) | 0], b2 = v[(rnd() * n) | 0], c2 = v[(rnd() * n) | 0]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b2[0], b2[1]); g.lineTo(c2[0], c2[1]); g.closePath(); g.fillStyle = rnd() < .55 ? 'rgba(0,3,28,.34)' : 'rgba(120,150,255,.07)'; g.fill(); }
    for (let i = 0; i < 3; i++) { const x = cx + (rnd() - .5) * r, y = cy + (rnd() - .5) * r, rr = r * (.1 + rnd() * .14); g.beginPath(); g.ellipse(x, y, rr, rr * .7, rnd() * 3, 0, TAU); g.fillStyle = 'rgba(0,2,24,.5)'; g.fill(); g.strokeStyle = `rgba(${rim},.28)`; g.lineWidth = Math.max(1, r * .03); g.beginPath(); g.ellipse(x, y, rr, rr * .7, rnd() * 3, .3, 2.2); g.stroke(); }
    g.restore();
    g.lineJoin = 'round';
    const e = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); e.addColorStop(0, `rgba(${rim},.8)`); e.addColorStop(.45, `rgba(${rim},.15)`); e.addColorStop(.6, `rgba(${rim2},.12)`); e.addColorStop(1, `rgba(${rim2},.6)`);
    g.strokeStyle = e; g.lineWidth = Math.max(1, r * .04); shape(); g.stroke();
    const c2 = mk(size, size), g2 = c2.getContext('2d'); g2.filter = `blur(${Math.max(.4, r * .018).toFixed(2)}px)`; g2.drawImage(c, 0, 0);   // a touch of softness so the rocks sit in the painted scene
    return { c: c2, size };
  }

  const bez = (P, n = 30) => { let L = 0, px = P[0][0], py = P[0][1]; for (let s = 0; s < P.length - 1; s += 3) for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t, x = u * u * u * P[s][0] + 3 * u * u * t * P[s + 1][0] + 3 * u * t * t * P[s + 2][0] + t * t * t * P[s + 3][0], y = u * u * u * P[s][1] + 3 * u * u * t * P[s + 1][1] + 3 * u * t * t * P[s + 2][1] + t * t * t * P[s + 3][1]; L += Math.hypot(x - px, y - py); px = x; py = y; } return L; };
  function mkPath(def) {
    const P = def.pts.map(p => [ox + p[0] * sc, oy + p[1] * sc]), p = new Path2D(); p.moveTo(P[0][0], P[0][1]);
    for (let s = 0; s < P.length - 1; s += 3) p.bezierCurveTo(P[s + 1][0], P[s + 1][1], P[s + 2][0], P[s + 2][1], P[s + 3][0], P[s + 3][1]);
    return { ...def, path: p, len: bez(P) };
  }

  function layout() {
    const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return false;
    S = Math.min(window.devicePixelRatio || 1, 2); if (cw * ch * S * S > MAX_PX) S = Math.max(.75, Math.sqrt(MAX_PX / (cw * ch)));
    const w = Math.round(cw * S), h = Math.round(ch * S);
    if (w === W && h === H && base) return true;
    W = cv.width = w; H = cv.height = h; mx = Math.round(W * .035); my = Math.round(H * .035);
    sc = Math.max(W / IW, H / IH) * 1.07; ox = (W - IW * sc) * .5; oy = (H - IH * sc) * .42;
    /* the still picture, with a little spare around the edges so the camera can drift */
    base = mk(W + 2 * mx, H + 2 * my); const g = base.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, base.height); bg.addColorStop(0, '#010426'); bg.addColorStop(.5, '#06127a'); bg.addColorStop(1, '#010420'); g.fillStyle = bg; g.fillRect(0, 0, base.width, base.height);
    if (ready) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, mx + ox, my + oy, IW * sc, IH * sc); }
    const vg = g.createRadialGradient(base.width / 2, base.height * .5, Math.min(W, H) * .4, base.width / 2, base.height * .5, Math.hypot(W, H) * .6); vg.addColorStop(0, 'rgba(0,3,28,0)'); vg.addColorStop(1, 'rgba(0,3,28,.38)'); g.fillStyle = vg; g.fillRect(0, 0, base.width, base.height);
    fxs = .5; pls = PLANETS.map(pl => {
      const cx = ox + pl.c[0] * sc, cy = oy + pl.c[1] * sc, r = pl.r * sc, x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r)), x1 = Math.min(W, Math.ceil(cx + r)), y1 = Math.min(H, Math.ceil(cy + r));
      if (x1 <= x0 || y1 <= y0) return null;
      const bw = x1 - x0, bh = y1 - y0, cv2 = mk(bw * fxs, bh * fxs), g = cv2.getContext('2d'), mask = mk(bw * fxs, bh * fxs), mg = mask.getContext('2d');
      const lx = (cx - x0 + pl.lx * r) * fxs, ly = (cy - y0 + pl.ly * r) * fxs, m = mg.createRadialGradient(lx, ly, 0, lx, ly, (pl.gr ? pl.gr * sc : r * 1.5) * fxs);
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(.55, 'rgba(0,0,0,.5)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = m; mg.beginPath(); mg.arc((cx - x0) * fxs, (cy - y0) * fxs, r * .985 * fxs, 0, TAU); mg.fill();
      return { ...pl, cv: cv2, g, mask, pat: g.createPattern(cloud, 'repeat'), x0, y0, bw, bh, key: -1 };
    }).filter(Boolean);
    rings = ringDefs().map(mkPath); streaks = STREAKS.map(mkPath);
    limbs = LIMBS.map(l => { const p = new Path2D(); p.arc(ox + l.c[0] * sc, oy + l.c[1] * sc, l.r * sc, l.a0, l.a1); return { ...l, path: p, len: l.r * sc * (l.a1 - l.a0) }; });
    const rnd = prng(11);
    twinkle = []; for (let i = 0; i + 5 < STARS.length; i += 6) twinkle.push({ x: ox + STARS[i] * sc, y: oy + STARS[i + 1] * sc, l: STARS[i + 2], bg: `${STARS[i + 3]},${STARS[i + 4]},${STARS[i + 5]}`, k: 6 + ((rnd() * 10) | 0), p: rnd() * TAU });
    flares = FLARES.map(([x, y, s, k], i) => ({ x: ox + x * sc, y: oy + y * sc, s, k, p: i * 1.9 }));
    city = []; for (let i = 0; i + 2 < CITY.length; i += 3) city.push({ x: ox + CITY[i] * sc, y: oy + CITY[i + 1] * sc, a: CITY[i + 2] / 255, k: 5 + ((rnd() * 9) | 0), p: rnd() * TAU });
    const dust = (n, sz) => Array.from({ length: n }, () => ({ x: rnd() * W, y: rnd() * H, a: .25 + rnd() * .6, k: 6 + ((rnd() * 12) | 0), p: rnd() * TAU, z: (sz * (.6 + rnd() * .8)) * S }));
    dust1 = dust(190, 1.1); dust2 = dust(70, 1.7);
    motes = Array.from({ length: 56 }, () => ({ x: rnd() * W, y: rnd() * H, ax: (8 + rnd() * 28) * S, ay: (8 + rnd() * 24) * S, k: 3 + ((rnd() * 3) | 0), p: rnd() * TAU, q: rnd() * TAU, r: (.7 + rnd() * 1.4) * S }));
    rocks = ROCKS.map(([x, y, r, z, o, sp], i) => ({ ...rock(r * sc * Math.min(z, 1.5) * .55 + 3 * S, 100 + i), x: ox + x * sc, y: oy + y * sc, z, o: o * sc, sp, p: i * 1.37, a0: i * 2.1 }));
    crossers = CROSS.map(([fy, r, dir, z, sp, ph], i) => ({ ...rock(r * sc * Math.min(z, 1.5) * .5 + 2.5 * S, 200 + i), y: fy * H, dir, z, sp, ph, p: i * 2.3 }));
    pats = null;
    return true;
  }

  /* a comet of light that travels along a path: bright head, fading tail (drawn with dashes that end at the head) */
  function comet(g, def, u, L, w, al, off0 = 0) {
    const P = def.len + L * 1.1, head = mod(def.dir * (def.m * u + off0), 1) * P, d = def.dir > 0 ? head : P - head;
    const passes = [[L, 3.4, .1], [L * .6, 2.2, .2], [L * .3, 1.5, .42], [Math.max(10 * S, L * .1), 1, .95]];
    g.lineCap = 'round';
    for (const [len, ww, a] of passes) {
      g.setLineDash([len, P - len]); g.lineDashOffset = def.dir > 0 ? len - d : -(P - d);
      g.strokeStyle = len === passes[3][0] ? `rgba(240,248,255,${a * al})` : `rgba(${def.col},${a * al})`; g.lineWidth = ww * w * S; g.stroke(def.path);
    }
    g.setLineDash([]);
  }

  function draw(t) {
    if (!layout()) return;
    const u = t / LOOP, ph = TAU * u, z = 1 + .007 * Math.sin(ph), dx = Math.sin(ph) * .011 * W, dy = Math.cos(ph) * .008 * H;
    const cam = f => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(W / 2 + dx * f, H / 2 + dy * f); const k = 1 + (z - 1) * f; ctx.scale(k, k); ctx.translate(-W / 2, -H / 2); };
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#020a35'; ctx.fillRect(0, 0, W, H);

    /* 1 · the picture */
    cam(1); ctx.drawImage(base, -mx, -my);
    if (ready) {
      /* 2 · cloud light turning across each planet (drawn small, only over the planet, refreshed 30 times a second: it moves slowly) */
      ctx.globalCompositeOperation = 'lighter';
      for (const pl of lite ? [] : pls) {
        const key = Math.floor(t * 30);
        if (pl.key !== key) {
          pl.key = key; const g = pl.g, tile = 520 * sc * fxs;
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, pl.cv.width, pl.cv.height);
          if (pl.pat && pl.pat.setTransform) pl.pat.setTransform(new DOMMatrix().translate(mod(pl.dir * u * tile, tile) - tile, mod(pl.p * 90, tile) - tile).scale(tile / 512));
          g.fillStyle = pl.pat || 'rgba(140,190,255,.1)'; g.fillRect(0, 0, pl.cv.width, pl.cv.height);
          g.globalCompositeOperation = 'destination-in'; g.drawImage(pl.mask, 0, 0);
        }
        ctx.globalAlpha = .55 + .2 * Math.sin(ph + pl.p); ctx.drawImage(pl.cv, pl.x0, pl.y0, pl.bw, pl.bh);
      }
      ctx.globalAlpha = 1;
      /* 3 · breathing nebula */
      for (const [x, y, r, col, a] of lite ? [] : NEB) {
        const sp = nebSpr[col] || (nebSpr[col] = (() => { const c = mk(96, 96), g = c.getContext('2d'), q = g.createRadialGradient(48, 48, 0, 48, 48, 48); q.addColorStop(0, `rgba(${col},1)`); q.addColorStop(1, `rgba(${col},0)`); g.fillStyle = q; g.fillRect(0, 0, 96, 96); return c; })());
        const cx = ox + (x + 26 * Math.sin(ph + x)) * sc, cy = oy + (y + 18 * Math.cos(ph + y)) * sc, rr = r * sc;
        ctx.globalAlpha = a * (.55 + .45 * Math.sin(ph * 2 + x * .01)); ctx.drawImage(sp, cx - rr, cy - rr, rr * 2, rr * 2);
      }
      ctx.globalAlpha = 1;
      /* 4 · stars of the picture blink: dim the real star, then flash a spark on top */
      ctx.globalCompositeOperation = 'source-over';
      for (const s of twinkle) { s.v = .5 + .5 * Math.sin(ph * s.k + s.p); if (s.v > .97) continue; ctx.globalAlpha = (1 - s.v) * .8; ctx.fillStyle = `rgb(${s.bg})`; ctx.fillRect(s.x - 2.5 * sc, s.y - 2.5 * sc, 5 * sc, 5 * sc); }
      ctx.globalCompositeOperation = 'lighter';
      for (const s of twinkle) { const v = s.v; if (v > .72) { const a = (v - .72) / .28, sz = (4.5 + (s.l > 235 ? 7 : 2)) * sc * a; ctx.globalAlpha = a * .7; ctx.drawImage(glow, s.x - sz, s.y - sz, sz * 2, sz * 2); } }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
      for (const f of flares) {
        const v = Math.pow(.5 + .5 * Math.sin(ph * f.k + f.p), 1.6), sz = (16 + 54 * v) * f.s * sc;
        ctx.globalAlpha = .25 + .75 * v; ctx.drawImage(cross, f.x - sz, f.y - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 1;
      /* city lights on the dark planet flicker softly */
      for (const c of lite ? [] : city) { const v = Math.pow(.5 + .5 * Math.sin(ph * c.k + c.p), 2), sz = (4 + 8 * c.a) * sc; ctx.globalAlpha = .1 + .6 * v * c.a; ctx.drawImage(warmGlow, c.x - sz, c.y - sz, sz * 2, sz * 2); }
      ctx.globalAlpha = 1;
      /* 5 · every ring: a gentle shimmer, sparkles flowing round it, and a comet of light */
      for (const [i, rg] of rings.concat(streaks).entries()) {
        const sh = Math.pow(.5 + .5 * Math.sin(ph * (2 + (i % 3)) + rg.p), 2);
        ctx.lineCap = 'round'; ctx.setLineDash([]);
                ctx.strokeStyle = `rgba(${rg.col},${.1 + .22 * sh})`; ctx.lineWidth = 1.4 * rg.w * S; ctx.stroke(rg.path);
        const per = 19 * sc, q = Math.round(rg.len / per) * (1 + (i % 2));
        ctx.setLineDash([1.3 * S, per - 1.3 * S]); ctx.lineDashOffset = -rg.dir * q * per * u; ctx.strokeStyle = `rgba(${rg.col},.6)`; ctx.lineWidth = 1.5 * rg.w * S; ctx.stroke(rg.path);
        ctx.setLineDash([]);
        comet(ctx, rg, u, Math.min(rg.len * .3, 190 * sc), rg.w * 1.1, 1, i * .17);
        if (i >= rings.length) comet(ctx, rg, u, Math.min(rg.len * .18, 110 * sc), rg.w, .8, i * .17 + .5);
      }
      for (const l of limbs) {                                              // glint running along each planet's bright edge
        const sh = .5 + .5 * Math.sin(ph * 2 + l.p);
        ctx.strokeStyle = `rgba(${l.col},${.05 + .1 * sh})`; ctx.lineWidth = 7 * S; ctx.setLineDash([]); ctx.stroke(l.path);
        comet(ctx, l, u, l.len * .22, 1.5, 1, 0);
      }
    }
    /* 6 · stars drifting past at two depths */
    ctx.globalCompositeOperation = 'lighter';
    cam(.5);
    for (const d of dust1) { const x = mod(d.x - u * W, W), a = d.a * (.45 + .55 * Math.sin(ph * d.k + d.p) ** 2); ctx.fillStyle = `rgba(200,220,255,${a})`; ctx.fillRect(x, d.y, d.z, d.z); }
    cam(1.4);
    for (const d of lite ? [] : dust2) { const x = mod(d.x - u * W, W), a = d.a * (.4 + .6 * Math.sin(ph * d.k + d.p) ** 2); ctx.fillStyle = `rgba(210,225,255,${a})`; ctx.fillRect(x, d.y, d.z, d.z); if (d.z > 2 * S) { ctx.fillStyle = `rgba(170,200,255,${a * .35})`; ctx.fillRect(x - 3 * S, d.y + d.z / 2 - .4 * S, 7 * S + d.z, .8 * S); } }
    /* 7 · shooting stars */
    cam(.8);
    for (const [at, fx0, fy0, ang] of SHOOT) {
      const e = mod(u - at, 1) * LOOP / 1.9; if (e > 1) continue;
      const a = ang * Math.PI / 180, len = W * .3, x0 = fx0 * W, y0 = fy0 * H, hx = x0 + Math.cos(a) * len * e, hy = y0 + Math.sin(a) * len * e, tl = 150 * S * Math.sin(Math.PI * Math.min(1, e * 1.1)), al = Math.sin(Math.PI * e);
      const q = ctx.createLinearGradient(hx - Math.cos(a) * tl, hy - Math.sin(a) * tl, hx, hy); q.addColorStop(0, 'rgba(140,180,255,0)'); q.addColorStop(1, `rgba(235,245,255,${al})`);
      ctx.strokeStyle = q; ctx.lineWidth = 1.8 * S; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx - Math.cos(a) * tl, hy - Math.sin(a) * tl); ctx.lineTo(hx, hy); ctx.stroke();
      const gs = 9 * S; ctx.globalAlpha = al; ctx.drawImage(glow, hx - gs, hy - gs, gs * 2, gs * 2); ctx.globalAlpha = 1;
    }
    /* 8 · asteroids: some circle slowly where they float, some cross the whole screen; all tumble */
    ctx.globalCompositeOperation = 'source-over';
    const drift = [];
    for (const r of rocks) drift.push([r.z, r, 0]);
    for (const r of crossers) drift.push([r.z, r, 1]);
    drift.sort((a, b) => a[0] - b[0]);
    for (const [zz, r, cr] of drift) {
      cam(Math.min(1.9, .9 + zz * .5));
      let x, y;
      if (cr) { const span = W + 2 * r.size; x = mod(W * 1 + r.dir * (u + r.ph) * span, span) - r.size; y = r.y + Math.sin(ph + r.p) * 14 * S; }
      else { x = r.x + Math.cos(ph + r.p) * r.o; y = r.y + Math.sin(ph * 1 + r.p) * r.o * .6; }
      ctx.save(); ctx.translate(x, y); ctx.rotate((r.a0 || 0) + TAU * r.sp * u + (cr ? r.p : 0)); ctx.globalAlpha = zz < 1 ? .75 : 1; ctx.drawImage(r.c, -r.size / 2, -r.size / 2); ctx.restore();
    }
    ctx.globalAlpha = 1;
    /* 9 · floating light dust */
    cam(1.35); ctx.globalCompositeOperation = 'lighter';
    for (const m of lite ? [] : motes) { const a = .12 + .34 * Math.sin(ph * m.k + m.q) ** 2; ctx.fillStyle = `rgba(160,196,255,${a})`; ctx.beginPath(); ctx.arc(m.x + m.ax * Math.sin(ph * m.k + m.p), m.y + m.ay * Math.cos(ph * m.k + m.p), m.r, 0, TAU); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /* ───── video-like control surface (orbit.js and ambient.js drive this like the old <video>) ───── */
  const now = () => performance.now();
  const time = () => playing ? (((now() - clock0) / 1000 + off) % LOOP) : off % LOOP;
  const tick = () => {
    raf = 0; if (!playing || !cv.isConnected) return;
    const n = now(); if (lastT) { const dt = Math.min(n - lastT, 100); avg = avg * .95 + dt * .05; if (!lite && ++nfr > 120 && avg > 40) lite = true; } lastT = n;   // steady slowness (not a one-off hiccup) switches to the lighter look
    draw(time()); raf = requestAnimationFrame(tick);
  };
  Object.defineProperties(cv, {
    /* currentTime still counts in sound-loop lengths. Setting it only slides the picture by the shortest distance, so it lines up with the sound without a visible jump. */
    currentTime: { get: () => time() % PERIOD, set(v) { const cur = time(), want = mod(+v || 0, PERIOD), dl = mod(want - cur % PERIOD + PERIOD / 2, PERIOD) - PERIOD / 2; off = mod(cur + dl, LOOP); clock0 = now(); if (!playing) draw(off); } },
    duration: { get: () => PERIOD },
    readyState: { get: () => 4 },
    paused: { get: () => !playing },
  });
  cv.play = () => { if (!playing) { playing = true; clock0 = now(); lastT = 0; } if (!raf) raf = requestAnimationFrame(tick); return Promise.resolve(); };
  cv.pause = () => { if (playing) { off = time(); playing = false; } if (raf) { cancelAnimationFrame(raf); raf = 0; } if (cv.isConnected) draw(off); };
  new ResizeObserver(() => { if (cv.isConnected) { if (!playing) { base = null; draw(off); } else base = null; } }).observe(cv);
  return cv;
}
