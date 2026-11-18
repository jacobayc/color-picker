/**
 * 3D Rig Showcase - Drive Test Arena (Asphalt / Offroad + PC & Mobile A/B Controls)
 * CustomVehicleRig 규약(+Z 전방, y=0 지면, wheels, frontSteerPivots, headlightMat, taillightMat) 연동
 */
(function (global) {
  'use strict';

  function parseVehicleSpec(rawCode) {
    const code = rawCode || '';
    const spec = {
      name: '커스텀 차량',
      emoji: '🚗',
      cruiseKmh: 80,
      boostKmh: 155,
      soundType: 'car',
    };

    const nameMatch = code.match(/이름\/이모지\s*:\s*([^\r\n]+)/);
    if (nameMatch && nameMatch[1].trim()) {
      const parts = nameMatch[1].split('/').map((s) => s.trim()).filter(Boolean);
      if (parts[0]) spec.name = parts[0];
      if (parts[1]) spec.emoji = parts[1];
    }

    const speedMatch = code.match(/속도[^\r\n:]*:\s*(\d+)\s*\/\s*(\d+)/);
    if (speedMatch) {
      const c = Number(speedMatch[1]);
      const b = Number(speedMatch[2]);
      if (c > 0 && b >= c) {
        spec.cruiseKmh = c;
        spec.boostKmh = b;
      }
    }

    const soundMatch = code.match(/사운드\s*:\s*([^\r\n]+)/);
    if (soundMatch) {
      const raw = soundMatch[1].toLowerCase();
      if (raw.includes('ev') || raw.includes('전기')) spec.soundType = 'ev';
      else if (raw.includes('sport') || raw.includes('스포츠')) spec.soundType = 'sport';
      else spec.soundType = 'car';
    }

    return spec;
  }

  // ===========================================================================
  // Web Audio API 합성 엔진 (EV / Sport / Car + 경적)
  // ===========================================================================
  class DriveAudioSynth {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.running = false;
      this.soundType = 'car';
      this.osc1 = null;
      this.osc2 = null;
      this.filter = null;
      this.engineGain = null;
      this.hornOsc1 = null;
      this.hornOsc2 = null;
      this.hornGain = null;
    }

    init(soundType) {
      this.soundType = soundType || 'car';
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      this.stopEngine();

      const ctx = this.ctx;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.0;

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 320;

      this.osc1 = ctx.createOscillator();
      this.osc2 = ctx.createOscillator();

      if (this.soundType === 'ev') {
        this.osc1.type = 'sine';
        this.osc2.type = 'triangle';
        this.osc1.frequency.value = 170;
        this.osc2.frequency.value = 340;
        this.filter.frequency.value = 1800;
      } else if (this.soundType === 'sport') {
        this.osc1.type = 'sawtooth';
        this.osc2.type = 'square';
        this.osc1.frequency.value = 72;
        this.osc2.frequency.value = 36;
        this.filter.frequency.value = 260;
      } else {
        this.osc1.type = 'triangle';
        this.osc2.type = 'sawtooth';
        this.osc1.frequency.value = 60;
        this.osc2.frequency.value = 120;
        this.filter.frequency.value = 220;
      }

      const g2 = ctx.createGain();
      g2.gain.value = this.soundType === 'ev' ? 0.35 : 0.45;

      this.osc1.connect(this.filter);
      this.osc2.connect(g2);
      g2.connect(this.filter);
      this.filter.connect(this.engineGain);
      this.engineGain.connect(ctx.destination);

      this.osc1.start();
      this.osc2.start();
      this.running = true;
    }

    update(speedRatio, isBoosting) {
      if (!this.running || !this.ctx || !this.engineGain) return;
      if (this.muted) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        return;
      }

      const t = this.ctx.currentTime;
      const r = Math.min(1.3, Math.max(0, speedRatio));

      if (this.soundType === 'ev') {
        const base = 165 + r * 680 + (isBoosting ? 90 : 0);
        this.osc1.frequency.setTargetAtTime(base, t, 0.06);
        this.osc2.frequency.setTargetAtTime(base * 2.01, t, 0.06);
        const vol = 0.015 + Math.min(0.055, r * 0.05);
        this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
      } else if (this.soundType === 'sport') {
        const base = 70 + r * 195 + (isBoosting ? 35 : 0);
        this.osc1.frequency.setTargetAtTime(base, t, 0.05);
        this.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
        this.filter.frequency.setTargetAtTime(240 + r * 720, t, 0.06);
        const vol = 0.02 + Math.min(0.065, r * 0.055);
        this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
      } else {
        const base = 58 + r * 130 + (isBoosting ? 24 : 0);
        this.osc1.frequency.setTargetAtTime(base, t, 0.06);
        this.osc2.frequency.setTargetAtTime(base * 2, t, 0.06);
        this.filter.frequency.setTargetAtTime(200 + r * 420, t, 0.06);
        const vol = 0.016 + Math.min(0.05, r * 0.045);
        this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
      }
    }

    setHorn(active) {
      if (!this.ctx || this.muted) {
        if (!active) this.stopHorn();
        return;
      }
      if (active && !this.hornGain) {
        const ctx = this.ctx;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        this.hornGain = ctx.createGain();
        this.hornGain.gain.value = 0.08;
        this.hornOsc1 = ctx.createOscillator();
        this.hornOsc2 = ctx.createOscillator();
        this.hornOsc1.type = 'sawtooth';
        this.hornOsc2.type = 'sawtooth';
        this.hornOsc1.frequency.value = this.soundType === 'ev' ? 440 : 392;
        this.hornOsc2.frequency.value = this.soundType === 'ev' ? 554.37 : 493.88;

        const hornFilter = ctx.createBiquadFilter();
        hornFilter.type = 'lowpass';
        hornFilter.frequency.value = 1400;

        this.hornOsc1.connect(hornFilter);
        this.hornOsc2.connect(hornFilter);
        hornFilter.connect(this.hornGain);
        this.hornGain.connect(ctx.destination);
        this.hornOsc1.start();
        this.hornOsc2.start();
      } else if (!active && this.hornGain) {
        this.stopHorn();
      }
    }

    stopHorn() {
      try {
        if (this.hornOsc1) this.hornOsc1.stop();
        if (this.hornOsc2) this.hornOsc2.stop();
      } catch (e) {}
      this.hornOsc1 = null;
      this.hornOsc2 = null;
      this.hornGain = null;
    }

    stopEngine() {
      this.stopHorn();
      try {
        if (this.osc1) this.osc1.stop();
        if (this.osc2) this.osc2.stop();
      } catch (e) {}
      this.osc1 = null;
      this.osc2 = null;
      this.engineGain = null;
      this.running = false;
    }

    setMuted(muted) {
      this.muted = muted;
      if (muted) this.stopHorn();
    }
  }

  // ===========================================================================
  // 테스트 세트장 (아스팔트 트랙 / 오프로드 코스) 생성 및 지면 높이 계산
  // ===========================================================================
  function createDriveArenaScene(THREE, trackType, isNight) {
    const driveScene = new THREE.Scene();
    const skyColor = isNight ? 0x070a12 : (trackType === 'offroad' ? 0x1e2620 : 0x18202c);
    driveScene.background = new THREE.Color(skyColor);
    driveScene.fog = new THREE.FogExp2(skyColor, isNight ? 0.0095 : 0.0045);

    const hemi = new THREE.HemisphereLight(
      isNight ? 0x3b4d7a : 0xe0f2fe,
      trackType === 'offroad' ? 0x3f2e21 : 0x1e293b,
      isNight ? 0.35 : 0.9
    );
    driveScene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, isNight ? 0.45 : 1.35);
    sun.position.set(28, 45, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 140;
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55;
    sun.shadow.camera.bottom = -55;
    sun.shadow.bias = -0.0006;
    driveScene.add(sun);

    const ARENA_HALF = 110;
    const cones = [];
    const ramps = [];
    const bumps = [];

    // 1. 바닥 지면
    const groundMat = new THREE.MeshStandardMaterial({
      color: trackType === 'offroad' ? 0x4b3d2d : 0x222731,
      roughness: trackType === 'offroad' ? 0.96 : 0.82,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    driveScene.add(ground);

    if (trackType === 'asphalt') {
      // 아스팔트 중앙 직선 도로 & 슬라럼 + 차선 마커
      const roadStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 220),
        new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.78 })
      );
      roadStrip.rotation.x = -Math.PI / 2;
      roadStrip.position.y = 0.006;
      roadStrip.receiveShadow = true;
      driveScene.add(roadStrip);

      const lineMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
      for (let z = -100; z <= 100; z += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 3.8), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.012, z);
        driveScene.add(dash);
      }
      for (const ex of [-8.7, 8.7]) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 220), edgeMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(ex, 0.012, 0);
        driveScene.add(edge);
      }

      // 슬라럼 콘 (좌우 지그재그 구간 + 외곽 코너)
      const coneCoords = [
        [0, 18], [0, 30], [0, 42], [0, 54], [0, 66],
        [-22, -15], [-26, 0], [-22, 15],
        [22, -15], [26, 0], [22, 15],
      ];
      coneCoords.forEach(([cx, cz]) => addCone(cx, cz));
    } else {
      // 오프로드: 모래 트랙 + 잔디 지대 + 경사로 램프 2개 + 요철 범프 4줄
      const grassPatchMat = new THREE.MeshStandardMaterial({ color: 0x2d4229, roughness: 0.95 });
      for (const gx of [-32, 32]) {
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(46, 210), grassPatchMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(gx, 0.005, 0);
        patch.receiveShadow = true;
        driveScene.add(patch);
      }

      // 오프로드 램프 2개 (정면 z=32, 반대편 z=-42)
      addRamp(0, 32, 7.5, 10, 1.35, 1);
      addRamp(-18, -40, 7.5, 10, 1.35, -1);

      // 요철(범프) 스트립 4개
      const bumpZList = [62, 66, 70, 74];
      bumpZList.forEach((bz) => addBump(16, bz, 8, 1.4, 0.24));

      // 오프로드 콘/바위 마커
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.95, flatShading: true });
      const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
      [[-14, 16], [14, 24], [-15, 50], [28, -22], [-28, 36]].forEach(([rx, rz]) => {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(rx, 0.65, rz);
        rock.scale.set(1.2, 0.7, 1.1);
        rock.castShadow = true;
        rock.receiveShadow = true;
        driveScene.add(rock);
      });
      [[4, 20], [-4, 48], [16, 56]].forEach(([cx, cz]) => addCone(cx, cz));
    }

    // 공통 그리드 & 출발선 & 외곽 경계 가드레일
    const grid = new THREE.GridHelper(220, 44, 0x38bdf8, 0x2a3140);
    grid.position.y = 0.015;
    if (grid.material) {
      grid.material.opacity = 0.22;
      grid.material.transparent = true;
    }
    driveScene.add(grid);

    const startPad = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.1, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
    );
    startPad.rotation.x = -Math.PI / 2;
    startPad.position.set(0, 0.02, 0);
    driveScene.add(startPad);

    // 외곽 경계 포스트
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
    const postGeo = new THREE.BoxGeometry(0.4, 1.1, 0.4);
    for (let d = -ARENA_HALF; d <= ARENA_HALF; d += 22) {
      for (const [px, pz] of [
        [d, -ARENA_HALF], [d, ARENA_HALF], [-ARENA_HALF, d], [ARENA_HALF, d],
      ]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, 0.55, pz);
        driveScene.add(post);
      }
    }

    function addCone(x, z) {
      const coneGroup = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.05, 0.42),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 })
      );
      base.position.y = 0.025;
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.68, 12),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 })
      );
      body.position.y = 0.36;
      body.castShadow = true;
      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.115, 0.14, 12),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x334155 })
      );
      stripe.position.y = 0.40;
      coneGroup.add(base, body, stripe);
      coneGroup.position.set(x, 0, z);
      driveScene.add(coneGroup);
      cones.push({ mesh: coneGroup, x, z, tipped: false, tipAngle: 0, tipDirX: 0, tipDirZ: 0 });
    }

    function addRamp(x, z, w, len, height, dirZ) {
      const shape = new THREE.Shape();
      shape.moveTo(-len / 2, 0);
      shape.lineTo(len / 2, height);
      shape.lineTo(len / 2, 0);
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
      geo.translate(0, 0, -w / 2);
      geo.rotateY(dirZ > 0 ? -Math.PI / 2 : Math.PI / 2);

      const mat = new THREE.MeshStandardMaterial({
        color: 0x6b533b,
        roughness: 0.9,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      driveScene.add(mesh);
      ramps.push({ x, z, w, len, height, dirZ });
    }

    function addBump(x, z, w, len, height) {
      const geo = new THREE.CylinderGeometry(height, height, w, 12);
      geo.rotateZ(Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0x785d41, roughness: 0.92 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0, z);
      mesh.scale.set(1, 0.65, len / (height * 2));
      mesh.receiveShadow = true;
      driveScene.add(mesh);
      bumps.push({ x, z, w, len, height: height * 0.65 });
    }

    function getGroundHeight(x, z) {
      let h = 0;
      for (const r of ramps) {
        if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.len / 2) {
          const localZ = (z - r.z) * r.dirZ;
          const t = (localZ + r.len / 2) / r.len; // 0(진입) -> 1(끝)
          h = Math.max(h, Math.max(0, Math.min(1, t)) * r.height);
        }
      }
      for (const b of bumps) {
        if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.len / 2) {
          const d = Math.abs(z - b.z) / (b.len / 2);
          h = Math.max(h, Math.cos(d * Math.PI * 0.5) * b.height);
        }
      }
      return h;
    }

    function getSurfaceRoughness(x, z) {
      if (trackType === 'asphalt') return 0;
      // 양쪽 잔디 구역(±9~55)은 약간 더 거친 오프로드 저항
      return Math.abs(x) > 10 ? 1.0 : 0.45;
    }

    function dispose() {
      driveScene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
    }

    return {
      scene: driveScene,
      sun,
      hemi,
      cones,
      arenaHalf: ARENA_HALF,
      getGroundHeight,
      getSurfaceRoughness,
      dispose,
    };
  }

  // ===========================================================================
  // 통합 주행 컨트롤러 (물리 + 카메라 + 키보드 + 모바일 A/B 가상패드)
  // ===========================================================================
  class DriveSession {
    constructor(opts) {
      this.THREE = opts.THREE;
      this.rig = opts.rig;
      this.spec = opts.spec;
      this.trackType = opts.trackType;
      this.mobileMode = opts.mobileMode; // 'A' | 'B'
      this.isNight = opts.isNight;
      this.showTouchPad = opts.showTouchPad;
      this.onExit = opts.onExit;

      this.arena = createDriveArenaScene(this.THREE, this.trackType, this.isNight);
      this.camera = new this.THREE.PerspectiveCamera(58, opts.aspect || 1.6, 0.1, 400);
      this.audio = new DriveAudioSynth();
      this.audio.init(this.spec.soundType);

      // 차량 물리 상태
      this.carRoot = new this.THREE.Group();
      this.carTilt = new this.THREE.Group();
      this.carTilt.add(this.rig.group);
      this.carRoot.add(this.carTilt);
      this.arena.scene.add(this.carRoot);

      // 야간 헤드라이트 실제 스팟 조명 (앞쪽을 비춤)
      this.headSpot = new this.THREE.SpotLight(0xeef7ff, this.isNight ? 2.8 : 0, 42, Math.PI / 5, 0.45, 1.2);
      this.headSpot.position.set(0, 0.9, 2.1);
      this.headTarget = new this.THREE.Object3D();
      this.headTarget.position.set(0, 0.2, 16);
      this.carRoot.add(this.headSpot, this.headTarget);
      this.headSpot.target = this.headTarget;

      // 바퀴 반지름 추정 (Box3 기준, 기본 0.38m)
      this.wheelRadius = 0.38;
      if (this.rig.wheels && this.rig.wheels.length > 0) {
        const wb = new this.THREE.Box3().setFromObject(this.rig.wheels[0]);
        const ws = new this.THREE.Vector3();
        wb.getSize(ws);
        if (ws.y > 0.15 && ws.y < 1.5) this.wheelRadius = ws.y * 0.5;
      }

      this.pos = new this.THREE.Vector3(0, 0, 0);
      this.vy = 0;
      this.heading = 0;
      this.speed = 0; // m/s (+Z 전진)
      this.steerAngle = 0;
      this.camMode = 0; // 0: 3인칭 체이스, 1: 로우 휠캠, 2: 탑다운
      this.camPosSmooth = new this.THREE.Vector3(0, 3.2, -7.2);
      this.camLookSmooth = new this.THREE.Vector3(0, 0.9, 2);

      // 입력 상태
      this.keys = new Set();
      this.touchState = {
        joyX: 0,       // -1(우) ~ +1(좌)
        joyY: 0,       // -1(후진) ~ +1(전진) (A안 전용)
        accel: false,  // B안 엑셀
        boost: false,  // Shift / 부스트
        brake: false,  // Space / 브레이크
        horn: false,   // B / 경적
      };

      this.boundKeyDown = (e) => this.handleKey(e, true);
      this.boundKeyUp = (e) => this.handleKey(e, false);
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);

      this.updateLights();
      this.resetVehicle();
    }

    resetVehicle() {
      this.pos.set(0, 0, 0);
      this.vy = 0;
      this.heading = 0;
      this.speed = 0;
      this.steerAngle = 0;
      this.carRoot.position.copy(this.pos);
      this.carRoot.rotation.set(0, 0, 0);
      this.carTilt.rotation.set(0, 0, 0);
      this.camPosSmooth.set(0, 3.2, -7.2);
      this.camLookSmooth.set(0, 0.9, 2);
      this.camera.position.copy(this.camPosSmooth);
      this.camera.lookAt(this.camLookSmooth);
    }

    handleKey(e, down) {
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
      }
      if (down) {
        if (code === 'Escape') {
          if (this.onExit) this.onExit();
          return;
        }
        if (code === 'KeyC' && !e.repeat) {
          this.camMode = (this.camMode + 1) % 3;
        }
        if (code === 'KeyL' && !e.repeat) {
          this.toggleNight();
        }
        if (code === 'KeyR' && !e.repeat) {
          this.resetVehicle();
        }
        this.keys.add(code);
      } else {
        this.keys.delete(code);
      }
    }

    toggleNight() {
      this.isNight = !this.isNight;
      const skyColor = this.isNight ? 0x070a12 : (this.trackType === 'offroad' ? 0x1e2620 : 0x18202c);
      this.arena.scene.background.setHex(skyColor);
      this.arena.scene.fog.color.setHex(skyColor);
      this.arena.scene.fog.density = this.isNight ? 0.0095 : 0.0045;
      this.arena.hemi.intensity = this.isNight ? 0.35 : 0.9;
      this.arena.sun.intensity = this.isNight ? 0.45 : 1.35;
      this.headSpot.intensity = this.isNight ? 2.8 : 0;
      this.updateLights();
      return this.isNight;
    }

    updateLights(braking = false) {
      if (this.rig.headlightMat) {
        this.rig.headlightMat.emissiveIntensity = this.isNight ? 2.5 : 1.3;
      }
      if (this.rig.taillightMat) {
        this.rig.taillightMat.emissiveIntensity = braking ? 3.8 : (this.isNight ? 1.5 : 0.85);
      }
    }

    setAspect(aspect) {
      if (aspect > 0) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
      }
    }

    step(dt) {
      const k = this.keys;
      const t = this.touchState;

      // 1) PC + 모바일(A안/B안) 입력 통합
      const keyForward = (k.has('ArrowUp') || k.has('KeyW')) ? 1 : 0;
      const keyBackward = (k.has('ArrowDown') || k.has('KeyS')) ? 1 : 0;
      const keyLeft = (k.has('ArrowLeft') || k.has('KeyA')) ? 1 : 0;
      const keyRight = (k.has('ArrowRight') || k.has('KeyD')) ? 1 : 0;
      const keyBoost = k.has('ShiftLeft') || k.has('ShiftRight');
      const keyBrake = k.has('Space');
      const keyHorn = k.has('KeyB');

      let throttle = keyForward - keyBackward;
      if (this.mobileMode === 'A') {
        if (Math.abs(t.joyY) > 0.08) throttle = Math.max(-1, Math.min(1, throttle + t.joyY));
      } else {
        if (t.accel) throttle = Math.max(throttle, 1);
        if (t.brake && this.speed <= 0.6) throttle = -0.8; // B안: 정지 후 브레이크 길게 누르면 후진
      }

      let steerTarget = keyLeft - keyRight;
      if (Math.abs(t.joyX) > 0.05) {
        steerTarget = Math.max(-1, Math.min(1, steerTarget + t.joyX));
      }

      const isBoost = keyBoost || t.boost;
      const isBrake = keyBrake || (t.brake && (this.mobileMode === 'A' || this.speed > 0.6));
      const isHorn = keyHorn || t.horn;

      // 2) 속도 & 가감속 계산 (스펙 km/h 반영)
      const cruiseMs = this.spec.cruiseKmh / 3.6;
      const boostMs = this.spec.boostKmh / 3.6;
      const surfaceRough = this.arena.getSurfaceRoughness(this.pos.x, this.pos.z);
      const offroadCap = this.trackType === 'offroad' ? (1 - surfaceRough * 0.14) : 1.0;

      const maxFwd = (isBoost ? boostMs : cruiseMs) * offroadCap;
      const maxRev = Math.min(11, cruiseMs * 0.42);
      const accelRate = (isBoost ? 16.5 : 10.5) * (1 - surfaceRough * 0.12);

      if (isBrake) {
        const brakeDecel = 28 * dt;
        if (Math.abs(this.speed) <= brakeDecel) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * brakeDecel;
      } else if (throttle > 0.05) {
        if (this.speed < maxFwd) {
          this.speed = Math.min(maxFwd, this.speed + throttle * accelRate * dt);
        } else {
          // 부스트 해제 시 크루즈 최고속까지 자연 감속
          this.speed = Math.max(maxFwd, this.speed - 9.0 * dt);
        }
      } else if (throttle < -0.05) {
        if (this.speed > 0.5) {
          this.speed = Math.max(0, this.speed - 22 * dt);
        } else {
          this.speed = Math.max(-maxRev, this.speed + throttle * 9.5 * dt);
        }
      } else {
        // 관성 주행 저항
        const drag = (this.trackType === 'offroad' ? 4.2 : 2.6) * dt;
        if (Math.abs(this.speed) <= drag) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * drag;
      }

      // 3) 조향 & 회전 (전진/후진 방향 보정)
      const maxSteerRad = this.THREE.MathUtils.degToRad(32);
      const targetSteerRad = steerTarget * maxSteerRad;
      this.steerAngle += (targetSteerRad - this.steerAngle) * Math.min(1, dt * 11);

      const speedFactor = Math.min(1, Math.abs(this.speed) / 4.0);
      const highSpeedDamp = 1 / (1 + Math.abs(this.speed) * 0.022);
      const dirSign = this.speed >= -0.05 ? 1 : -1;
      const turnRate = (this.steerAngle / maxSteerRad) * 2.1 * speedFactor * highSpeedDamp * dirSign;
      this.heading += turnRate * dt;

      // 4) 위치 이동 & 지면/램프/요철 높이(점프 포함)
      const vx = Math.sin(this.heading) * this.speed;
      const vz = Math.cos(this.heading) * this.speed;
      const prevGroundH = this.arena.getGroundHeight(this.pos.x, this.pos.z);

      this.pos.x += vx * dt;
      this.pos.z += vz * dt;

      // 경기장 경계 반사 제한
      const limit = this.arena.arenaHalf - 2.5;
      if (Math.abs(this.pos.x) > limit) {
        this.pos.x = Math.sign(this.pos.x) * limit;
        this.speed *= -0.35;
      }
      if (Math.abs(this.pos.z) > limit) {
        this.pos.z = Math.sign(this.pos.z) * limit;
        this.speed *= -0.35;
      }

      const groundH = this.arena.getGroundHeight(this.pos.x, this.pos.z);
      const onGroundBefore = this.pos.y <= prevGroundH + 0.06;
      if (onGroundBefore && groundH > prevGroundH && this.speed > 5) {
        // 경사로 주행 시 수직 속도 부여 (점프감)
        const slopeVy = ((groundH - prevGroundH) / Math.max(0.001, dt)) * 0.55;
        this.vy = Math.max(this.vy, Math.min(8.5, slopeVy));
      }

      this.vy -= 22.0 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundH) {
        this.pos.y = groundH;
        this.vy = 0;
      }

      // 5) 차량 Transform & 서스펜션/노면 진동 & Rig 동기화
      this.carRoot.position.copy(this.pos);
      this.carRoot.rotation.y = this.heading;

      const bodyRoll = -(this.steerAngle / maxSteerRad) * Math.min(1, Math.abs(this.speed) / 14) * 0.045;
      const accelPitch = isBrake ? 0.035 : (throttle > 0 && isBoost ? -0.028 : 0);
      const offroadVib = (this.trackType === 'offroad' && this.pos.y <= groundH + 0.02)
        ? Math.sin(performance.now() * 0.032) * Math.min(1, Math.abs(this.speed) / 18) * 0.015 * surfaceRough
        : 0;
      this.carTilt.rotation.z += (bodyRoll + offroadVib - this.carTilt.rotation.z) * Math.min(1, dt * 10);
      this.carTilt.rotation.x += (accelPitch - this.carTilt.rotation.x) * Math.min(1, dt * 10);

      // 바퀴 회전 & 앞바퀴 조향
      const wheelDelta = (this.speed * dt) / this.wheelRadius;
      if (this.rig.wheels) {
        for (const w of this.rig.wheels) {
          if (w && w.rotation) w.rotation.x += wheelDelta;
        }
      }
      if (this.rig.frontSteerPivots) {
        for (const p of this.rig.frontSteerPivots) {
          if (p && p.rotation) p.rotation.y = this.steerAngle;
        }
      }

      this.updateLights(isBrake);

      // 6) 슬라럼 콘 소프트 충돌 반응
      for (const c of this.arena.cones) {
        if (!c.tipped) {
          const dx = c.x - this.pos.x;
          const dz = c.z - this.pos.z;
          if (dx * dx + dz * dz < 1.9 * 1.9) {
            c.tipped = true;
            const len = Math.hypot(dx, dz) || 1;
            c.tipDirX = dx / len;
            c.tipDirZ = dz / len;
          }
        } else if (c.tipAngle < Math.PI / 2) {
          c.tipAngle = Math.min(Math.PI / 2, c.tipAngle + dt * 7);
          c.mesh.rotation.x = c.tipDirZ * c.tipAngle;
          c.mesh.rotation.z = -c.tipDirX * c.tipAngle;
        }
      }

      // 7) 사운드 갱신
      this.audio.update(Math.abs(this.speed) / Math.max(1, boostMs), isBoost);
      this.audio.setHorn(isHorn);

      // 8) 카메라 추적
      this.updateCamera(dt);

      return {
        kmh: Math.round(Math.abs(this.speed) * 3.6),
        reverse: this.speed < -0.3,
        isBoost,
        isBrake,
        isHorn,
        camMode: this.camMode,
      };
    }

    updateCamera(dt) {
      const fwdX = Math.sin(this.heading);
      const fwdZ = Math.cos(this.heading);

      let targetPos;
      let targetLook;

      if (this.camMode === 0) {
        // 3인칭 체이스 캠
        const dist = 7.4 + Math.min(2.2, Math.abs(this.speed) * 0.045);
        targetPos = new this.THREE.Vector3(
          this.pos.x - fwdX * dist,
          this.pos.y + 3.0,
          this.pos.z - fwdZ * dist
        );
        targetLook = new this.THREE.Vector3(
          this.pos.x + fwdX * 3.5,
          this.pos.y + 1.0,
          this.pos.z + fwdZ * 3.5
        );
      } else if (this.camMode === 1) {
        // 로우 앵글 측면/바퀴 확인 캠
        const sideX = Math.cos(this.heading);
        const sideZ = -Math.sin(this.heading);
        targetPos = new this.THREE.Vector3(
          this.pos.x + sideX * 4.8 - fwdX * 2.4,
          this.pos.y + 1.35,
          this.pos.z + sideZ * 4.8 - fwdZ * 2.4
        );
        targetLook = new this.THREE.Vector3(this.pos.x, this.pos.y + 0.75, this.pos.z);
      } else {
        // 탑다운 뷰
        targetPos = new this.THREE.Vector3(this.pos.x, this.pos.y + 19, this.pos.z - 4);
        targetLook = new this.THREE.Vector3(this.pos.x, this.pos.y, this.pos.z + 2);
      }

      const lerpAlpha = Math.min(1, dt * 8.0);
      this.camPosSmooth.lerp(targetPos, lerpAlpha);
      this.camLookSmooth.lerp(targetLook, lerpAlpha);
      this.camera.position.copy(this.camPosSmooth);
      this.camera.lookAt(this.camLookSmooth);
    }

    destroy() {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      this.audio.stopEngine();
      this.carTilt.remove(this.rig.group);
      this.rig.group.position.set(0, 0, 0);
      this.rig.group.rotation.set(0, 0, 0);
      if (this.rig.wheels) {
        this.rig.wheels.forEach((w) => { if (w && w.rotation) w.rotation.x = 0; });
      }
      if (this.rig.frontSteerPivots) {
        this.rig.frontSteerPivots.forEach((p) => { if (p && p.rotation) p.rotation.y = 0; });
      }
      this.arena.dispose();
    }
  }

  global.RigDriveArena = {
    parseVehicleSpec,
    DriveSession,
  };
})(window);
