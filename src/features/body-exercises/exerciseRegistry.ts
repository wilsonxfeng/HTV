import type { HandSide } from '../../lib/types';

export type BodyExerciseId = 'seated-knee-extension' | 'unweighted-bicep-curl' | 'seated-trunk-rotation';
export type BodyRegion = 'hand' | 'arm' | 'leg' | 'core';
export type CameraView = 'front' | 'side' | 'three-quarter';
export interface ExerciseConfig {
  id: string; title: string; bodyRegion: BodyRegion; trackingMode: 'hand' | 'pose';
  cameraView: CameraView; primaryMetric: string; peakLabel: string; unit: string;
  phaseDetector: 'spread' | 'extension' | 'flexion' | 'rotation';
  alignmentStrategy: 'palm' | 'baseline-torso' | 'baseline-pelvis';
  repetitionTarget: number; supportedEchoMode: 'hand' | 'person'; experimental?: boolean;
  setup: string; movement: string; framing: string; source: string;
  trackedLandmarks: (side: HandSide) => number[];
}
export const BODY_ANALYSIS_VERSION = 'body-v1';
export const BODY_SEGMENTATION_VERSION = 'pose-person-v1';
const source = 'https://www.flintrehab.com/stroke-exercises/';
export const exerciseRegistry: ExerciseConfig[] = [
  { id:'finger-spread-close',title:'Finger Spread & Close',bodyRegion:'hand',trackingMode:'hand',cameraView:'front',primaryMetric:'Index–middle hold angle',peakLabel:'Finger separation',unit:'°',phaseDetector:'spread',alignmentStrategy:'palm',repetitionTarget:3,supportedEchoMode:'hand',setup:'Support your arm with your palm facing the camera.',movement:'Gently spread and close your fingers.',framing:'Keep your whole hand visible.',source,trackedLandmarks:()=>Array.from({length:21},(_,i)=>i) },
  { id:'seated-knee-extension',title:'Seated Knee Extension',bodyRegion:'leg',trackingMode:'pose',cameraView:'side',primaryMetric:'Maximum knee angle',peakLabel:'Knee angle',unit:'°',phaseDetector:'extension',alignmentStrategy:'baseline-pelvis',repetitionTarget:3,supportedEchoMode:'person',setup:'Sit in a stable chair. Place the camera to your side, with your hip, knee and whole foot visible.',movement:'Straighten your selected leg within your prescribed or comfortable range. Hold briefly, then lower your foot.',framing:'Keep your hip, knee and ankle inside the frame.',source,trackedLandmarks:side=>side==='Left'?[11,23,25,27]:[12,24,26,28] },
  { id:'unweighted-bicep-curl',title:'Unweighted Bicep Curl',bodyRegion:'arm',trackingMode:'pose',cameraView:'side',primaryMetric:'Elbow flexion range',peakLabel:'Elbow flexion',unit:'°',phaseDetector:'flexion',alignmentStrategy:'baseline-torso',repetitionTarget:3,supportedEchoMode:'person',setup:'Sit comfortably with your arm supported as prescribed. Face side-on or slightly toward the camera; keep your arm clear of your torso.',movement:'Without a weight, gently bend your elbow to bring your hand toward your shoulder. Lower your forearm slowly.',framing:'Keep your shoulder, elbow, wrist and hip visible.',source,trackedLandmarks:side=>side==='Left'?[11,13,15,23]:[12,14,16,24] },
  { id:'seated-trunk-rotation',title:'Seated Trunk Rotation',bodyRegion:'core',trackingMode:'pose',cameraView:'front',primaryMetric:'Video comparison',peakLabel:'Torso orientation',unit:'',phaseDetector:'rotation',alignmentStrategy:'baseline-pelvis',repetitionTarget:3,supportedEchoMode:'person',experimental:true,setup:'Sit upright in a stable chair with both shoulders and hips visible. Use only your clinician’s prescribed movement.',movement:'Gently turn your upper body, then return to the starting position. Keep your pelvis seated.',framing:'Keep both shoulders and hips visible.',source,trackedLandmarks:()=>[11,12,23,24] },
];
export const bodyExercises = exerciseRegistry.filter(e=>e.trackingMode==='pose');
export const getExercise = (id?:string) => exerciseRegistry.find(e=>e.id===id) ?? exerciseRegistry[0];
export const bodyRegions: {id:BodyRegion;label:string}[] = [{id:'hand',label:'Hand & Fingers'},{id:'arm',label:'Arm & Elbow'},{id:'leg',label:'Leg & Knee'},{id:'core',label:'Core & Torso'}];
