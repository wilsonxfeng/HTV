import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { makeDemoHand } from '../lib/demo';
import { HAND_CONNECTIONS } from '../lib/geometry';
import type { HandSide, Vec3 } from '../lib/types';
import './hand-stage.css';

export interface HandStageProps {
  recorded?: Vec3[];
  reference?: Vec3[];
  showRecorded?: boolean;
  showReference?: boolean;
  showVectors?: boolean;
  selectedPair?: [number, number] | null;
  resetKey?: number;
  preview?: boolean;
  animate?: boolean;
  hand?: HandSide;
  onSelectFinger?: (name: string) => void;
}

type PointSource = { current: Vec3[] };
const FINGERTIPS = [4, 8, 12, 16, 20];
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const UP = new THREE.Vector3(0, 1, 0);
const IVORY = '#b7695d';
const MINT = '#426e5b';
const AMBER = '#99651a';

function fingerForPoint(index: number) {
  return index === 0 ? -1 : Math.min(4, Math.floor((index - 1) / 4));
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function validPoints(points?: Vec3[]) {
  return points?.length === 21 && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

function useWebGLSupport() {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2');
      setSupported(Boolean(context));
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

class StageBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function FlatHand({ points, ghost = false }: { points: Vec3[]; ghost?: boolean }) {
  const project = (p: Vec3) => ({ x: 180 + p.x * 83, y: 285 - p.y * 83 });
  return (
    <g fill="none" stroke={ghost ? MINT : IVORY} opacity={ghost ? 0.35 : 0.9} strokeWidth={ghost ? 2 : 3}>
      {HAND_CONNECTIONS.map(([a, b]) => {
        const p = project(points[a]); const q = project(points[b]);
        return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
      })}
      {points.map((point, i) => { const p = project(point); return <circle key={i} cx={p.x} cy={p.y} r={3.4} fill={ghost ? MINT : IVORY} />; })}
    </g>
  );
}

function StageFallback({ recorded, reference, preview, hand = 'Right', showRecorded = true, showReference = true }: HandStageProps) {
  const actual = validPoints(recorded) ? recorded! : preview ? makeDemoHand(0.7, hand) : undefined;
  const target = validPoints(reference) ? reference! : preview ? makeDemoHand(1, hand) : undefined;
  return <div className="hand-stage-fallback" role="img" aria-label="Two dimensional hand motion preview">
    <svg viewBox="0 0 360 330" aria-hidden="true">
      {showReference && target && <FlatHand points={target} ghost />}
      {showRecorded && actual && <FlatHand points={actual} />}
    </svg>
    <span className="hand-stage-fallback-label">2D motion preview</span>
    <p>3D unavailable. Showing 2D replay.</p>
  </div>;
}

function HandSkeleton({ source, ghost = false, selectedPair, onSelectFinger }: {
  source: PointSource;
  ghost?: boolean;
  selectedPair?: [number, number] | null;
  onSelectFinger?: (name: string) => void;
}) {
  const bones = useRef<(THREE.Mesh | null)[]>([]);
  const joints = useRef<(THREE.Mesh | null)[]>([]);
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const vector = useMemo(() => new THREE.Vector3(), []);
  const selectedFingers = selectedPair?.map(fingerForPoint) ?? [];
  const palmGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
    return geometry;
  }, []);
  useEffect(() => () => palmGeometry.dispose(), [palmGeometry]);

  useFrame(() => {
    const points = source.current;
    if (group.current) group.current.visible = points.length === 21;
    if (points.length !== 21) return;
    HAND_CONNECTIONS.forEach(([a, b], index) => {
      const mesh = bones.current[index];
      if (!mesh) return;
      const p = points[a]; const q = points[b];
      mesh.position.set((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      vector.set(q.x - p.x, q.y - p.y, q.z - p.z);
      const length = vector.length();
      mesh.quaternion.setFromUnitVectors(UP, vector.normalize());
      const palm = a === 0 || (a % 4 === 1 && b % 4 === 1);
      const radius = ghost ? 0.020 : palm ? 0.022 : 0.030;
      mesh.scale.set(radius, Math.max(length, 0.001), radius);
    });
    points.forEach((point, index) => joints.current[index]?.position.set(point.x, point.y, point.z));
    const positions = palmGeometry.getAttribute('position');
    [0, 5, 9, 13, 17].forEach((index, vertex) => {
      const p = points[index];
      positions.setXYZ(vertex, p.x, p.y, p.z);
    });
    positions.needsUpdate = true;
    palmGeometry.computeVertexNormals();
  });

  const handlePointer = (event: ThreeEvent<PointerEvent>, index: number) => {
    if (ghost || !onSelectFinger) return;
    event.stopPropagation();
    setHovered(fingerForPoint(index));
    document.body.style.cursor = 'pointer';
  };
  const clearPointer = () => {
    setHovered(null);
    document.body.style.cursor = '';
  };
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  const choose = (event: ThreeEvent<MouseEvent>, index: number) => {
    if (ghost || !onSelectFinger || index === 0) return;
    event.stopPropagation();
    onSelectFinger(FINGER_NAMES[fingerForPoint(index)]);
  };
  const color = (index: number) => {
    if (ghost) return MINT;
    const finger = fingerForPoint(index);
    return selectedFingers.includes(finger) ? AMBER : hovered === finger ? '#ffffff' : IVORY;
  };
  return <group ref={group}>
    <mesh geometry={palmGeometry} renderOrder={ghost ? 0 : 1}>
      <meshStandardMaterial color={ghost ? '#58806a' : '#cc9380'} transparent opacity={ghost ? 0.045 : 0.07}
        side={THREE.DoubleSide} roughness={0.45} metalness={0.3} depthWrite={false} />
    </mesh>
    {HAND_CONNECTIONS.map((connection, index) => <mesh
      key={`bone-${index}`} ref={mesh => { bones.current[index] = mesh; }}
      onPointerOver={event => handlePointer(event, connection[1])} onPointerOut={clearPointer}
      onClick={event => choose(event, connection[1])} renderOrder={ghost ? 0 : 2}>
      <cylinderGeometry args={[0.72, 1, 1, 10]} />
      {ghost ? <meshBasicMaterial color="#426e5b" transparent opacity={0.58} depthWrite={false} toneMapped={false} /> :
        <meshPhysicalMaterial color={color(connection[1])} metalness={0.45} roughness={0.24}
          clearcoat={0.9} emissive={color(connection[1])} emissiveIntensity={0.11} />}
    </mesh>)}
    {Array.from({ length: 21 }, (_, index) => <mesh key={`joint-${index}`}
      ref={mesh => { joints.current[index] = mesh; }}
      onPointerOver={event => handlePointer(event, index)} onPointerOut={clearPointer}
      onClick={event => choose(event, index)} renderOrder={ghost ? 0 : 3}>
      <sphereGeometry args={[ghost ? 0.034 : index === 0 ? 0.058 : FINGERTIPS.includes(index) ? 0.041 : 0.048, 16, 12]} />
      {ghost ? <meshBasicMaterial color="#426e5b" transparent opacity={0.7} depthWrite={false} toneMapped={false} /> :
        <meshPhysicalMaterial color={color(index)} metalness={0.55} roughness={0.22}
          emissive={color(index)} emissiveIntensity={0.17} clearcoat={1} />}
    </mesh>)}
  </group>;
}

function DifferenceVectors({ actual, target, selectedPair }: { actual: PointSource; target: PointSource; selectedPair?: [number, number] | null }) {
  const line = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 10 * 6), 3));
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const a = actual.current; const b = target.current;
    if (line.current) line.current.visible = a.length === 21 && b.length === 21;
    if (a.length !== 21 || b.length !== 21) return;
    const positions = geometry.getAttribute('position');
    FINGERTIPS.forEach((tip, finger) => {
      const p = a[tip]; const q = selectedPair && !selectedPair.includes(tip) ? p : b[tip];
      for (let segment = 0; segment < 10; segment++) {
        const start = segment / 10; const end = (segment + 0.5) / 10;
        positions.setXYZ(finger * 20 + segment * 2, p.x + (q.x - p.x) * start, p.y + (q.y - p.y) * start, p.z + (q.z - p.z) * start);
        positions.setXYZ(finger * 20 + segment * 2 + 1, p.x + (q.x - p.x) * end, p.y + (q.y - p.y) * end, p.z + (q.z - p.z) * end);
      }
    });
    positions.needsUpdate = true;
    geometry.computeBoundingSphere();
  });
  return <lineSegments ref={line} geometry={geometry} renderOrder={4}>
    <lineBasicMaterial color={AMBER} transparent opacity={0.75} depthTest={false} />
  </lineSegments>;
}

function CameraRig({ resetKey, preview, animated }: { resetKey: number; preview: boolean; animated: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(preview ? 2.05 : 1.75, 2.05, preview ? 6.0 : 5.75);
    controls.current?.target.set(-0.08, 1.15, 0);
    controls.current?.update();
  }, [camera, resetKey, preview]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.07} enablePan={!preview}
    minDistance={3.5} maxDistance={13} minPolarAngle={0.25} maxPolarAngle={Math.PI * 0.73}
    autoRotate={preview && animated} autoRotateSpeed={0.38} enableZoom={!preview} />;
}

function Scene({ recorded, reference, showRecorded = true, showReference = true, showVectors = false,
  selectedPair, resetKey = 0, preview = false, animate = true, hand = 'Right', onSelectFinger, reducedMotion }: HandStageProps & { reducedMotion: boolean }) {
  const recordedSource = useRef<Vec3[]>([]);
  const referenceSource = useRef<Vec3[]>([]);
  const last = useRef(-1);
  const initial = useMemo(() => makeDemoHand(0.8, hand), [hand]);
  const recordedValid = validPoints(recorded); const referenceValid = validPoints(reference);
  recordedSource.current = recordedValid ? recorded! : preview ? initial : [];
  referenceSource.current = referenceValid ? reference! : preview ? makeDemoHand(1, hand) : [];
  useFrame(({ clock }) => {
    if (!preview || !animate || reducedMotion || (recordedValid && referenceValid)) return;
    const time = clock.elapsedTime;
    if (time - last.current < 1 / 30) return;
    last.current = time;
    const amount = 0.63 + Math.sin(time * 0.65) * 0.31;
    if (!referenceValid) referenceSource.current = makeDemoHand(amount, hand);
    if (!recordedValid) {
      const points = makeDemoHand(amount * 0.81, hand);
      // Landing-page demonstration only: an illustrative smaller comfortable spread.
      recordedSource.current = points;
    }
  }, -1);
  return <>
    <ambientLight intensity={0.8} />
    <directionalLight position={[2, 5, 6]} intensity={3.4} color="#fff5df" />
    <directionalLight position={[-4, 2, 0]} intensity={2.2} color="#fff0d4" />
    <pointLight position={[1, 0.4, -3]} intensity={9} distance={8} color="#b4d2a8" />
    <CameraRig resetKey={resetKey} preview={preview} animated={animate && !reducedMotion} />
    <Grid position={[0, -0.30, 0]} args={[20, 20]} cellSize={0.4} cellThickness={0.45}
      cellColor="#d5dccb" sectionSize={2} sectionThickness={0.7} sectionColor="#c0cdb7"
      fadeDistance={14} fadeStrength={2} infiniteGrid followCamera={false} />
    <mesh position={[-0.05, -0.29, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.52, 1.528, 96]} />
      <meshBasicMaterial color="#76946c" transparent opacity={0.12} depthWrite={false} />
    </mesh>
    <group rotation={[0, -0.12, -0.12]} position={[0.08, 0.06, 0]}>
      {showReference && <HandSkeleton source={referenceSource} ghost />}
      {showRecorded && <HandSkeleton source={recordedSource} selectedPair={selectedPair} onSelectFinger={onSelectFinger} />}
      {showVectors && showRecorded && showReference && <DifferenceVectors actual={recordedSource} target={referenceSource} selectedPair={selectedPair} />}
    </group>
  </>;
}

export default function HandStage(props: HandStageProps) {
  const supported = useWebGLSupport();
  const reducedMotion = useReducedMotion();
  const [contextLost, setContextLost] = useState(false);
  const fallback = <StageFallback {...props} />;
  return <div className={`hand-stage${props.preview ? ' hand-stage-preview' : ''}`}>
    <div className="hand-stage-atmosphere" />
    {supported === false || contextLost ? fallback : supported === null ? <div className="hand-stage-loading">Loading replay…<span /></div> :
      <StageBoundary fallback={fallback}>
        <Canvas camera={{ position: [1.75, 2.05, 5.75], fov: 32, near: 0.1, far: 60 }} dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          fallback={fallback} onCreated={({ gl }) => {
            gl.setClearColor('#070d12', 0);
            gl.domElement.setAttribute('aria-label', props.preview ? 'Animated three dimensional hand exercise demonstration' : 'Interactive three dimensional hand motion. Drag to orbit; scroll to zoom.');
            gl.domElement.setAttribute('role', 'img');
            gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setContextLost(true); }, { once: true });
          }}>
          <Suspense fallback={null}><Scene {...props} reducedMotion={reducedMotion} /></Suspense>
        </Canvas>
      </StageBoundary>}
    <div className="hand-stage-vignette" />
  </div>;
}
