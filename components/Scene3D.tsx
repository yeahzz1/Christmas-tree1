import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { AppMode, ParticleConfig, AppColors } from '../types';

const CONFIG: { colors: AppColors; particles: ParticleConfig; camera: { z: number } } = {
  colors: {
    bg: 0x000000,
    champagneGold: 0xffd700, // Metallic Gold
    deepGreen: 0x165b33,     // Christmas Tree Green
    accentRed: 0xc41230,     // Christmas Red
  },
  particles: {
    count: 1200,
    dustCount: 2000,
    treeHeight: 24,
    treeRadius: 8,
  },
  camera: {
    z: 50,
  },
};

// --- Particle Class Definition ---
class Particle {
  mesh: THREE.Mesh | THREE.Group;
  type: string;
  isDust: boolean;
  posTree: THREE.Vector3;
  posScatter: THREE.Vector3;
  baseScale: number;
  spinSpeed: THREE.Vector3;
  id: number;

  constructor(mesh: THREE.Mesh | THREE.Group, type: string, isDust: boolean = false) {
    this.mesh = mesh;
    this.type = type;
    this.isDust = isDust;
    this.id = Math.random();

    this.posTree = new THREE.Vector3();
    this.posScatter = new THREE.Vector3();
    this.baseScale = mesh.scale.x;

    const speedMult = type === 'PHOTO' ? 0.3 : 2.0;
    this.spinSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * speedMult,
      (Math.random() - 0.5) * speedMult,
      (Math.random() - 0.5) * speedMult
    );

    this.calculatePositions();
  }

  calculatePositions() {
    // TREE SHAPE: Spiral
    const h = CONFIG.particles.treeHeight;
    const halfH = h / 2;
    let t = Math.random();
    t = Math.pow(t, 0.8); // Bias towards bottom
    const y = t * h - halfH;
    let rMax = CONFIG.particles.treeRadius * (1.0 - t);
    if (rMax < 0.5) rMax = 0.5;
    const angle = t * 50 * Math.PI + Math.random() * Math.PI;
    const r = rMax * (0.8 + Math.random() * 0.4);
    this.posTree.set(Math.cos(angle) * r, y, Math.sin(angle) * r);

    // SCATTER SHAPE: Large Cloud/Sphere
    let rScatter = this.isDust ? 15 + Math.random() * 25 : 10 + Math.random() * 15;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    this.posScatter.set(
      rScatter * Math.sin(phi) * Math.cos(theta),
      rScatter * Math.sin(phi) * Math.sin(theta),
      rScatter * Math.cos(phi)
    );
  }

  update(dt: number, mode: AppMode, time: number, focusTarget: THREE.Object3D | null, mainGroupMatrix: THREE.Matrix4) {
    let target = this.posTree;

    if (mode === 'SCATTER') target = this.posScatter;
    else if (mode === 'FOCUS') {
      if (this.mesh === focusTarget) {
        // Position directly in front of camera
        // We use world space calculation to bring it 'out' of the rotating group conceptually
        // But implementation-wise, we just move it to a specific local coord that might fight rotation
        // A better approach for "Focus" in a rotating group is to inverse project or just stop group rotation (handled in animate loop)
        // Here we just bring it close to the center and front.
        const invMatrix = new THREE.Matrix4().copy(mainGroupMatrix).invert();
        const cameraPosLocal = new THREE.Vector3(0, 0, 38).applyMatrix4(invMatrix); 
        target = cameraPosLocal;
      } else {
        target = this.posScatter;
      }
    }

    // Smooth movement interpolation (Luxury Feel = slower, heavier)
    // Focus target moves faster to snap into view
    const isTarget = mode === 'FOCUS' && this.mesh === focusTarget;
    const lerpSpeed = isTarget ? 3.5 : 1.8;
    this.mesh.position.lerp(target, lerpSpeed * dt);

    // Rotation
    if (mode === 'SCATTER' || (mode === 'FOCUS' && !isTarget)) {
      this.mesh.rotation.x += this.spinSpeed.x * dt;
      this.mesh.rotation.y += this.spinSpeed.y * dt;
      this.mesh.rotation.z += this.spinSpeed.z * dt;
    } else if (mode === 'TREE') {
      // Align randomly but structured
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, dt);
      this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, dt);
      this.mesh.rotation.y += 0.5 * dt;
    } else if (isTarget) {
      // Look at camera. 
      // Since the parent group might be rotating, 'lookAt' needs to be continuous
      // We'll handle orientation in a simple way: zero out rotation to face forward relative to camera if group wasn't rotating
      // But group IS rotating. So we make it look at the camera's local position in the group.
      const invMatrix = new THREE.Matrix4().copy(mainGroupMatrix).invert();
      const cameraLocal = new THREE.Vector3(0, 0, CONFIG.camera.z).applyMatrix4(invMatrix);
      this.mesh.lookAt(cameraLocal);
    }

    // Scale Logic
    let s = this.baseScale;
    if (this.isDust) {
      // Twinkle dust
      s = this.baseScale * (0.8 + 0.5 * Math.sin(time * 3 + this.id * 10));
      if (mode === 'TREE') s = 0; // Hide dust in tree mode for clean look
    } else if (mode === 'SCATTER' && this.type === 'PHOTO') {
      s = this.baseScale * 2.0; // Photos larger in scatter
    } else if (mode === 'FOCUS') {
      if (isTarget) s = 6.0; // Big zoom for focused photo
      else s = this.baseScale * 0.5; // Diminish others
    }

    this.mesh.scale.lerp(new THREE.Vector3(s, s, s), 3.0 * dt);
  }
}

interface Scene3DProps {
  onLoadComplete: () => void;
  newUploads: FileList | null;
}

export const Scene3D: React.FC<Scene3DProps> = ({ onLoadComplete, newUploads }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State refs
  const modeRef = useRef<AppMode>('TREE');
  const particlesRef = useRef<Particle[]>([]);
  const mainGroupRef = useRef<THREE.Group | null>(null);
  const photoGroupRef = useRef<THREE.Group | null>(null);
  const focusTargetRef = useRef<THREE.Object3D | null>(null);
  
  // Interaction refs
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0, y: 0 });
  const handRef = useRef({ detected: false, x: 0, y: 0 });
  
  useEffect(() => {
    if (newUploads && newUploads.length > 0) {
      handleUploads(newUploads);
    }
  }, [newUploads]);

  const handleUploads = (files: FileList) => {
    if (!photoGroupRef.current || !mainGroupRef.current) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          new THREE.TextureLoader().load(ev.target.result as string, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            addPhotoToScene(tex);
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const addPhotoToScene = (texture: THREE.Texture) => {
    if (!photoGroupRef.current || !mainGroupRef.current) return;

    const frameGeo = new THREE.BoxGeometry(1.4, 1.4, 0.05);
    const frameMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.champagneGold,
      metalness: 1.0,
      roughness: 0.15,
      envMapIntensity: 2.0
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);

    const photoGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const photoMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const photo = new THREE.Mesh(photoGeo, photoMat);
    photo.position.z = 0.04;

    const group = new THREE.Group();
    group.add(frame);
    group.add(photo);

    const s = 0.8;
    group.scale.set(s, s, s);

    photoGroupRef.current.add(group);
    
    // Create particle logic for it
    const p = new Particle(group, 'PHOTO', false);
    group.position.copy(p.posScatter);
    particlesRef.current.push(p);
  };

  // --- MEDIAPIPE LOGIC ---
  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let video: HTMLVideoElement | null = null;
    let animationFrameId = -1;
    let lastVideoTime = -1;

    const setupMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        
        video = document.getElementById('webcam-video') as HTMLVideoElement;
        
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
              width: 320,
              height: 240,
              frameRate: { ideal: 30 }
            } 
          });
          if (video) {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
          }
        }
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
      }
    };

    const predictWebcam = () => {
      if (video && handLandmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const startTimeMs = performance.now();
        const result = handLandmarker.detectForVideo(video, startTimeMs);
        processGestures(result);
      }
      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    const processGestures = (result: any) => {
      if (result.landmarks && result.landmarks.length > 0) {
        handRef.current.detected = true;
        const lm = result.landmarks[0];
        
        // Hand Center (approximate using wrist + middle finger knuckle)
        // Normalize coordinates to -1 to 1 range for rotation control
        // x is inverted because webcam is mirrored
        handRef.current.x = (1 - lm[9].x - 0.5) * 2; 
        handRef.current.y = (1 - lm[9].y - 0.5) * 2;

        const wrist = lm[0];
        const thumbTip = lm[4];
        const indexTip = lm[8];
        const middleTip = lm[12];
        const ringTip = lm[16];
        const pinkyTip = lm[20];

        // 1. PINCH DISTANCE (Thumb to Index)
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        
        // 2. OPENNESS (Average distance from wrist to finger tips)
        const tips = [indexTip, middleTip, ringTip, pinkyTip];
        let avgDistToWrist = 0;
        tips.forEach(t => {
            avgDistToWrist += Math.hypot(t.x - wrist.x, t.y - wrist.y);
        });
        avgDistToWrist /= 4;

        // Thresholds (tuned for typical webcam distance)
        // Fist: Tips are close to wrist. Typically < 0.25
        // Open: Tips are far. Typically > 0.4
        // Pinch: Thumb and Index touching. < 0.08
        
        const FIST_THRESHOLD = 0.25;
        const OPEN_THRESHOLD = 0.45;
        const PINCH_THRESHOLD = 0.08;

        // --- STATE MACHINE ---
        // Priority: Fist (Reset) > Grab (Focus) > Open (Scatter)
        
        if (avgDistToWrist < FIST_THRESHOLD) {
           // FIST DETECTED -> TREE (Closed)
           if (modeRef.current !== 'TREE') {
             modeRef.current = 'TREE';
             focusTargetRef.current = null;
           }
        } else if (pinchDist < PINCH_THRESHOLD) {
          // GRAB/PINCH DETECTED -> FOCUS
          if (modeRef.current !== 'FOCUS') {
            modeRef.current = 'FOCUS';
            // Select a random photo to focus on
            const photos = particlesRef.current.filter(p => p.type === 'PHOTO');
            if (photos.length > 0) {
              const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
              focusTargetRef.current = randomPhoto.mesh;
            }
          }
        } else if (avgDistToWrist > OPEN_THRESHOLD) {
           // OPEN HAND -> SCATTER
           // Transition to scatter if we are in Tree mode. 
           // If in Focus mode, we only go back to Scatter if explicitly opening hand (release pinch)
           if (modeRef.current !== 'SCATTER' && modeRef.current !== 'FOCUS') {
             modeRef.current = 'SCATTER';
             focusTargetRef.current = null;
           }
           // Also release focus if open hand is detected while in focus mode
           if (modeRef.current === 'FOCUS') {
              modeRef.current = 'SCATTER';
              focusTargetRef.current = null;
           }
        }

      } else {
        handRef.current.detected = false;
      }
    };

    setupMediaPipe();

    return () => {
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameId !== -1) cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- INIT THREE JS ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.015);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, CONFIG.camera.z);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // High-end Tone Mapping
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    containerRef.current.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const mainGroup = new THREE.Group();
    mainGroupRef.current = mainGroup;
    scene.add(mainGroup);

    // Dynamic Lights
    const innerLight = new THREE.PointLight(0xffaa00, 3, 25);
    innerLight.position.set(0, 5, 0);
    mainGroup.add(innerLight);

    const spotGold = new THREE.SpotLight(0xffcc66, 1500);
    spotGold.position.set(30, 40, 40);
    spotGold.angle = 0.5;
    spotGold.penumbra = 0.5;
    spotGold.castShadow = true;
    scene.add(spotGold);

    const fill = new THREE.DirectionalLight(0xffeebb, 0.5);
    fill.position.set(-20, 0, 50);
    scene.add(fill);

    // --- PARTICLES ---
    photoGroupRef.current = new THREE.Group();
    mainGroup.add(photoGroupRef.current);

    // Texture Generation
    const createCanvasTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#990000';
        ctx.beginPath();
        for (let i = -128; i < 256; i += 32) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 32, 128);
          ctx.lineTo(i + 16, 128);
          ctx.lineTo(i - 16, 0);
        }
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 3);
      return tex;
    };
    const caneTexture = createCanvasTexture();

    // Geometries
    const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const boxGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(0.1, 0.5, 0),
      new THREE.Vector3(0.3, 0.4, 0),
    ]);
    const candyGeo = new THREE.TubeGeometry(curve, 16, 0.08, 8, false);

    // Materials
    const goldMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.champagneGold,
      metalness: 1.0,
      roughness: 0.15,
      envMapIntensity: 2.5,
      emissive: 0x442200,
      emissiveIntensity: 0.2,
    });

    const greenMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.deepGreen,
      metalness: 0.0,
      roughness: 0.9,
    });

    const redMat = new THREE.MeshPhysicalMaterial({
      color: CONFIG.colors.accentRed,
      metalness: 0.1,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      emissive: 0x330000,
      emissiveIntensity: 0.1
    });

    const candyMat = new THREE.MeshStandardMaterial({ map: caneTexture, roughness: 0.4 });

    const generatedParticles: Particle[] = [];

    for (let i = 0; i < CONFIG.particles.count; i++) {
      const rand = Math.random();
      let mesh, type;
      if (rand < 0.4) {
        mesh = new THREE.Mesh(boxGeo, greenMat);
        type = 'BOX';
      } else if (rand < 0.7) {
        mesh = new THREE.Mesh(boxGeo, goldMat);
        type = 'GOLD_BOX';
      } else if (rand < 0.92) {
        mesh = new THREE.Mesh(sphereGeo, goldMat);
        type = 'GOLD_SPHERE';
      } else if (rand < 0.97) {
        mesh = new THREE.Mesh(sphereGeo, redMat);
        type = 'RED';
      } else {
        mesh = new THREE.Mesh(candyGeo, candyMat);
        type = 'CANE';
      }

      const s = 0.4 + Math.random() * 0.5;
      mesh.scale.set(s, s, s);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      mainGroup.add(mesh);
      generatedParticles.push(new Particle(mesh, type, false));
    }

    const dustGeo = new THREE.TetrahedronGeometry(0.08, 0);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.6 });
    for (let i = 0; i < CONFIG.particles.dustCount; i++) {
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      mesh.scale.setScalar(0.5 + Math.random());
      mainGroup.add(mesh);
      generatedParticles.push(new Particle(mesh, 'DUST', true));
    }

    // Default Photo
    const defaultCanvas = document.createElement('canvas');
    defaultCanvas.width = 512;
    defaultCanvas.height = 512;
    const ctx = defaultCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#eebb66';
      ctx.lineWidth = 15;
      ctx.strokeRect(20, 20, 472, 472);
      ctx.font = '500 60px Times New Roman';
      ctx.fillStyle = '#eebb66';
      ctx.textAlign = 'center';
      ctx.fillText('JOYEUX', 256, 230);
      ctx.fillText('NOEL', 256, 300);
    }
    const defaultTex = new THREE.CanvasTexture(defaultCanvas);
    defaultTex.colorSpace = THREE.SRGBColorSpace;
    
    const frameGeoFrame = new THREE.BoxGeometry(1.4, 1.4, 0.05);
    const frameMesh = new THREE.Mesh(frameGeoFrame, goldMat);
    const photoGeoP = new THREE.PlaneGeometry(1.2, 1.2);
    const photoMatP = new THREE.MeshBasicMaterial({ map: defaultTex });
    const photoMesh = new THREE.Mesh(photoGeoP, photoMatP);
    photoMesh.position.z = 0.04;
    const photoGrp = new THREE.Group();
    photoGrp.add(frameMesh);
    photoGrp.add(photoMesh);
    photoGrp.scale.set(0.8, 0.8, 0.8);
    photoGroupRef.current.add(photoGrp);
    generatedParticles.push(new Particle(photoGrp, 'PHOTO', false));

    // --- STAR CONSTRUCTION ---
    const createStarShape = (outerRadius: number, innerRadius: number, points: number) => {
        const shape = new THREE.Shape();
        const step = Math.PI / points;
        shape.moveTo(0, outerRadius);
        for(let i = 0; i < 2 * points; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const a = i * step;
            // Negative sin to correct orientation if needed, though mostly visual preference
            shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
        }
        shape.closePath();
        return shape;
    };

    const starShape = createStarShape(1.8, 0.9, 5);
    const starGeo = new THREE.ExtrudeGeometry(starShape, {
        depth: 0.4,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.1,
        bevelSegments: 2
    });
    starGeo.center(); // Center it so rotation is around the middle

    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffaa00,
      emissiveIntensity: 2.0, 
      metalness: 1.0,
      roughness: 0,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, CONFIG.particles.treeHeight / 2 + 1.2, 0);
    // Slight rotation to show off the 3D depth initially
    star.rotation.y = Math.PI / 4; 
    mainGroup.add(star);

    particlesRef.current = generatedParticles;

    // Post Processing
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    
    bloomPass.threshold = 0.5; 
    bloomPass.strength = 0.6;  
    bloomPass.radius = 0.8;    

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const clock = new THREE.Clock();

    const animate = () => {
      const dt = clock.getDelta();
      const time = clock.getElapsedTime();

      // --- ROTATION LOGIC ---
      let targetY = 0;
      let targetX = 0;

      if (handRef.current.detected && (modeRef.current === 'SCATTER' || modeRef.current === 'FOCUS')) {
        // Hand Gesture controls rotation in Scatter/Focus
        // Map hand X (-1 to 1) to rotation (-PI to PI) roughly
        targetY = handRef.current.x * Math.PI * 0.8; 
        targetX = handRef.current.y * Math.PI * 0.3; 
        
        // Use a heavier lerp for hand control to smooth out webcam jitter
        targetRotationRef.current.y += (targetY - targetRotationRef.current.y) * 4.0 * dt;
        mainGroup.rotation.y += (targetY - mainGroup.rotation.y) * 3.0 * dt;
        mainGroup.rotation.x += (targetX - mainGroup.rotation.x) * 3.0 * dt;

      } else {
        // Fallback to Mouse or Idle Animation
        targetY = mouseRef.current.x * Math.PI * 0.5; 
        targetX = mouseRef.current.y * Math.PI * 0.2;

        if (modeRef.current === 'TREE') {
          // Auto rotate the tree
          mainGroup.rotation.y += 0.2 * dt;
          mainGroup.rotation.x += (targetX - mainGroup.rotation.x) * 2.0 * dt;
        } else {
          // Gentle drift in scatter
          targetRotationRef.current.y += (targetY - targetRotationRef.current.y) * 2.0 * dt;
          mainGroup.rotation.y += (targetY - mainGroup.rotation.y) * 2.0 * dt;
          mainGroup.rotation.x += (targetX - mainGroup.rotation.x) * 2.0 * dt;
        }
      }

      // Rotate the star independently slightly for effect
      star.rotation.y += 0.5 * dt;

      particlesRef.current.forEach(p => p.update(dt, modeRef.current, time, focusTargetRef.current, mainGroup.matrixWorld));

      composer.render();
      requestAnimationFrame(animate);
    };

    const animId = requestAnimationFrame(animate);
    
    setTimeout(() => {
        onLoadComplete();
    }, 1500);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!handRef.current.detected) {
        mouseRef.current = {
          x: (e.clientX / window.innerWidth) * 2 - 1,
          y: -(e.clientY / window.innerHeight) * 2 + 1
        };
      }
    };

    const onClick = (e: MouseEvent) => {
        // Fallback click interaction
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth) * 2 - 1,
            -(e.clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);
        const photoParticles = particlesRef.current.filter(p => p.type === 'PHOTO');
        const photoMeshes = photoParticles.map(p => p.mesh);
        const intersects = raycaster.intersectObjects(photoMeshes, true);

        if (intersects.length > 0) {
            let targetGroup: THREE.Object3D | null = intersects[0].object;
            while(targetGroup && targetGroup.parent !== photoGroupRef.current) {
                targetGroup = targetGroup.parent;
            }
            if (targetGroup) {
                focusTargetRef.current = targetGroup;
                modeRef.current = 'FOCUS';
                return;
            }
        }
        // Cycle modes on click if no photo hit
        if (modeRef.current === 'FOCUS') {
            modeRef.current = 'SCATTER';
            focusTargetRef.current = null;
        } else if (modeRef.current === 'TREE') {
            modeRef.current = 'SCATTER';
        } else {
            modeRef.current = 'TREE';
        }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      pmremGenerator.dispose();
    };
  }, []); 

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};