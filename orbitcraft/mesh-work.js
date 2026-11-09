// A block affects its own section and the neighboring section only at a seam.
export function changedSections(y){return new Set([Math.floor((y-1)/16),Math.floor(y/16),Math.floor((y+1)/16)]);}
export function mergeSections(previous,next,min=-4,max=19){if(previous===null||next===null)return null;return new Set([...(previous||[]),...next].filter(y=>y>=min&&y<=max));}
