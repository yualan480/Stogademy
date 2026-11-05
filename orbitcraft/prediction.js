// Keep local movement independent of packet arrival. Compare acknowledgements
// against the point already simulated by the server, not the original send pose.
export class PoseHistory{
 constructor(){this.points=[];}
 record(time,p){const point={time,x:p.x,y:p.y,z:p.z};if(this.points.at(-1)?.time===time)this.points[this.points.length-1]=point;else this.points.push(point);while(this.points.length>2&&this.points[1].time<time-3000)this.points.shift();}
 at(time){const list=this.points;if(!list.length||time<list[0].time||time>list.at(-1).time)return null;for(let i=1;i<list.length;i++)if(list[i].time>=time){const a=list[i-1],b=list[i],t=(time-a.time)/(b.time-a.time||1);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}return list[0];}
 clear(){this.points.length=0;}
}
export function reconciliationError(server,sent,history,now){if(!sent)return null;const confirmedTime=sent.time+Math.max(0,server.inputElapsed||0)*1000;if(confirmedTime>now)return null;const confirmed=history.at(confirmedTime);if(!confirmed)return null;const error={x:server.x-confirmed.x,y:server.y-confirmed.y,z:server.z-confirmed.z};for(const axis of ['x','y','z'])if(Math.abs(error[axis])<.035)error[axis]=0;return error;}
export function correctionStep(error,dt){const length=Math.hypot(error.x,error.y,error.z),factor=length?Math.min(1-Math.exp(-dt*5),1.5*dt/length):0;return {x:error.x*factor,y:error.y*factor,z:error.z*factor};}
