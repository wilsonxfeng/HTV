import type { EchoSession,Palm } from '../movement-echoes/types';
import type { Vec3 } from '../../lib/types';
/** Fixed baseline only. No ankle, wrist, or moving-joint alignment; no limb deformation. */
export function bodyAnchors(points:Vec3[],side:'Left'|'Right'|'Unconfirmed',width:number,height:number):Palm|null {
  if(points.length!==33)return null;
  const hip=points[side==='Left'?23:24],shoulder=points[side==='Left'?11:12];
  if(!hip||!shoulder||(hip.visibility??0)<.6||(shoulder.visibility??0)<.6)return null;
  const origin={x:hip.x*width,y:hip.y*height},dx=(shoulder.x-hip.x)*width,dy=(shoulder.y-hip.y)*height;
  if(Math.hypot(dx,dy)<20)return null;
  // A registration basis formed from the observed torso axis, not a body silhouette.
  return [origin,{x:origin.x+dx,y:origin.y+dy},{x:origin.x-dy,y:origin.y+dx},{x:origin.x+dx-dy,y:origin.y+dy+dx}];
}
export function baselineAnchors(session:EchoSession,width:number,height:number) {
  return bodyAnchors(session.baselineImage??[],session.selectedHand,width,height);
}
