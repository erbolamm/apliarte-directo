import type { Pt } from './layout';
export type Box = { x:number; y:number; w:number; d:number; h:number; color:string; kind?:string; label?:string };
export const furniture: Box[] = [
  {x:75,y:95,w:165,d:42,h:38,color:'var(--sofa)',kind:'sofa'},
  {x:65,y:85,w:185,d:12,h:72,color:'var(--accent)',kind:'back'},
  {x:255,y:210,w:96,d:48,h:26,color:'var(--wood)',kind:'coffee'},
  {x:425,y:68,w:105,d:24,h:96,color:'var(--wood-dark)',kind:'shelf'},
  {x:62,y:240,w:56,d:30,h:40,color:'var(--wood)',kind:'coffee'},
  {x:365,y:100,w:14,d:76,h:80,color:'var(--screen-dark)',kind:'screen'},
  {x:700,y:65,w:176,d:38,h:52,color:'var(--wood)',kind:'desk',label:'REUNIONES'},
  {x:740,y:165,w:138,d:42,h:42,color:'var(--wood)',kind:'meeting'},
  {x:1090,y:245,w:122,d:48,h:52,color:'var(--wood)',kind:'desk',label:'JAVIER · DUEÑO'},
  {x:1180,y:75,w:30,d:100,h:110,color:'var(--wood-dark)',kind:'shelf'},
  ...[118,288,458].flatMap((x,i)=>[585,710].map((y,j)=>({x:x-56,y:y-45,w:112,d:45,h:45,color:'var(--wood)',kind:'desk',label:['CO','CL','GE','GR','OP','EX'][j*3+i]}))),
  {x:1110,y:570,w:105,d:190,h:68,color:'var(--wood)',kind:'shelf'},
  ...[736,862,988].flatMap(x=>[612,750].map(y=>({x:x-36,y:y+25,w:72,d:34,h:43,color:'var(--wood-light)',kind:'parcel'}))),
  {x:42,y:42,w:26,d:26,h:52,color:'var(--plant)',kind:'plant'},
  {x:1210,y:335,w:26,d:26,h:52,color:'var(--plant)',kind:'plant'},
  {x:42,y:780,w:26,d:26,h:52,color:'var(--plant)',kind:'plant'},
  {x:1210,y:780,w:26,d:26,h:52,color:'var(--plant)',kind:'plant'},
];
export const walls:Box[] = [];
function wall(x:number,y:number,w:number,d:number,h=65) {walls.push({x,y,w,d,h,color:'var(--wall)',kind:'wall'});}
wall(16,16,1248,10,100); wall(16,16,10,828,70); wall(1254,16,10,828,70); wall(16,834,1248,10,22);
wall(595,24,12,390); wall(650,24,12,390); wall(595,498,12,336); wall(650,498,12,336);
for(const y of [408,492]) for(const [left,right,door] of [[24,596,310],[660,1256,950]]) {wall(left,y,door-46-left,10,40);wall(door+46,y,right-door-46,10,40);}
walls.push({x:1040,y:24,w:6,d:218,h:110,color:"rgba(143,213,250,.16)",kind:"glass"}, {x:1040,y:318,w:6,d:90,h:110,color:"rgba(143,213,250,.16)",kind:"glass"});
export const obstacles = [...walls,...furniture];
export const RADIUS=16;
type Rect={l:number;r:number;t:number;b:number};
type Nav={rects:Rect[];corners:Pt[];edges:{j:number;d:number}[][]};
const distance=(a:Pt,b:Pt)=>Math.hypot(a.x-b.x,a.y-b.y);
function freeIn(rects:Rect[],p:Pt) {return p.x>=34&&p.x<=1246&&p.y>=34&&p.y<=816&&!rects.some(o=>p.x>o.l&&p.x<o.r&&p.y>o.t&&p.y<o.b);}
function segmentFreeIn(rects:Rect[],a:Pt,b:Pt) {
  if(!freeIn(rects,a)||!freeIn(rects,b)) return false;
  for(const o of rects) {
    let lo=0,hi=1;
    for(const [v,delta,min,max] of [[a.x,b.x-a.x,o.l,o.r],[a.y,b.y-a.y,o.t,o.b]]) {
      if(Math.abs(delta)<1e-9) {if(v<=min||v>=max) {lo=2;break;}} else {
        const t1=(min-v)/delta,t2=(max-v)/delta;
        lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
      }
    }
    if(lo<hi&&hi>0&&lo<1) return false;
  }
  return true;
}
function buildNav(boxes:Box[]):Nav {
  const rects=boxes.map(o=>({l:o.x-RADIUS,r:o.x+o.w+RADIUS,t:o.y-RADIUS,b:o.y+o.d+RADIUS}));
  const corners=rects.flatMap(o=>[{x:o.l-.1,y:o.t-.1},{x:o.r+.1,y:o.t-.1},{x:o.l-.1,y:o.b+.1},{x:o.r+.1,y:o.b+.1}]).filter(p=>freeIn(rects,p));
  const edges=corners.map((a,i)=>corners.flatMap((b,j)=>i!==j&&segmentFreeIn(rects,a,b)?[{j,d:distance(a,b)}]:[]));
  return {rects,corners,edges};
}
// The office nav is built once; the board nav (outer walls only) is built on first use.
export const OUTER_WALLS = walls.slice(0,4);
// On the board the back wall moves back so the column letters above the board stay visible.
export const BOARD_WALLS:Box[] = [
  {x:16,y:-24,w:1248,d:10,h:100,color:'var(--wall)',kind:'wall'},
  {x:16,y:-24,w:10,d:868,h:70,color:'var(--wall)',kind:'wall'},
  {x:1254,y:-24,w:10,d:868,h:70,color:'var(--wall)',kind:'wall'},
  walls[3],
];
const officeNav=buildNav(obstacles);
let boardNav:Nav|null=null;
let boardMode=false;
const nav=()=>boardMode?(boardNav??=buildNav(BOARD_WALLS)):officeNav;
export function setBoardMode(on:boolean) {boardMode=on;}
export function isBoardMode() {return boardMode;}
export function isFree(p:Pt) {return freeIn(nav().rects,p);}
export function segmentFree(a:Pt,b:Pt) {return segmentFreeIn(nav().rects,a,b);}
export function navigate(start:Pt,end:Pt):Pt[] {
  if(segmentFree(start,end)) return [start,end];
  if(!isFree(start)||!isFree(end)) throw new Error('Puesto dentro de un obstáculo');
  const {corners,edges}=nav();
  const nodes=[...corners,start,end], n=nodes.length, source=n-2,target=n-1;
  const graph=[...edges.map(e=>[...e]),[],[]] as {j:number;d:number}[][];
  for(const i of [source,target]) for(let j=0;j<i;j++) if(segmentFree(nodes[i],nodes[j])) {const d=distance(nodes[i],nodes[j]);graph[i].push({j,d});graph[j].push({j:i,d});}
  const costs=Array(n).fill(Infinity), prev=Array(n).fill(-1), seen=new Set<number>();costs[source]=0;
  for(let step=0;step<n;step++) {let best=-1;for(let i=0;i<n;i++) if(!seen.has(i)&&(best<0||costs[i]<costs[best]))best=i;
    if(best<0||!Number.isFinite(costs[best]))break;if(best===target)break;seen.add(best);
    for(const e of graph[best]) if(costs[best]+e.d<costs[e.j]) {costs[e.j]=costs[best]+e.d;prev[e.j]=best;}
  }
  if(!Number.isFinite(costs[target])) throw new Error('No hay recorrido seguro');
  const path:Pt[]=[];for(let i=target;i!==-1;i=prev[i])path.unshift(nodes[i]);return path;
}

// !damas board: 12x8 equal squares centred on the office floor, named like chess
// (columns a-l from the left, rows 1-8 from the bottom; a1 = bottom-left).
export const BOARD={cols:12,rows:8,cell:97,x:58,y:37,frame:40};
export const BOARD_COLUMNS='abcdefghijkl';
export function parseSquare(name:string):{col:number;row:number}|null {
  const m=/^([a-l])([1-8])$/i.exec(String(name||'').trim());
  return m?{col:BOARD_COLUMNS.indexOf(m[1].toLowerCase()),row:Number(m[2])}:null;
}
export function squareCenter(col:number,row:number):Pt {
  return {x:BOARD.x+col*BOARD.cell+BOARD.cell/2,y:BOARD.y+(BOARD.rows-row)*BOARD.cell+BOARD.cell/2};
}
