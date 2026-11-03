export function levelCost(level){return level<16?7+2*level:level<31?5*level-38:9*level-158;}
export function xpProgress(total=0){let level=0,remaining=Math.max(0,Math.floor(total));while(level<10000&&remaining>=levelCost(level)){remaining-=levelCost(level);level++;}return {level,remaining,needed:levelCost(level),progress:remaining/levelCost(level)};}
