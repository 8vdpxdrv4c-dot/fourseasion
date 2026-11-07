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
import { lerpPose, playFrame, standPose, type FigurePose, type PlayBeat } from './companionPlay';
import {
  COMPANION_LEFT as LEFT,
  COMPANION_RIGHT as RIGHT,
  companionJumpScale,
  createHandGate,
  pairWedge,
  stepHandHop,
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

function makeHeart(): Group {
  const heart = new Group();
  const mat = new MeshBasicMaterial({
    color: new Color('#f3a0b8'),
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const lobe = new Mesh(new SphereGeometry(0.045, 10, 8), mat);
  lobe.position.set(-0.028, 0.02, 0);
  const lobeR = lobe.clone();
  lobeR.position.x = 0.028;
  const tip = new Mesh(new SphereGeometry(0.04, 8, 6), mat);
  tip.scale.set(0.85, 1.15, 0.7);
  tip.position.set(0, -0.035, 0);
  heart.add(lobe, lobeR, tip);
  heart.visible = false;
  heart.renderOrder = 2;
  return heart;
}

export type CompanionHop = {
  angle: number;
  y: number;
  scaleY: number;
  jumping: boolean;
  jumps: number;
  leftY: number;
  rightY: number;
  leftX: number;
  leftZ: number;
  rightX: number;
  rightZ: number;
  beat: PlayBeat;
  heart: number;
  separation: number;
};

export type Characters = {
  group: Group;
  update: (sweep: number, time: number, motion: boolean, dt?: number, reduced?: boolean) => void;
  companion: () => CompanionHop;
};

type Arm = { mesh: Mesh; baseZ: number };

export function createCharacters(): Characters {
  const group = new Group();
  const shadow = blobShadow();
  shadow.position.set(0, WORLD.surfaceY + 0.01, (LEFT.z + RIGHT.z) * 0.5);
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
  const headLPivot = new Group();
  headLPivot.position.y = 0.74;
  const headL = new Mesh(new SphereGeometry(0.29, 24, 18), skin);
  headL.position.y = 0.04;
  headL.castShadow = true;
  headLPivot.add(headL);
  const hair = new Mesh(new SphereGeometry(0.3, 22, 14), hairMat);
  hair.scale.set(1.02, 0.62, 1.02);
  hair.position.y = 0.19;
  hair.castShadow = true;
  headLPivot.add(hair);
  const bangs = new Mesh(new SphereGeometry(0.2, 16, 10), hairMat);
  bangs.scale.set(1.15, 0.42, 0.55);
  bangs.position.set(0, 0.16, 0.16);
  headLPivot.add(bangs);
  const eyeL = eye(-0.1, 0.04, 0.25);
  const eyeR = eye(0.1, 0.04, 0.25);
  headLPivot.add(eyeL.white, eyeR.white);
  const mouthL = new Mesh(
    new TorusGeometry(0.045, 0.008, 6, 10, Math.PI),
    new MeshBasicMaterial({ color: new Color('#c47a74') }),
  );
  mouthL.rotation.x = Math.PI;
  mouthL.rotation.z = Math.PI;
  mouthL.position.set(0, -0.06, 0.27);
  headLPivot.add(mouthL);
  const scarf = new Mesh(new TorusGeometry(0.2, 0.045, 8, 16), scarfMat);
  scarf.rotation.x = Math.PI / 2.4;
  scarf.position.y = 0.56;
  left.add(scarf);
  const scarfTail = new Mesh(new CapsuleGeometry(0.035, 0.12, 3, 6), scarfMat);
  scarfTail.position.set(0.12, 0.42, 0.08);
  scarfTail.rotation.z = 0.5;
  left.add(scarfTail);
  const armLOut = addArm(left, -0.3, 0.4, 0.8, leftClothMat);
  const armLIn = addArm(left, 0.22, 0.36, -1.15, leftClothMat);
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
  straw.position.y = 0.31;
  headLPivot.add(straw);
  const snowL = new Mesh(new SphereGeometry(0.16, 12, 8), snowMat);
  snowL.scale.set(1.1, 0.42, 1);
  snowL.position.y = 0.31;
  headLPivot.add(snowL);
  left.add(headLPivot);
  group.add(left);

  const right = new Group();
  right.position.set(RIGHT.x, WORLD.surfaceY, RIGHT.z);
  const bodyR = new Mesh(new SphereGeometry(0.25, 22, 16), rightClothMat);
  bodyR.scale.set(1.05, 0.95, 0.9);
  bodyR.position.y = 0.34;
  bodyR.castShadow = true;
  right.add(bodyR);
  const headRPivot = new Group();
  headRPivot.position.set(0, 0.72, 0.02);
  const hood = new Mesh(new SphereGeometry(0.33, 22, 16), hoodMat);
  hood.position.y = 0.08;
  hood.castShadow = true;
  headRPivot.add(hood);
  const face = new Mesh(new SphereGeometry(0.24, 22, 16), skin);
  face.position.set(0, 0.04, 0.08);
  face.castShadow = true;
  headRPivot.add(face);
  const eyeSL = eye(-0.08, 0.06, 0.28);
  const eyeSR = eye(0.08, 0.06, 0.28);
  eyeSL.white.scale.set(0.72, 0.72, 0.6);
  eyeSR.white.scale.set(0.72, 0.72, 0.6);
  headRPivot.add(eyeSL.white, eyeSR.white);
  const blushL = new Mesh(new SphereGeometry(0.04, 8, 6), blushMat);
  blushL.scale.set(1.2, 0.7, 0.4);
  blushL.position.set(-0.12, -0.02, 0.28);
  const blushR = blushL.clone();
  blushR.position.x = 0.12;
  headRPivot.add(blushL, blushR);
  const mouthR = new Mesh(
    new TorusGeometry(0.035, 0.007, 6, 8, Math.PI),
    new MeshBasicMaterial({ color: new Color('#d48984') }),
  );
  mouthR.rotation.z = Math.PI;
  mouthR.position.set(0, -0.04, 0.3);
  headRPivot.add(mouthR);
  const snowR = new Mesh(new SphereGeometry(0.18, 12, 8), snowMat);
  snowR.scale.set(1.15, 0.38, 1.05);
  snowR.position.y = 0.3;
  headRPivot.add(snowR);
  const leaf = new Mesh(new SphereGeometry(0.07, 8, 6), leafMat);
  leaf.scale.set(1.3, 0.45, 0.7);
  leaf.position.set(0.22, 0.26, 0.03);
  leaf.rotation.z = 0.6;
  headRPivot.add(leaf);
  const petal = new Mesh(new SphereGeometry(0.055, 8, 6), petalMat);
  petal.scale.set(1.1, 0.45, 0.7);
  petal.position.set(-0.18, 0.26, 0.06);
  petal.rotation.z = -0.4;
  headRPivot.add(petal);
  right.add(headRPivot);
  const armROut = addArm(right, 0.28, 0.38, -0.85, rightClothMat);
  const armRIn = addArm(right, -0.2, 0.34, 1.2, rightClothMat);
  addFoot(right, -0.09, shoeMat);
  addFoot(right, 0.09, shoeMat);
  group.add(right);

  const clasp = new Mesh(new SphereGeometry(0.045, 10, 8), skin);
  clasp.position.set(0, WORLD.surfaceY + 0.42, 3.14);
  clasp.visible = false;
  group.add(clasp);

  const heart = makeHeart();
  group.add(heart);

  const eyes = [eyeL, eyeR, eyeSL, eyeSR];
  const gate = createHandGate();
  let pose = { y: 0, scaleY: 1 };
  let playBlend = 1;
  let beat: PlayBeat = 'rest';
  let heartAmount = 0;
  let separation = 0.8;
  const homeLeft = standPose(-1);
  const homeRight = standPose(1);

  function applyFigure(
    figure: Group,
    head: Group,
    inner: Arm,
    outer: Arm,
    figurePose: FigurePose,
    bob: number,
  ): void {
    figure.position.set(figurePose.x, WORLD.surfaceY + bob + figurePose.hop + pose.y, figurePose.z);
    figure.rotation.y = figurePose.rotY;
    figure.rotation.z = figurePose.lean;
    head.rotation.y = figurePose.headYaw;
    head.rotation.x = figurePose.headPitch;
    inner.mesh.rotation.z = inner.baseZ + figurePose.armIn;
    inner.mesh.rotation.x = figurePose.armIn * -0.2;
    outer.mesh.rotation.z = outer.baseZ + figurePose.armOut * 0.35;
    outer.mesh.rotation.x = figurePose.armOut * 0.25;
  }

  return {
    group,
    companion() {
      const wedge = pairWedge(
        { x: left.position.x, z: left.position.z },
        { x: right.position.x, z: right.position.z },
      );
      return {
        angle: wedge.start,
        y: pose.y,
        scaleY: pose.scaleY,
        jumping: gate.elapsed >= 0,
        jumps: gate.jumps,
        leftY: left.position.y,
        rightY: right.position.y,
        leftX: left.position.x,
        leftZ: left.position.z,
        rightX: right.position.x,
        rightZ: right.position.z,
        beat,
        heart: heartAmount,
        separation,
      };
    },
    update(sweep, time, motion, dt = 0, reduced = false) {
      const raw = playFrame(time, reduced);
      if (reduced) playBlend = 0;
      else if (gate.elapsed >= 0) playBlend = Math.max(0, playBlend - Math.min(dt, 0.05) / 0.18);
      else playBlend = Math.min(1, playBlend + Math.min(Math.max(dt, 0), 0.05) / 0.32);

      const shownLeft = reduced ? raw.left : lerpPose(homeLeft, raw.left, playBlend);
      const shownRight = reduced ? raw.right : lerpPose(homeRight, raw.right, playBlend);
      beat = reduced || gate.elapsed >= 0 ? 'rest' : raw.beat;
      heartAmount = reduced ? 0 : raw.heart * playBlend;
      separation = Math.hypot(shownLeft.x - shownRight.x, shownLeft.z - shownRight.z);

      const wedge = pairWedge(shownLeft, shownRight);
      pose = stepHandHop(gate, sweep, dt, reduced, wedge);
      const scale = companionJumpScale(pose.scaleY);
      left.scale.set(scale.x, scale.y, scale.z);
      right.scale.set(scale.x, scale.y, scale.z);

      mixSeason(leftClothMat.color, CLOTH_LEFT, shownLeft.x, shownLeft.z, sweep);
      mixSeason(scarfMat.color, SCARF, shownLeft.x, shownLeft.z, sweep);
      mixSeason(rightClothMat.color, CLOTH_RIGHT, shownRight.x, shownRight.z, sweep);
      mixSeason(hoodMat.color, HOOD, shownRight.x, shownRight.z, sweep);

      const summer = seasonWeight(seasonSample(shownLeft.x, shownLeft.z, sweep), 1);
      const winterL = seasonWeight(seasonSample(shownLeft.x, shownLeft.z, sweep), 3);
      const winterR = seasonWeight(seasonSample(shownRight.x, shownRight.z, sweep), 3);
      const autumn = seasonWeight(seasonSample(shownRight.x, shownRight.z, sweep), 2);
      const spring = seasonWeight(seasonSample(shownRight.x, shownRight.z, sweep), 0);
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

      const bob = motion && playBlend < 0.35 ? Math.sin(time * 1.55) * 0.015 : 0;
      const bobRight = motion && playBlend < 0.35 ? Math.sin(time * 1.55 + 0.45) * 0.015 : 0;
      applyFigure(left, headLPivot, armLIn, armLOut, shownLeft, bob);
      applyFigure(right, headRPivot, armRIn, armROut, shownRight, bobRight);

      const midX = (shownLeft.x + shownRight.x) * 0.5;
      const midZ = (shownLeft.z + shownRight.z) * 0.5;
      const lift = Math.max(0, pose.y);
      const shade = 1 / (1 + lift * 1.6);
      shadow.position.set(midX, WORLD.surfaceY + 0.01, midZ);
      shadow.scale.set(1.35 * shade, 0.02, 0.78 * shade);

      const hugging = raw.beat === 'hug' && playBlend > 0.55 && pose.y < 0.08;
      clasp.visible = hugging;
      clasp.position.set(midX, WORLD.surfaceY + 0.42 + pose.y, midZ + 0.08);

      heart.visible = heartAmount > 0.08;
      heart.position.set(midX, WORLD.surfaceY + 1.28 + pose.y + (shownLeft.hop + shownRight.hop) * 0.5, midZ + 0.02);
      heart.scale.setScalar(heartAmount * 2.4);
      const heartMat = heart.children[0] as Mesh | undefined;
      if (heartMat && !Array.isArray(heartMat.material)) {
        heartMat.material.opacity = 0.35 + heartAmount * 0.55;
      }

      const blink = motion && !reduced && time % 4.2 < 0.12;
      for (const item of eyes) {
        item.white.scale.y = blink ? 0.12 : item === eyeSL || item === eyeSR ? 0.72 : 1.05;
      }
      const look = motion && !reduced ? Math.sin(time * 0.45) * 0.008 : 0;
      for (const item of eyes) item.pupil.position.x = look;
    },
  };
}

function addArm(parent: Group, x: number, y: number, rotZ: number, material: MeshStandardMaterial): Arm {
  const mesh = new Mesh(new CapsuleGeometry(0.055, 0.2, 3, 6), material);
  mesh.position.set(x, y, 0.04);
  mesh.rotation.z = rotZ;
  mesh.castShadow = true;
  parent.add(mesh);
  return { mesh, baseZ: rotZ };
}

function addFoot(parent: Group, x: number, material: MeshStandardMaterial): void {
  const foot = new Mesh(new SphereGeometry(0.07, 10, 8), material);
  foot.scale.set(0.85, 0.55, 1.15);
  foot.position.set(x, 0.05, 0.04);
  foot.castShadow = true;
  parent.add(foot);
}
