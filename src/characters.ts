import {
  CanvasTexture,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import {
  COMPANION_LEFT as LEFT,
  COMPANION_RIGHT as RIGHT,
  companionJumpScale,
  companionTriggerAngle,
  createJumpState,
  stepCompanionJump,
} from './companionJump';
import { seasonSample, seasonWeight, WORLD } from './season';

const CLOTH_LEFT = [
  new Color('#7eadd4'),
  new Color('#5d92c4'),
  new Color('#d08948'),
  new Color('#e7eef6'),
];
const SCARF = [
  new Color('#f6b9d4'),
  new Color('#8fbf6a'),
  new Color('#bd742f'),
  new Color('#c4473a'),
];
const CLOTH_RIGHT = [
  new Color('#fff6e8'),
  new Color('#ffe9a8'),
  new Color('#f0c48a'),
  new Color('#e7f0f8'),
];
const HOOD = [
  new Color('#f0cc62'),
  new Color('#f2d56b'),
  new Color('#e8b84a'),
  new Color('#f6e7b0'),
];

function mixSeason(out: Color, colors: Color[], x: number, z: number, sweep: number): void {
  const sample = seasonSample(x, z, sweep);
  out.copy(colors[sample.iOld] ?? colors[0]!).lerp(colors[sample.iNew] ?? colors[0]!, sample.wNew);
}

function blobShadow(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法绘制接触阴影');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  const mesh = new Mesh(
    new SphereGeometry(1, 16, 8),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.scale.set(0.95, 0.02, 0.62);
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
}

type Eye = { white: Mesh; pupil: Mesh };

function eye(x: number, y: number, z: number): Eye {
  const white = new Mesh(
    new SphereGeometry(0.058, 12, 10),
    new MeshBasicMaterial({ color: new Color('#f7fbff') }),
  );
  white.scale.set(1, 1.05, 0.72);
  white.position.set(x, y, z);
  const pupil = new Mesh(
    new SphereGeometry(0.03, 10, 8),
    new MeshBasicMaterial({ color: new Color('#241c1a') }),
  );
  pupil.position.set(0, 0, 0.04);
  white.add(pupil);
  const shine = new Mesh(
    new SphereGeometry(0.012, 6, 6),
    new MeshBasicMaterial({ color: new Color('#ffffff') }),
  );
  shine.position.set(-0.012, 0.014, 0.02);
  pupil.add(shine);
  return { white, pupil };
}

export type CompanionHop = {
  angle: number;
  y: number;
  scaleY: number;
  jumping: boolean;
  jumps: number;
  leftY: number;
  rightY: number;
};

export type Characters = {
  group: Group;
  update: (sweep: number, time: number, motion: boolean, dt?: number, reduced?: boolean) => void;
  companion: () => CompanionHop;
};

export function createCharacters(): Characters {
  const group = new Group();
  const shadow = blobShadow();
  shadow.position.set(0, WORLD.surfaceY + 0.01, 1.2);
  shadow.scale.set(1.15, 0.02, 0.72);
  group.add(shadow);

  const skin = new MeshStandardMaterial({ color: new Color('#ffe0c2'), roughness: 0.72 });
  const hairMat = new MeshStandardMaterial({ color: new Color('#241f1e'), roughness: 0.6 });
  const leftClothMat = new MeshStandardMaterial({ color: CLOTH_LEFT[0], roughness: 0.74 });
  const scarfMat = new MeshStandardMaterial({ color: SCARF[0], roughness: 0.62 });
  const rightClothMat = new MeshStandardMaterial({ color: CLOTH_RIGHT[0], roughness: 0.7 });
  const hoodMat = new MeshStandardMaterial({ color: HOOD[0], roughness: 0.62 });
  const blushMat = new MeshBasicMaterial({ color: new Color('#f3a3b4') });
  const shoeMat = new MeshStandardMaterial({ color: new Color('#2c3140'), roughness: 0.5 });
  const strawMat = new MeshStandardMaterial({ color: new Color('#e6c878'), roughness: 0.78 });
  const snowMat = new MeshStandardMaterial({ color: new Color('#f7fbff'), roughness: 0.4 });
  const leafMat = new MeshStandardMaterial({ color: new Color('#bd742f'), roughness: 0.6 });
  const petalMat = new MeshStandardMaterial({ color: new Color('#f6b9d4'), roughness: 0.45 });

  const left = new Group();
  left.position.set(LEFT.x, WORLD.surfaceY, LEFT.z);
  const bodyL = new Mesh(new SphereGeometry(0.26, 22, 16), leftClothMat);
  bodyL.scale.set(1, 0.92, 0.86);
  bodyL.position.y = 0.36;
  bodyL.castShadow = true;
  left.add(bodyL);
  const headL = new Mesh(new SphereGeometry(0.29, 24, 18), skin);
  headL.position.y = 0.78;
  headL.castShadow = true;
  left.add(headL);
  const hair = new Mesh(new SphereGeometry(0.3, 22, 14), hairMat);
  hair.scale.set(1.02, 0.62, 1.02);
  hair.position.y = 0.93;
  hair.castShadow = true;
  left.add(hair);
  const bangs = new Mesh(new SphereGeometry(0.2, 16, 10), hairMat);
  bangs.scale.set(1.15, 0.42, 0.55);
  bangs.position.set(0, 0.9, 0.16);
  left.add(bangs);
  const eyeL = eye(-0.1, 0.78, 0.25);
  const eyeR = eye(0.1, 0.78, 0.25);
  left.add(eyeL.white, eyeR.white);
  const mouthL = new Mesh(
    new TorusGeometry(0.045, 0.008, 6, 10, Math.PI),
    new MeshBasicMaterial({ color: new Color('#c47a74') }),
  );
  mouthL.rotation.x = Math.PI;
  mouthL.rotation.z = Math.PI;
  mouthL.position.set(0, 0.68, 0.27);
  left.add(mouthL);
  const scarf = new Mesh(new TorusGeometry(0.2, 0.045, 8, 16), scarfMat);
  scarf.rotation.x = Math.PI / 2.4;
  scarf.position.y = 0.56;
  left.add(scarf);
  const scarfTail = new Mesh(new CapsuleGeometry(0.035, 0.12, 3, 6), scarfMat);
  scarfTail.position.set(0.12, 0.42, 0.08);
  scarfTail.rotation.z = 0.5;
  left.add(scarfTail);
  addArm(left, -0.3, 0.4, 0.8, leftClothMat);
  addArm(left, 0.22, 0.36, -1.15, leftClothMat);
  addFoot(left, -0.1, shoeMat);
  addFoot(left, 0.1, shoeMat);
  const straw = new Group();
  const brim = new Mesh(new TorusGeometry(0.34, 0.035, 6, 16), strawMat);
  brim.rotation.x = Math.PI / 2;
  straw.add(brim);
  const crown = new Mesh(new SphereGeometry(0.2, 12, 8), strawMat);
  crown.scale.set(1, 0.45, 1);
  crown.position.y = 0.08;
  straw.add(crown);
  straw.position.y = 1.05;
  left.add(straw);
  const snowL = new Mesh(new SphereGeometry(0.16, 12, 8), snowMat);
  snowL.scale.set(1.1, 0.42, 1);
  snowL.position.y = 1.05;
  left.add(snowL);
  group.add(left);

  const right = new Group();
  right.position.set(RIGHT.x, WORLD.surfaceY, RIGHT.z);
  const bodyR = new Mesh(new SphereGeometry(0.25, 22, 16), rightClothMat);
  bodyR.scale.set(1.05, 0.95, 0.9);
  bodyR.position.y = 0.34;
  bodyR.castShadow = true;
  right.add(bodyR);
  const hood = new Mesh(new SphereGeometry(0.33, 22, 16), hoodMat);
  hood.position.y = 0.8;
  hood.castShadow = true;
  right.add(hood);
  const face = new Mesh(new SphereGeometry(0.24, 22, 16), skin);
  face.position.set(0, 0.76, 0.1);
  face.castShadow = true;
  right.add(face);
  const eyeSL = eye(-0.08, 0.78, 0.3);
  const eyeSR = eye(0.08, 0.78, 0.3);
  eyeSL.white.scale.set(0.72, 0.72, 0.6);
  eyeSR.white.scale.set(0.72, 0.72, 0.6);
  right.add(eyeSL.white, eyeSR.white);
  const blushL = new Mesh(new SphereGeometry(0.04, 8, 6), blushMat);
  blushL.scale.set(1.2, 0.7, 0.4);
  blushL.position.set(-0.12, 0.7, 0.3);
  const blushR = blushL.clone();
  blushR.position.x = 0.12;
  right.add(blushL, blushR);
  const mouthR = new Mesh(
    new TorusGeometry(0.035, 0.007, 6, 8, Math.PI),
    new MeshBasicMaterial({ color: new Color('#d48984') }),
  );
  mouthR.rotation.z = Math.PI;
  mouthR.position.set(0, 0.68, 0.32);
  right.add(mouthR);
  addArm(right, 0.28, 0.38, -0.85, rightClothMat);
  addArm(right, -0.2, 0.34, 1.2, rightClothMat);
  addFoot(right, -0.09, shoeMat);
  addFoot(right, 0.09, shoeMat);
  const snowR = new Mesh(new SphereGeometry(0.18, 12, 8), snowMat);
  snowR.scale.set(1.15, 0.38, 1.05);
  snowR.position.y = 1.02;
  right.add(snowR);
  const leaf = new Mesh(new SphereGeometry(0.07, 8, 6), leafMat);
  leaf.scale.set(1.3, 0.45, 0.7);
  leaf.position.set(0.22, 0.98, 0.05);
  leaf.rotation.z = 0.6;
  right.add(leaf);
  const petal = new Mesh(new SphereGeometry(0.055, 8, 6), petalMat);
  petal.scale.set(1.1, 0.45, 0.7);
  petal.position.set(-0.18, 0.98, 0.08);
  petal.rotation.z = -0.4;
  right.add(petal);
  group.add(right);

  const clasp = new Mesh(new SphereGeometry(0.055, 10, 8), skin);
  clasp.position.set(0.0, WORLD.surfaceY + 0.4, 1.28);
  group.add(clasp);

  const eyes = [eyeL, eyeR, eyeSL, eyeSR];
  const jump = createJumpState();
  const trigger = companionTriggerAngle();
  let pose = { y: 0, scaleY: 1 };

  return {
    group,
    companion() {
      return {
        angle: trigger,
        y: pose.y,
        scaleY: pose.scaleY,
        jumping: jump.elapsed >= 0,
        jumps: jump.jumps,
        leftY: left.position.y,
        rightY: right.position.y,
      };
    },
    update(sweep, time, motion, dt = 0, reduced = false) {
      mixSeason(leftClothMat.color, CLOTH_LEFT, LEFT.x, LEFT.z, sweep);
      mixSeason(scarfMat.color, SCARF, LEFT.x, LEFT.z, sweep);
      mixSeason(rightClothMat.color, CLOTH_RIGHT, RIGHT.x, RIGHT.z, sweep);
      mixSeason(hoodMat.color, HOOD, RIGHT.x, RIGHT.z, sweep);

      const summer = seasonWeight(seasonSample(LEFT.x, LEFT.z, sweep), 1);
      const winterL = seasonWeight(seasonSample(LEFT.x, LEFT.z, sweep), 3);
      const winterR = seasonWeight(seasonSample(RIGHT.x, RIGHT.z, sweep), 3);
      const autumn = seasonWeight(seasonSample(RIGHT.x, RIGHT.z, sweep), 2);
      const spring = seasonWeight(seasonSample(RIGHT.x, RIGHT.z, sweep), 0);
      straw.visible = summer > 0.12;
      straw.scale.setScalar(0.35 + 0.65 * summer);
      snowL.visible = winterL > 0.12;
      snowL.scale.setScalar(0.3 + 0.7 * winterL);
      snowR.visible = winterR > 0.12;
      snowR.scale.setScalar(0.3 + 0.7 * winterR);
      leaf.visible = autumn > 0.12;
      leaf.scale.set(1.3, 0.45, 0.7).multiplyScalar(0.35 + 0.65 * autumn);
      petal.visible = spring > 0.12;
      petal.scale.set(1.1, 0.45, 0.7).multiplyScalar(0.35 + 0.65 * spring);

      pose = stepCompanionJump(jump, sweep, dt, reduced, trigger);
      const scale = companionJumpScale(pose.scaleY);
      left.scale.set(scale.x, scale.y, scale.z);
      right.scale.set(scale.x, scale.y, scale.z);
      const bob = motion ? Math.sin(time * 1.55) * 0.02 : 0;
      const bobRight = motion ? Math.sin(time * 1.55 + 0.45) * 0.02 : 0;
      left.position.y = WORLD.surfaceY + bob + pose.y;
      right.position.y = WORLD.surfaceY + bobRight + pose.y;
      clasp.position.y = WORLD.surfaceY + 0.4 + pose.y + 0.4 * (pose.scaleY - 1);
      const lift = Math.max(0, pose.y);
      const shade = 1 / (1 + lift * 1.6);
      shadow.scale.set(1.15 * shade, 0.02, 0.72 * shade);
      left.rotation.y = 0.28 + (motion ? Math.sin(time * 0.6) * 0.04 : 0);
      right.rotation.y = -0.32 - (motion ? Math.sin(time * 0.6) * 0.04 : 0);

      const blink = motion && time % 4.2 < 0.12;
      for (const item of eyes) {
        item.white.scale.y = blink ? 0.12 : item === eyeSL || item === eyeSR ? 0.72 : 1.05;
      }

      const look = motion ? Math.sin(time * 0.45) * 0.01 : 0;
      for (const item of eyes) item.pupil.position.x = look;
    },
  };
}

function addArm(parent: Group, x: number, y: number, rotZ: number, material: MeshStandardMaterial): void {
  const arm = new Mesh(new CapsuleGeometry(0.055, 0.2, 3, 6), material);
  arm.position.set(x, y, 0.04);
  arm.rotation.z = rotZ;
  arm.castShadow = true;
  parent.add(arm);
}

function addFoot(parent: Group, x: number, material: MeshStandardMaterial): void {
  const foot = new Mesh(new SphereGeometry(0.07, 10, 8), material);
  foot.scale.set(0.85, 0.55, 1.15);
  foot.position.set(x, 0.05, 0.04);
  foot.castShadow = true;
  parent.add(foot);
}
