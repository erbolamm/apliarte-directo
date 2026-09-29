export type Camera={tilt:number;turn:number;zoom:number;panX:number;panY:number};
export type TouchPoint={x:number;y:number};
export const DEFAULT_CAMERA:Camera={tilt:52,turn:-20,zoom:1,panX:0,panY:0};
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const wrap=(n:number)=>((n+180)%360+360)%360-180;
export function boundCamera(c:Camera):Camera{return {tilt:clamp(c.tilt,20,72),turn:wrap(c.turn),zoom:clamp(c.zoom,.45,3),panX:clamp(c.panX,-1200,1200),panY:clamp(c.panY,-900,900)};}
const middle=(p:TouchPoint[])=>({x:p.reduce((n,q)=>n+q.x,0)/p.length,y:p.reduce((n,q)=>n+q.y,0)/p.length});
export function gestureCamera(base:Camera,start:TouchPoint[],end:TouchPoint[],pan=false):Camera {
 if(!start.length||start.length!==end.length)return base;
 const a=middle(start),b=middle(end),dx=b.x-a.x,dy=b.y-a.y;
 if(start.length>=2){
  const dist=(p:TouchPoint[])=>Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
  const angle=(p:TouchPoint[])=>Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x)*180/Math.PI;
  return boundCamera({...base,panX:base.panX+dx,panY:base.panY+dy,zoom:base.zoom*dist(end)/Math.max(12,dist(start)),turn:base.turn+wrap(angle(end)-angle(start))});
 }
 return boundCamera(pan?{...base,panX:base.panX+dx,panY:base.panY+dy}:{...base,turn:base.turn+dx*.2,tilt:base.tilt-dy*.16});
}
export function wheelCamera(base:Camera,delta:number):Camera{return boundCamera({...base,zoom:base.zoom*Math.exp(-clamp(delta,-150,150)*.003)});}
