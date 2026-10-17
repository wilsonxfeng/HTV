import { FilesetResolver,PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Vec3 } from '../../lib/types';
import type { MaskQuality } from '../movement-echoes/types';
/** Uses the verified person-confidence mask bundled with Google's Pose Landmarker. */
export async function createBodySegmenter() {
  const files=await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`);
  const model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}models/pose_landmarker_full.task`,delegate:'CPU'},runningMode:'IMAGE',numPoses:2,outputSegmentationMasks:true,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5});
  return {
    segment(canvas:HTMLCanvasElement,required:Vec3[]) {
      const result=model.detect(canvas);
      try{
        const mask=result.segmentationMasks?.[0];
        if(result.landmarks.length!==1||!mask)throw Error('A single person could not be segmented.');
        const values=mask.getAsFloat32Array();
        const ctx=canvas.getContext('2d',{willReadFrequently:true})!,pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        const quality=applyPersonMask(pixels,values,mask.width,mask.height,required);
        ctx.putImageData(pixels,0,0);return quality;
      }finally{result.close();}
    },close:()=>model.close(),
  };
}
export function applyPersonMask(pixels:ImageData,mask:Float32Array,maskWidth:number,maskHeight:number,required:Vec3[]):MaskQuality {
  let count=0,border=0;
  const at=(x:number,y:number)=>mask[Math.min(maskHeight-1,Math.max(0,Math.floor(y*maskHeight)))*maskWidth+Math.min(maskWidth-1,Math.max(0,Math.floor(x*maskWidth)))];
  for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++){
    const probability=at((x+.5)/pixels.width,(y+.5)/pixels.height),alpha=Math.max(0,Math.min(1,(probability-.35)/.4));
    pixels.data[(y*pixels.width+x)*4+3]=Math.round(alpha*255);
    if(alpha>.5){count++;if(x===0||y===0||x===pixels.width-1||y===pixels.height-1)border++;}
  }
  const retained=required.length?required.filter(p=>at(p.x,p.y)>.45).length/required.length:0,area=count/(pixels.width*pixels.height),edge=border/(2*(pixels.width+pixels.height));
  const warnings:string[]=[];
  if(retained<1)warnings.push('The person mask did not retain the tracked limb.');
  if(area<.02||area>.9)warnings.push('Person outline is too small or fills the frame.');
  if(edge>.12)warnings.push('The person outline touches the frame edge.');
  return {valid:!warnings.length,score:retained,palmRetained:retained,tipsRetained:retained,edgeLeak:edge,area,warnings};
}
