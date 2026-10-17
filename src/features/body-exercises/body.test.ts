import { describe, expect, it } from 'vitest';
import { jointAngle, poseValue, analyzeBodySession } from '../body-tracking/poseMetrics';
import { detectBodyRepetitions } from './repetitionDetection';
import { bodyAnchors } from '../body-echoes/bodyAlignment';
import { fitPalm, phaseToTime, timeToPhase, compatible } from '../movement-echoes/geometry';
import { applyPersonMask } from '../body-echoes/bodySegmentation';
import type { MotionSession, Vec3 } from '../../lib/types';

const points=()=>Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,presence:1}));
function signal(speed=1) {return Array.from({length:157},(_,i)=>{const seconds=i/12,phase=(seconds%4)/4;return {tMs:seconds*1000*speed,value:90+60*Math.max(0,1-Math.abs(phase-.5)*4),valid:true};});}
describe('deterministic body measurement and phase',()=>{
  it('measures knee extension and elbow flexion from the corresponding joint',()=>{
    expect(jointAngle({x:0,y:1,z:0},{x:0,y:0,z:0},{x:1,y:0,z:0})).toBeCloseTo(90);
    const p=points();p[24]={x:0,y:1,z:0,visibility:1,presence:1};p[26]={x:0,y:0,z:0,visibility:1,presence:1};p[28]={x:0,y:-1,z:0,visibility:1,presence:1};
    expect(poseValue(p,'seated-knee-extension','Right')).toBeCloseTo(180);
    p[12]=p[24];p[14]=p[26];p[16]=p[28];expect(poseValue(p,'unweighted-bicep-curl','Right')).toBeCloseTo(0);
    p[16]={x:1,y:0,z:0,visibility:1,presence:1};expect(poseValue(p,'unweighted-bicep-curl','Right')).toBeCloseTo(90);
    expect(jointAngle(p[26],p[26],p[28])).toBeNull();
  });
  it('detects three complete repetitions and synchronizes different tempos at the measured peak',()=>{
    const a=detectBodyRepetitions(signal()),b=detectBodyRepetitions(signal(1.6));
    expect(a).toHaveLength(3);expect(b).toHaveLength(3);
    expect(phaseToTime(.5,a[0])).toBe(a[0].peakMs);expect(phaseToTime(.5,b[0])).toBe(b[0].peakMs);
    expect(timeToPhase(a[0].peakMs,a[0])).toBe(.5);expect(b[0].peakMs/a[0].peakMs).toBeCloseTo(1.6);
  });
  it('does not count a cycle across missing tracking, a clock gap, or a partial movement',()=>{
    const missing=signal().map(f=>f.tMs>1800&&f.tMs<2200?{...f,valid:false,value:null}:f);
    expect(detectBodyRepetitions(missing)).toHaveLength(2);
    expect(detectBodyRepetitions(signal().filter(f=>f.tMs<1800||f.tMs>2300))).toHaveLength(2);
    expect(detectBodyRepetitions(signal().slice(0,25))).toHaveLength(0);
    expect(detectBodyRepetitions(signal().map(f=>({...f,value:90+Math.sin(f.tMs)*.4})))).toHaveLength(0);
  });
  it('keeps baseline anchors fixed when the ankle moves and uses one uniform transform',()=>{
    const p=points();p[24]={...p[24],x:.3,y:.6};p[12]={...p[12],x:.3,y:.2};
    const baseline=bodyAnchors(p,'Right',640,480)!;p[28]={...p[28],x:.9,y:.9};
    expect(bodyAnchors(p,'Right',640,480)).toEqual(baseline);
    const transformed=baseline.map(v=>({x:v.x*1.3+20,y:v.y*1.3-15})) as typeof baseline;
    const fit=fitPalm(baseline,transformed)!;expect(fit.scale).toBeCloseTo(1.3);expect(fit.error).toBeLessThan(1e-6);
  });
  it('applies a person alpha mask without changing any recorded RGB values',()=>{
    const pixels={width:10,height:10,data:new Uint8ClampedArray(400)} as ImageData;
    for(let i=0;i<100;i++)pixels.data.set([i,80,90,255],i*4);
    const mask=new Float32Array(100);for(let y=2;y<8;y++)for(let x=2;x<8;x++)mask[y*10+x]=1;
    const rgb=Array.from(pixels.data).filter((_,i)=>i%4!==3);const quality=applyPersonMask(pixels,mask,10,10,[{x:.5,y:.5,z:0}]);
    expect(quality.valid).toBe(true);expect(Array.from(pixels.data).filter((_,i)=>i%4!==3)).toEqual(rgb);expect(pixels.data[3]).toBe(0);expect(pixels.data[(5*10+5)*4+3]).toBe(255);
    expect(applyPersonMask(pixels,mask,10,10,[{x:.1,y:.1,z:0}]).valid).toBe(false);
  });
  it('rejects incompatible viewpoints and never reports trunk rotation degrees',()=>{
    const descriptor={exerciseId:'seated-knee-extension',selectedHand:'Right',mirrored:false,trackingMode:'pose',cameraView:'side',analysisVersion:'body-v1'};
    expect(compatible(descriptor,{...descriptor,cameraView:'front'})).toBe(false);
    expect(compatible(descriptor,{...descriptor,analysisVersion:'body-v2'})).toBe(false);
    const p:Vec3[]=points();p[11].x=.3;p[12].x=.7;p[23].x=.4;p[24].x=.6;
    const s:MotionSession={id:'trunk',exerciseId:'seated-trunk-rotation',trackingMode:'pose',hand:'Right',source:'camera',createdAt:new Date().toISOString(),duration:1,cycleDuration:8,frames:[{t:0,tracking:true,landmarks:p,worldLandmarks:p,imageLandmarks:p,confidence:1}],calibration:{neutral:p,target:p,imageNeutral:p,hand:'Right',source:'personal',createdAt:new Date().toISOString()}};
    const metrics=analyzeBodySession(s);expect(metrics.body?.primaryValue).toBeNull();expect(metrics.body?.movementRange).toBeNull();expect(metrics.body?.maximumAngle).toBeNull();
  });
});
