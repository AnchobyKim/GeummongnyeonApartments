import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Mode = "title" | "room" | "monitor" | "notebook" | "gameover" | "win";
type Interactable = "monitor" | "notebook" | "alarm";

type Anomaly = {
  channel: number;
  phase: "hidden" | "warning" | "seen";
  deadline: number;
};

const videoAssets = import.meta.glob("../Assets/cctv/vid/**/*.mp4", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const environmentAssets = import.meta.glob([
  "../Assets/cctv/vid/ComplexGate.mp4",
  "../Assets/environment/**/*.mp4",
], {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const boardAssets = import.meta.glob("../Assets/board/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const complexGateVideo = Object.entries(environmentAssets).find(([path]) =>
  path.replaceAll("\\", "/").toLowerCase().endsWith("/complexgate.mp4"),
)?.[1];

const VIDEO_KEYWORDS = {
  entrance: ["entrance", "entry", "lobby"],
  elevator: ["elevator", "lift"],
  stair: ["stair", "stairs", "stairway"],
  corridor: ["corridor", "corrider", "hallway", "hall"],
  playground: ["playground", "play", "yard"],
  recycling: ["recycling", "recycle", "rectcling", "trash", "garbage"],
} as const;

type VideoKey = keyof typeof VIDEO_KEYWORDS;
type VideoState = "normal" | "abnormal";

function findVideoAsset(key: VideoKey, state: VideoState) {
  const directoryToken = `/${state}/`;
  const keywords = VIDEO_KEYWORDS[key];
  const match = Object.entries(videoAssets).find(([path]) => {
    const normalizedPath = path.replaceAll("\\", "/").toLowerCase();
    const normalizedName = normalizedPath.split("/").at(-1)?.replace(/[^a-z0-9]/g, "") ?? "";
    return normalizedPath.includes(directoryToken) && keywords.some((keyword) => normalizedName.includes(keyword));
  });

  if (!match) {
    console.warn(`[CCTV] Missing ${state} video for channel '${key}'.`);
  }
  return match?.[1];
}

const CHANNELS = [
  {
    code: "CH 01",
    name: "101동 1층 현관",
    normalVideo: findVideoAsset("entrance", "normal"),
    abnormalVideo: findVideoAsset("entrance", "abnormal"),
  },
  {
    code: "CH 02",
    name: "101동 엘리베이터",
    normalVideo: findVideoAsset("elevator", "normal"),
    abnormalVideo: findVideoAsset("elevator", "abnormal"),
  },
  {
    code: "CH 03",
    name: "101동 비상계단",
    normalVideo: findVideoAsset("stair", "normal"),
    abnormalVideo: findVideoAsset("stair", "abnormal"),
  },
  {
    code: "CH 04",
    name: "3층 복도",
    normalVideo: findVideoAsset("corridor", "normal"),
    abnormalVideo: findVideoAsset("corridor", "abnormal"),
  },
  {
    code: "CH 05",
    name: "단지 내 놀이터",
    normalVideo: findVideoAsset("playground", "normal"),
    abnormalVideo: findVideoAsset("playground", "abnormal"),
  },
  {
    code: "CH 06",
    name: "분리수거장",
    normalVideo: findVideoAsset("recycling", "normal"),
    abnormalVideo: findVideoAsset("recycling", "abnormal"),
  },
] as const;

const RULES = [
  "01. 현관 안쪽에 비가 내리면 즉시 이상 현상 신고 버튼을 누르십시오.",
  "02. 엘리베이터 내부에서 혈흔을 발견하면 문이 닫히기 전에 신고하십시오.",
  "03. 비상계단에 사람이 서 있다면 얼굴을 확인하지 말고 신고하십시오.",
  "04. 3층 복도의 닫혀 있던 문이 열려 있으면 경비실 밖으로 나가지 마십시오.",
  "05. 놀이터에 등록되지 않은 아이들이 보이면 수를 세지 말고 신고하십시오.",
  "06. 분리수거장의 물건 배치가 달라졌다면 원래 위치로 돌려놓으려 하지 마십시오.",
];

function createBox(
  size: [number, number, number],
  position: [number, number, number],
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const DIGIT_SEGMENTS: Record<string, number[]> = {
  "0": [0, 1, 2, 3, 4, 5],
  "1": [1, 2],
  "2": [0, 1, 6, 4, 3],
  "3": [0, 1, 6, 2, 3],
  "4": [5, 6, 1, 2],
  "5": [0, 5, 6, 2, 3],
  "6": [0, 5, 6, 4, 2, 3],
  "7": [0, 1, 2],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 5, 6],
};

function formatShiftTime(elapsedMilliseconds: number) {
  const totalMinutes = Math.floor(elapsedMilliseconds / 5000);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function createClockDisplay() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Digital clock display could not be created.");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const drawSegment = (
    x: number,
    y: number,
    width: number,
    height: number,
    horizontal: boolean,
    active: boolean,
  ) => {
    const bevel = Math.min(width, height) * 0.42;
    context.beginPath();
    if (horizontal) {
      context.moveTo(x + bevel, y);
      context.lineTo(x + width - bevel, y);
      context.lineTo(x + width, y + height / 2);
      context.lineTo(x + width - bevel, y + height);
      context.lineTo(x + bevel, y + height);
      context.lineTo(x, y + height / 2);
    } else {
      context.moveTo(x, y + bevel);
      context.lineTo(x + width / 2, y);
      context.lineTo(x + width, y + bevel);
      context.lineTo(x + width, y + height - bevel);
      context.lineTo(x + width / 2, y + height);
      context.lineTo(x, y + height - bevel);
    }
    context.closePath();
    context.fillStyle = active ? "#ff174f" : "#241d20";
    if (active) {
      context.shadowColor = "#ff003c";
      context.shadowBlur = 18;
    }
    context.fill();
    context.shadowBlur = 0;
  };

  const drawDigit = (digit: string, originX: number) => {
    const activeSegments = new Set(DIGIT_SEGMENTS[digit] ?? []);
    const horizontalWidth = 146;
    const horizontalHeight = 25;
    const verticalWidth = 25;
    const verticalHeight = 126;
    const left = originX;
    const top = 155;

    drawSegment(left + 22, top, horizontalWidth, horizontalHeight, true, activeSegments.has(0));
    drawSegment(left + 164, top + 18, verticalWidth, verticalHeight, false, activeSegments.has(1));
    drawSegment(left + 164, top + 170, verticalWidth, verticalHeight, false, activeSegments.has(2));
    drawSegment(left + 22, top + 292, horizontalWidth, horizontalHeight, true, activeSegments.has(3));
    drawSegment(left, top + 170, verticalWidth, verticalHeight, false, activeSegments.has(4));
    drawSegment(left, top + 18, verticalWidth, verticalHeight, false, activeSegments.has(5));
    drawSegment(left + 22, top + 146, horizontalWidth, horizontalHeight, true, activeSegments.has(6));
  };

  const draw = (time: string) => {
    context.fillStyle = "#020303";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0c0d0d";
    context.fillRect(12, 12, canvas.width - 24, canvas.height - 24);

    context.font = "600 62px 'Courier New', monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ff174f";
    context.shadowColor = "#ff003c";
    context.shadowBlur = 12;
    context.fillText("93.09.14", canvas.width / 2, 82);
    context.shadowBlur = 0;

    drawDigit(time[0], 70);
    drawDigit(time[1], 276);
    drawDigit(time[3], 566);
    drawDigit(time[4], 772);

    context.fillStyle = "#ff174f";
    context.shadowColor = "#ff003c";
    context.shadowBlur = 18;
    context.fillRect(497, 252, 25, 25);
    context.fillRect(497, 349, 25, 25);
    context.shadowBlur = 0;
    texture.needsUpdate = true;
  };

  draw("00:00");
  return { texture, draw };
}

export function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveredRef = useRef<Interactable | null>(null);
  const modeRef = useRef<Mode>("title");
  const anomalyRef = useRef<Anomaly | null>(null);
  const nextAnomalyTimer = useRef<number | null>(null);
  const shiftStartRef = useRef<number | null>(null);
  const gameTimeRef = useRef("00:00");
  const alarmPressStartedRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("title");
  const [hovered, setHovered] = useState<Interactable | null>(null);
  const [locked, setLocked] = useState(false);
  const [channel, setChannel] = useState(0);
  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [remaining, setRemaining] = useState(5);
  const [status, setStatus] = useState("00:00 · 야간 근무 준비");
  const [reported, setReported] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [gameTime, setGameTime] = useState("00:00");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    anomalyRef.current = anomaly;
  }, [anomaly]);

  const scheduleAnomaly = useCallback((delay = 12000) => {
    if (nextAnomalyTimer.current !== null) {
      window.clearTimeout(nextAnomalyTimer.current);
    }
    nextAnomalyTimer.current = window.setTimeout(() => {
      if (modeRef.current === "title" || modeRef.current === "gameover" || modeRef.current === "win") return;
      const next = Math.floor(Math.random() * CHANNELS.length);
      const event: Anomaly = {
        channel: next,
        phase: "hidden",
        deadline: performance.now() + 15000,
      };
      anomalyRef.current = event;
      setAnomaly(event);
      setRemaining(0);
    }, delay);
  }, []);

  const resolveAlarm = useCallback(() => {
    alarmPressStartedRef.current = performance.now();
    if (!anomalyRef.current) {
      setStatus("감지된 이상 신호 없음");
      return;
    }
    if (anomalyRef.current.phase !== "seen") {
      setStatus("이상 현상을 직접 확인한 뒤 신고하십시오");
      return;
    }
    anomalyRef.current = null;
    setAnomaly(null);
    setRemaining(0);
    setReported((value) => value + 1);
    setStatus("이상 신호 보고 완료");
    scheduleAnomaly(9000 + Math.random() * 5000);
  }, [scheduleAnomaly]);

  const enterInteraction = useCallback((target: Interactable) => {
    if (target === "monitor") {
      setMode("monitor");
      setStatus("CCTV 감시 중");
    } else if (target === "notebook") {
      setMode("notebook");
      setStatus("야간 근무 수칙 열람 중");
    } else {
      resolveAlarm();
    }
  }, [resolveAlarm]);

  const leaveInteraction = useCallback(() => {
    setMode("room");
    const active = anomalyRef.current;
    setStatus(active?.phase === "seen"
      ? "이상 현상 목격 · 5초 내에 신고하십시오"
      : active?.phase === "warning"
        ? "CCTV 신호 간섭 발생 · 이상 채널을 확인하십시오"
        : "경비실 근무 중");
  }, []);

  const requestControl = useCallback(() => {
    canvasRef.current?.requestPointerLock();
  }, []);

  const startGame = useCallback(() => {
    shiftStartRef.current = performance.now();
    gameTimeRef.current = "00:00";
    setGameTime("00:00");
    setMode("room");
    setStatus("00:00 · 경비실 근무 중");
    scheduleAnomaly();
    canvasRef.current?.requestPointerLock();
  }, [scheduleAnomaly]);

  useEffect(() => {
    if (mode === "title" || mode === "gameover" || mode === "win" || shiftStartRef.current === null) return;

    const updateShiftTime = () => {
      if (shiftStartRef.current === null) return;
      const elapsed = performance.now() - shiftStartRef.current;
      const nextGameTime = formatShiftTime(elapsed);
      if (gameTimeRef.current !== nextGameTime) {
        gameTimeRef.current = nextGameTime;
        setGameTime(nextGameTime);
      }

      if (elapsed >= 360 * 5000) {
        gameTimeRef.current = "06:00";
        setGameTime("06:00");
        shiftStartRef.current = null;
        modeRef.current = "win";
        anomalyRef.current = null;
        setAnomaly(null);
        setStatus("06:00 · 야간 근무 종료");
        setMode("win");
        if (nextAnomalyTimer.current !== null) {
          window.clearTimeout(nextAnomalyTimer.current);
          nextAnomalyTimer.current = null;
        }
        document.exitPointerLock?.();
      }
    };

    updateShiftTime();
    const timer = window.setInterval(updateShiftTime, 100);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (!anomaly) return;

    const tick = window.setInterval(() => {
      const left = Math.max(0, anomaly.deadline - performance.now());
      if (anomaly.phase !== "hidden") setRemaining(left / 1000);
      if (left <= 0) {
        window.clearInterval(tick);
        if (anomaly.phase === "hidden") {
          const warning: Anomaly = {
            ...anomaly,
            phase: "warning",
            deadline: performance.now() + 10000,
          };
          anomalyRef.current = warning;
          setAnomaly(warning);
          setRemaining(10);
          setStatus("CCTV 신호 간섭 발생 · 이상 채널을 확인하십시오");
          return;
        }
        modeRef.current = "gameover";
        anomalyRef.current = null;
        setAnomaly(null);
        setRemaining(0);
        setMode("gameover");
        setStatus(anomaly.phase === "seen" ? "보고 시간 초과" : "이상 채널 확인 실패");
        document.exitPointerLock?.();
      }
    }, 50);

    return () => window.clearInterval(tick);
  }, [anomaly]);

  useEffect(() => {
    if (!anomaly || anomaly.phase === "seen" || mode !== "monitor" || channel !== anomaly.channel) return;
    const witnessed: Anomaly = {
      ...anomaly,
      phase: "seen",
      deadline: performance.now() + 5000,
    };
    anomalyRef.current = witnessed;
    setAnomaly(witnessed);
    setRemaining(5);
    setStatus("이상 현상 목격 · 5초 내에 신고하십시오");
  }, [anomaly, channel, mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (modeRef.current === "gameover" || modeRef.current === "win" || modeRef.current === "title") return;

      if (modeRef.current === "monitor" && event.code === "KeyA") {
        event.preventDefault();
        setChannel((value) => (value + CHANNELS.length - 1) % CHANNELS.length);
        return;
      }
      if (modeRef.current === "monitor" && event.code === "KeyD") {
        event.preventDefault();
        setChannel((value) => (value + 1) % CHANNELS.length);
        return;
      }
      if (event.key === "Escape" && modeRef.current !== "room") {
        event.preventDefault();
        leaveInteraction();
        return;
      }
      if (event.key.toLowerCase() === "f") {
        if (modeRef.current === "monitor" || modeRef.current === "notebook") {
          leaveInteraction();
        } else if (modeRef.current === "room" && hoveredRef.current) {
          enterInteraction(hoveredRef.current);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterInteraction, leaveInteraction]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "game-canvas";
    renderer.domElement.setAttribute("aria-label", "금목련아파트 3D 경비실");
    mount.appendChild(renderer.domElement);
    canvasRef.current = renderer.domElement;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050706);
    scene.fog = new THREE.FogExp2(0x050706, 0.055);

    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 40);
    camera.position.set(0, 1.68, 3.35);
    camera.rotation.order = "YXZ";
    camera.rotation.x = -0.12;

    scene.add(new THREE.HemisphereLight(0x748275, 0x10110f, 0.55));
    const ceilingLight = new THREE.PointLight(0xd8d4b7, 18, 9, 2);
    ceilingLight.position.set(0, 3.72, 0.8);
    ceilingLight.castShadow = true;
    scene.add(ceilingLight);

    const monitorLight = new THREE.PointLight(0x89baa4, 5, 3, 2);
    monitorLight.position.set(1.25, 1.55, 0.7);
    scene.add(monitorLight);

    const room = new THREE.Group();
    room.add(createBox([8, 0.15, 8], [0, -0.05, 0], 0x242824));
    room.add(createBox([8, 4, 0.15], [0, 1.95, -2.15], 0x56594e));
    room.add(createBox([8, 4, 0.15], [0, 1.95, 4], 0x454943));
    room.add(createBox([0.15, 4, 8], [-4, 1.95, 0], 0x363a35));
    room.add(createBox([0.15, 4, 8], [4, 1.95, 0], 0x363a35));

    const ceilingFixture = createBox([1.65, 0.09, 0.48], [0, 3.86, 0.8], 0xe1ddc2);
    const ceilingFixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9c7b5,
      emissive: 0xe7e3c9,
      emissiveIntensity: 1.15,
      roughness: 0.42,
    });
    ceilingFixture.material = ceilingFixtureMaterial;
    room.add(ceilingFixture);

    const rearDoor = new THREE.Group();
    rearDoor.add(createBox([1.55, 2.75, 0.12], [0, 1.38, 3.89], 0x302c25));
    rearDoor.add(createBox([1.78, 0.13, 0.18], [0, 2.82, 3.8], 0x181713));
    rearDoor.add(createBox([0.13, 2.95, 0.18], [-0.84, 1.42, 3.8], 0x181713));
    rearDoor.add(createBox([0.13, 2.95, 0.18], [0.84, 1.42, 3.8], 0x181713));
    const doorKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x8b7650, metalness: 0.75, roughness: 0.28 }),
    );
    doorKnob.position.set(0.55, 1.35, 3.76);
    rearDoor.add(doorKnob);
    room.add(rearDoor);

    const boardTextures: THREE.Texture[] = [];
    const noticeBoard = new THREE.Group();
    noticeBoard.add(createBox([0.13, 1.085, 3.45], [-3.88, 2.02, -0.3], 0x5b4029));
    noticeBoard.add(createBox([0.18, 0.1, 3.65], [-3.78, 2.63, -0.3], 0x241a12));
    noticeBoard.add(createBox([0.18, 0.1, 3.65], [-3.78, 1.41, -0.3], 0x241a12));
    noticeBoard.add(createBox([0.18, 1.23, 0.1], [-3.78, 2.02, -2.1], 0x241a12));
    noticeBoard.add(createBox([0.18, 1.23, 0.1], [-3.78, 2.02, 1.5], 0x241a12));

    const textureLoader = new THREE.TextureLoader();
    Object.values(boardAssets).sort().forEach((url, index) => {
      const paperMaterial = new THREE.MeshBasicMaterial({
        toneMapped: false,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
      });
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paperMaterial);
      paper.scale.set(0.78, 0.78, 1);
      const texture = textureLoader.load(url, (loadedTexture) => {
        const image = loadedTexture.image as HTMLImageElement;
        const aspect = image.naturalWidth / image.naturalHeight;
        const maxWidth = 1.08;
        const maxHeight = 0.84;
        const width = Math.min(maxWidth, maxHeight * aspect);
        paper.scale.set(width, width / aspect, 1);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      paperMaterial.map = texture;
      boardTextures.push(texture);
      const column = index % 4;
      const row = Math.floor(index / 4);
      paper.position.set(-3.805, 2.28 - row * 0.52, -1.56 + column * 0.84);
      paper.rotation.y = Math.PI / 2;
      noticeBoard.add(paper);
    });
    noticeBoard.position.z = 1.75;
    room.add(noticeBoard);

    const boardLight = new THREE.PointLight(0xd6c69d, 3.2, 3.4, 2);
    boardLight.position.set(-3.15, 2.62, 1.55);
    scene.add(boardLight);

    const windowGroup = new THREE.Group();
    let exteriorVideo: HTMLVideoElement | null = null;
    let exteriorTexture: THREE.VideoTexture | null = null;
    const windowGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 2.88),
      new THREE.MeshBasicMaterial({ color: 0x07100d }),
    );
    windowGlass.position.set(0, 2.34, -2.065);

    if (complexGateVideo) {
      exteriorVideo = document.createElement("video");
      exteriorVideo.src = complexGateVideo;
      exteriorVideo.loop = true;
      exteriorVideo.muted = true;
      exteriorVideo.autoplay = true;
      exteriorVideo.playsInline = true;
      exteriorVideo.preload = "auto";
      exteriorTexture = new THREE.VideoTexture(exteriorVideo);
      exteriorTexture.colorSpace = THREE.SRGBColorSpace;
      exteriorTexture.minFilter = THREE.LinearFilter;
      exteriorTexture.magFilter = THREE.LinearFilter;
      exteriorTexture.repeat.set(1, 0.8);
      exteriorTexture.offset.set(0, 0.2);
      windowGlass.material = new THREE.MeshBasicMaterial({ map: exteriorTexture, toneMapped: false });
      void exteriorVideo.play().catch(() => undefined);
    } else {
      console.warn("[Environment] Missing ComplexGate.mp4 for the front window.");
    }

    windowGroup.add(windowGlass);
    const frameColor = 0x171b18;
    windowGroup.add(createBox([5.08, 0.14, 0.14], [0, 3.85, -1.99], frameColor));
    windowGroup.add(createBox([5.08, 0.14, 0.14], [0, 0.83, -1.99], frameColor));
    windowGroup.add(createBox([0.14, 3.16, 0.14], [-2.47, 2.34, -1.99], frameColor));
    windowGroup.add(createBox([0.14, 3.16, 0.14], [2.47, 2.34, -1.99], frameColor));
    windowGroup.add(createBox([0.1, 3.02, 0.12], [0, 2.34, -1.98], frameColor));
    windowGroup.add(createBox([4.94, 0.1, 0.12], [0, 2.34, -1.98], frameColor));
    room.add(windowGroup);

    const desk = createBox([4.6, 0.18, 1.7], [0, 0.78, 0.05], 0x3b281d);
    room.add(desk);
    room.add(createBox([0.2, 1.55, 0.2], [-2, 0, -0.55], 0x211710));
    room.add(createBox([0.2, 1.55, 0.2], [2, 0, -0.55], 0x211710));

    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(1.35, 0, 0);
    monitorGroup.rotation.y = -0.36;
    const monitorBody = createBox([1.82, 1.36, 0.85], [0, 1.53, -0.02], 0x242723);
    monitorBody.userData.interactable = "monitor" satisfies Interactable;
    monitorGroup.add(monitorBody);
    const screen = createBox([1.5, 1.02, 0.04], [0, 1.57, 0.42], 0x193126);
    screen.material = new THREE.MeshStandardMaterial({
      color: 0x183126,
      emissive: 0x315f48,
      emissiveIntensity: 0.75,
      roughness: 0.35,
    });
    screen.userData.interactable = "monitor" satisfies Interactable;
    monitorGroup.add(screen);
    monitorGroup.add(createBox([0.58, 0.15, 0.45], [0, 0.91, -0.02], 0x242723));
    room.add(monitorGroup);

    const fan = new THREE.Group();
    fan.position.set(2.42, 0, 0.12);
    const fanBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.38, 0.1, 28),
      new THREE.MeshStandardMaterial({ color: 0x303732, metalness: 0.25, roughness: 0.58 }),
    );
    fanBase.position.y = 0.94;
    fan.add(fanBase);
    const fanStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.58, 16),
      new THREE.MeshStandardMaterial({ color: 0x3b433d, metalness: 0.45, roughness: 0.48 }),
    );
    fanStem.position.y = 1.23;
    fan.add(fanStem);

    const fanHead = new THREE.Group();
    fanHead.position.y = 1.58;
    const fanMotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.32, 20),
      new THREE.MeshStandardMaterial({ color: 0x252b27, metalness: 0.25, roughness: 0.62 }),
    );
    fanMotor.rotation.x = Math.PI / 2;
    fanHead.add(fanMotor);

    const cageMaterial = new THREE.MeshStandardMaterial({ color: 0x565f58, metalness: 0.7, roughness: 0.34 });
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.018, 8, 42), cageMaterial);
    cage.position.z = 0.16;
    fanHead.add(cage);
    for (let spokeIndex = 0; spokeIndex < 8; spokeIndex += 1) {
      const spoke = createBox([0.72, 0.012, 0.012], [0, 0, 0.16], 0x565f58);
      spoke.rotation.z = (Math.PI / 4) * spokeIndex;
      fanHead.add(spoke);
    }

    const fanRotor = new THREE.Group();
    fanRotor.position.z = 0.12;
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x78847b,
      metalness: 0.15,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.025), bladeMaterial);
      blade.position.x = 0.18;
      blade.rotation.z = 0.28;
      const bladeArm = new THREE.Group();
      bladeArm.rotation.z = (Math.PI / 2) * bladeIndex;
      bladeArm.add(blade);
      fanRotor.add(bladeArm);
    }
    const fanHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.09, 18),
      new THREE.MeshStandardMaterial({ color: 0x303833, metalness: 0.4, roughness: 0.42 }),
    );
    fanHub.rotation.x = Math.PI / 2;
    fanHub.position.z = 0.03;
    fanRotor.add(fanHub);
    fanHead.add(fanRotor);
    fan.add(fanHead);
    room.add(fan);

    const notebook = createBox([0.85, 0.07, 1.12], [-1.28, 0.94, 0.45], 0xd3c9a0);
    notebook.rotation.y = -0.18;
    notebook.userData.interactable = "notebook" satisfies Interactable;
    room.add(notebook);
    const noteBand = createBox([0.07, 0.08, 1.12], [-1.58, 0.98, 0.54], 0x29261f);
    noteBand.rotation.y = -0.18;
    noteBand.userData.interactable = "notebook" satisfies Interactable;
    room.add(noteBand);

    const drawer = createBox([1.35, 0.3, 1.05], [1.35, 0.57, 0.82], 0x302218);
    room.add(drawer);
    room.add(createBox([0.72, 0.07, 0.06], [1.35, 0.57, 1.37], 0x11120f));

    const alarmBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.38, 0.18, 32),
      new THREE.MeshStandardMaterial({ color: 0x1e211d, roughness: 0.7 }),
    );
    alarmBase.position.set(1.35, 0.78, 1.02);
    alarmBase.userData.interactable = "alarm" satisfies Interactable;
    room.add(alarmBase);
    const alarmButton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.26, 0.16, 32),
      new THREE.MeshStandardMaterial({ color: 0x6d160f, emissive: 0x2c0300, emissiveIntensity: 0.7 }),
    );
    alarmButton.position.set(1.35, 0.92, 1.02);
    alarmButton.userData.interactable = "alarm" satisfies Interactable;
    room.add(alarmButton);

    const label = createBox([0.82, 0.035, 0.25], [1.35, 0.74, 0.48], 0xd2c8a1);
    label.userData.interactable = "alarm" satisfies Interactable;
    room.add(label);

    const clock = new THREE.Group();
    const clockBody = createBox([1.3, 0.62, 0.34], [-1.55, 1.21, -0.28], 0x080a09);
    clockBody.material = new THREE.MeshStandardMaterial({
      color: 0x070908,
      roughness: 0.34,
      metalness: 0.18,
    });
    clock.add(clockBody);

    const clockBezel = createBox([1.18, 0.5, 0.035], [-1.55, 1.21, -0.095], 0x010202);
    clockBezel.material = new THREE.MeshStandardMaterial({
      color: 0x010202,
      roughness: 0.28,
      metalness: 0.12,
    });
    clock.add(clockBezel);

    const clockDisplay = createClockDisplay();
    const clockFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.08, 0.45),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: clockDisplay.texture,
        emissive: 0xffffff,
        emissiveMap: clockDisplay.texture,
        emissiveIntensity: 1.35,
        roughness: 0.25,
        toneMapped: false,
      }),
    );
    clockFace.position.set(-1.55, 1.21, -0.073);
    clock.add(clockFace);

    const clockGlow = new THREE.PointLight(0xff174f, 0.8, 1.15, 2);
    clockGlow.position.set(-1.55, 1.19, 0.02);
    clock.add(clockGlow);
    room.add(clock);

    scene.add(room);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    let yaw = 0;
    let pitch = -0.12;
    let animationFrame = 0;
    let previousHover: THREE.Object3D | null = null;
    let displayedClockTime = "00:00";
    let previousAnimationTime = performance.now();
    let nextLightFlicker = previousAnimationTime + 8000 + Math.random() * 12000;
    let lightFlickerEnds = 0;

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement || modeRef.current !== "room") return;
      yaw -= event.movementX * 0.0018;
      pitch -= event.movementY * 0.0018;
      yaw = THREE.MathUtils.clamp(yaw, -3.05, 3.05);
      pitch = THREE.MathUtils.clamp(pitch, -0.63, 0.42);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    };

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked && (modeRef.current === "monitor" || modeRef.current === "notebook")) {
        setMode("room");
        const active = anomalyRef.current;
        setStatus(active?.phase === "seen"
          ? "이상 현상 목격 · 5초 내에 신고하십시오"
          : active?.phase === "warning"
            ? "CCTV 신호 간섭 발생 · 이상 채널을 확인하십시오"
            : "경비실 근무 중");
      }
    };

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const now = performance.now();
      const deltaSeconds = Math.min(0.05, (now - previousAnimationTime) / 1000);
      previousAnimationTime = now;
      const t = now * 0.001;

      if (now >= nextLightFlicker) {
        lightFlickerEnds = now + 90 + Math.random() * 130;
        nextLightFlicker = now + 9000 + Math.random() * 15000;
      }
      const lightIsFlickering = now < lightFlickerEnds;
      ceilingLight.intensity = lightIsFlickering && Math.floor(now / 45) % 2 === 0 ? 1.4 : 17.5;
      ceilingFixtureMaterial.emissiveIntensity = lightIsFlickering && Math.floor(now / 45) % 2 === 0 ? 0.08 : 1.15;
      monitorLight.intensity = 4.8 + Math.sin(t * 4.3) * 0.35;
      fanRotor.rotation.z -= deltaSeconds * 22;
      fanHead.rotation.y = Math.sin(t * 0.55) * 0.32;

      const alarmPressElapsed = alarmPressStartedRef.current === null
        ? Number.POSITIVE_INFINITY
        : now - alarmPressStartedRef.current;
      if (alarmPressElapsed < 90) {
        alarmButton.position.y = THREE.MathUtils.lerp(0.92, 0.82, alarmPressElapsed / 90);
      } else if (alarmPressElapsed < 260) {
        alarmButton.position.y = THREE.MathUtils.lerp(0.82, 0.92, (alarmPressElapsed - 90) / 170);
      } else {
        alarmButton.position.y = 0.92;
        alarmPressStartedRef.current = null;
      }

      if (gameTimeRef.current !== displayedClockTime) {
          displayedClockTime = gameTimeRef.current;
          clockDisplay.draw(displayedClockTime);
      }

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(room.children, true).find((entry) => entry.object.userData.interactable);
      const hitObject = hit?.object ?? null;
      const nextHover = (hitObject?.userData.interactable as Interactable | undefined) ?? null;
      if (nextHover !== hoveredRef.current) {
        hoveredRef.current = nextHover;
        setHovered(nextHover);
      }

      if (previousHover !== hitObject) {
        if (previousHover instanceof THREE.Mesh && previousHover.material instanceof THREE.MeshStandardMaterial) {
          previousHover.material.emissiveIntensity = previousHover === screen ? 0.75 : previousHover === alarmButton ? 0.7 : 0;
        }
        if (hitObject instanceof THREE.Mesh && hitObject.material instanceof THREE.MeshStandardMaterial) {
          hitObject.material.emissive.set(0x6e8d6e);
          hitObject.material.emissiveIntensity = hitObject === screen ? 1.1 : 0.25;
        }
        previousHover = hitObject;
      }

      renderer.render(scene, camera);
    };

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("resize", onResize);
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", onResize);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      clockDisplay.texture.dispose();
      boardTextures.forEach((texture) => texture.dispose());
      exteriorVideo?.pause();
      if (exteriorVideo) {
        exteriorVideo.removeAttribute("src");
        exteriorVideo.load();
      }
      exteriorTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (canvasRef.current === renderer.domElement) canvasRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    if (nextAnomalyTimer.current !== null) window.clearTimeout(nextAnomalyTimer.current);
  }, []);

  const hoverLabel = hovered === "monitor"
    ? "CCTV 모니터"
    : hovered === "notebook"
      ? "야간 근무 노트"
      : hovered === "alarm"
        ? "이상 현상 신고 버튼"
        : null;

  const currentChannel = CHANNELS[channel];
  const anomalyVisible = anomaly?.channel === channel;
  const warningInterference = anomaly?.phase === "warning";
  const currentVideo = anomalyVisible ? currentChannel.abnormalVideo : currentChannel.normalVideo;

  useEffect(() => {
    setVideoError(false);
  }, [currentVideo]);

  return (
    <main className="game-shell">
      <div ref={mountRef} className="viewport" onClick={mode === "room" && !locked ? requestControl : undefined} />

      {mode !== "title" && mode !== "gameover" && mode !== "win" && (
        <>
          <div className={`crosshair ${hovered && mode === "room" ? "is-targeting" : ""}`} aria-hidden="true" />
          <div className="top-hud">
            <span>금목련아파트 관리사무소</span>
            <span>보고 {reported.toString().padStart(2, "0")}</span>
          </div>
          <div className="status-line">{status}</div>
          {mode === "room" && hoverLabel && (
            <div className="interaction-prompt"><kbd>F</kbd> {hoverLabel} 사용</div>
          )}
          {mode === "room" && !locked && (
            <button className="resume-control" onClick={requestControl}>화면을 클릭하여 시점 조작</button>
          )}
          {anomaly && anomaly.phase !== "hidden" && (
            <div className="anomaly-timer" role="alert">
              {anomaly.phase === "warning" ? "채널 확인 제한" : "신고 제한"} <strong>{remaining.toFixed(1)}</strong>
            </div>
          )}
        </>
      )}

      {mode === "title" && (
        <section className="title-screen">
          <div className="title-noise" aria-hidden="true" />
          <p className="eyebrow">GEUMMONGNYEON APARTMENTS</p>
          <h1>금목련아파트</h1>
          <p className="shift-copy">야간 경비 근무 기록 · 00:00—06:00</p>
          <div className="briefing">
            <p>마우스로 시선을 움직이고 화면 중앙의 점을 사물에 맞추십시오.</p>
            <p><kbd>F</kbd> 상호작용 · <kbd>A</kbd><kbd>D</kbd> 채널 이동 · <kbd>ESC</kbd> 종료</p>
          </div>
          <button className="primary-action" onClick={startGame}>야간 근무 시작</button>
          <p className="build-label">PROTOTYPE RECORD 1993-09</p>
        </section>
      )}

      {mode === "monitor" && (
        <section className="device-overlay monitor-overlay" aria-label="CCTV 모니터">
          <div className="crt-frame">
            <div className={`cctv-feed ${anomalyVisible ? "has-anomaly" : ""} ${warningInterference ? "has-interference" : ""}`}>
              {currentVideo && !videoError ? (
                <video
                  key={currentVideo}
                  className="cctv-video"
                  src={currentVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onError={() => setVideoError(true)}
                  aria-label={`${currentChannel.name} ${anomalyVisible ? "이상" : "정상"} CCTV 영상`}
                />
              ) : (
                <div className="no-signal" role="status">
                  <strong>NO SIGNAL</strong>
                  <span>VIDEO ASSET UNAVAILABLE</span>
                </div>
              )}
              <div className="cctv-meta">
                <span>{currentChannel.code}</span>
                <span className={anomalyVisible ? "corrupt-time" : ""}>1993-09-14&nbsp;&nbsp;{gameTime}</span>
              </div>
              <div className="channel-name">{currentChannel.name}</div>
              <div className="scanlines" />
              <div className="tracking-bar" />
              {warningInterference && <div className="signal-interference" aria-hidden="true" />}
            </div>
            <div className="monitor-controls">
              <button aria-label="이전 CCTV 채널" onClick={() => setChannel((value) => (value + 5) % 6)}>A</button>
              <span>{channel + 1} / 6</span>
              <button aria-label="다음 CCTV 채널" onClick={() => setChannel((value) => (value + 1) % 6)}>D</button>
            </div>
          </div>
          <p className="exit-hint"><kbd>F</kbd> 또는 <kbd>ESC</kbd> 모니터에서 물러나기</p>
        </section>
      )}

      {mode === "notebook" && (
        <section className="device-overlay notebook-overlay" aria-label="야간 근무 노트">
          <article className="notebook">
            <div className="binding" aria-hidden="true" />
            <header>
              <p>금목련아파트 관리사무소</p>
              <h2>야간 경비 근무 수칙</h2>
              <span>문서번호 GM-99-04</span>
            </header>
            <ol>
              {RULES.map((rule) => <li key={rule}>{rule}</li>)}
            </ol>
            <p className="handwriting">수칙이 하나 더 보인다면, 이미 너무 오래 보고 있었던 것이다.</p>
          </article>
          <p className="exit-hint dark"><kbd>F</kbd> 또는 <kbd>ESC</kbd> 노트 내려놓기</p>
        </section>
      )}

      {mode === "gameover" && (
        <section className="gameover-screen">
          <p className="eyebrow">SHIFT TERMINATED</p>
          <h2>보고가 접수되지 않았습니다</h2>
          <p>금목련아파트 관리사무소는 해당 근무자의 존재를 확인할 수 없습니다.</p>
          <button className="primary-action" onClick={() => window.location.reload()}>근무 기록 다시 열기</button>
        </section>
      )}

      {mode === "win" && (
        <section className="win-screen">
          <p className="eyebrow">SHIFT COMPLETE · 06:00</p>
          <h2>야간 근무가 종료되었습니다</h2>
          <p>금목련아파트 관리사무소가 근무자의 생존을 확인했습니다.</p>
          <p className="win-report">이상 현상 보고 {reported.toString().padStart(2, "0")}건</p>
          <button className="primary-action" onClick={() => window.location.reload()}>근무 기록 다시 열기</button>
        </section>
      )}
    </main>
  );
}
