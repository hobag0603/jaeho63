const shark = document.getElementById('shark');
const brand = document.querySelector('.brand');
const isBackgroundMode = shark.dataset.mode === 'background';
const STORAGE_KEY = 'shark_shared_state';

// 움직임 튜닝 파라미터
const CONFIG = {
  autoGlideSpeed: 0.75,    // 자율 유영 기본 활공 속도
  autoThrust: 1.35,        // 자율 유영 꼬리 추진 가속량
  followGlideSpeed: 3.0,   // 추적 모드 기본 활공 속도
  followThrust: 4.5,       // 추적 모드 꼬리 추진 가속량
  drag: 0.032,             // 활공 감속률 (낮을수록 오래 미끄러짐)
  turnRateAuto: 0.022,     // 자율 유영 최대 선회 각속도 (rad/frame)
  turnRateFollow: 0.075,   // 추적 모드 최대 선회 각속도
  waveAmp: 0.34,           // 유영 궤적 사인파 진폭 (rad)
  waveFreq: 0.02,          // 궤적 곡선 주기
  strokeFreq: 0.042,       // 꼬리 추진 주기 (약 2.5초 간격)
  maxPitch: 0.78,          // 최대 상하 기울기 (약 45도)
  topMargin: 6,
  edgeMargin: 12
};

let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;
let targetX = currentX;
let targetY = currentY;
let rawMouseX = currentX;
let rawMouseY = currentY;

// 물리 및 자세 상태
let heading = 0;           // 실제 진행 각도 (rad)
let speed = CONFIG.autoGlideSpeed;
let direction = 1;         // 목표 좌우 방향 (1: 오른쪽, -1: 왼쪽)
let currentScaleX = 1;     // 부드러운 좌우 반전 값
let currentPitch = 0;      // 기수 상하 회전 각도 (rad)

let swimPhase = Math.random() * Math.PI * 2;
let strokePhase = Math.random() * Math.PI * 2;

let isMouseOutside = false;
let hitWallAfterLeave = false;
let isAutoSwimming = true;
let autoTimer = 0;
let noticeTimer = 0;
let chaseFactor = 0;

// 페이지 이동 시 직전 상태 복원
const saved = sessionStorage.getItem(STORAGE_KEY);
if (saved) {
  try {
    const state = JSON.parse(saved);
    currentX = state.currentX ?? currentX;
    currentY = state.currentY ?? currentY;
    targetX = state.targetX ?? targetX;
    targetY = state.targetY ?? targetY;
    rawMouseX = targetX;
    rawMouseY = targetY;
    heading = state.heading ?? (state.direction === -1 ? Math.PI : 0);
    speed = state.speed ?? speed;
    direction = state.direction ?? direction;
    currentScaleX = direction;
    currentPitch = state.currentPitch ?? 0;
    autoTimer = state.autoTimer ?? 0;
  } catch (e) {}
}

const bounceTop = { hit: false, offset: 0, vy: 0 };
const bounceBottom = { hit: false, offset: 0, vy: 0 };
const bounceLeft = { hit: false, offset: 0, vy: 0 };
const bounceRight = { hit: false, offset: 0, vy: 0 };

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function updateBounce(b, isAtEdge, dt) {
  if (isAtEdge) {
    if (!b.hit) {
      b.hit = true;
      b.vy = 5.5;
    }
  } else {
    b.hit = false;
  }

  if (b.offset > 0 || b.vy > 0) {
    b.offset += b.vy * dt;
    b.vy -= 0.32 * dt;
    if (b.offset <= 0) {
      b.offset = 0;
      if (Math.abs(b.vy) > 0.8) {
        b.vy = -b.vy * 0.62;
      } else {
        b.vy = 0;
      }
    }
  }
  return b.offset;
}

function pickNewAutoTarget(minX, maxX, minY, maxY) {
  const padX = Math.min(100, (maxX - minX) / 4);
  const padY = Math.min(80, (maxY - minY) / 4);
  targetX = minX + padX + Math.random() * Math.max(0, maxX - minX - padX * 2);
  targetY = minY + padY + Math.random() * Math.max(0, maxY - minY - padY * 2);
  autoTimer = 220 + Math.floor(Math.random() * 180);
}

function onPointerMove(x, y) {
  rawMouseX = x;
  rawMouseY = y;
  isMouseOutside = false;
  hitWallAfterLeave = false;

  if (isAutoSwimming) {
    isAutoSwimming = false;
    noticeTimer = 6;
    chaseFactor = 0;
  }
}

if (!isBackgroundMode) {
  window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));

  document.addEventListener('mouseleave', (e) => {
    isMouseOutside = true;
    hitWallAfterLeave = false;
    rawMouseX = e.clientX;
    rawMouseY = e.clientY;
    targetX = e.clientX;
    targetY = e.clientY;
  });

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
}

function saveSharkState() {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      currentX,
      currentY,
      targetX,
      targetY,
      heading,
      speed,
      direction,
      currentPitch,
      autoTimer
    })
  );
}

window.addEventListener('pagehide', saveSharkState);

let lastTime = performance.now();
let saveCounter = 0;

function animate(now) {
  const dt = Math.min(2, (now - lastTime) / 16.667);
  lastTime = now;

  const isMobile = window.innerWidth <= 768;
  const halfW = (shark.offsetWidth / 2) || (isMobile ? 50 : 100);
  const halfH = (shark.offsetHeight / 2) || (isMobile ? 25 : 50);

  const textBottom = brand ? brand.getBoundingClientRect().bottom : 0;
  const minX = halfW + CONFIG.edgeMargin;
  const maxX = Math.max(minX, window.innerWidth - halfW - CONFIG.edgeMargin);
  const minY = isBackgroundMode ? (halfH + CONFIG.edgeMargin) : (textBottom + halfH + CONFIG.topMargin);
  const maxY = Math.max(minY, window.innerHeight - halfH - CONFIG.edgeMargin);

  if (isAutoSwimming) {
    if (autoTimer <= 0 || Math.hypot(targetX - currentX, targetY - currentY) < 70) {
      pickNewAutoTarget(minX, maxX, minY, maxY);
    }
    autoTimer -= dt;
  } else if (!isMouseOutside) {
    targetX += (rawMouseX - targetX) * 0.12 * dt;
    targetY += (rawMouseY - targetY) * 0.12 * dt;
  }

  const clampedX = Math.max(minX, Math.min(maxX, targetX));
  const clampedY = Math.max(minY, Math.min(maxY, targetY));

  const dx = clampedX - currentX;
  const dy = clampedY - currentY;
  const dist = Math.hypot(dx, dy);

  if (!isAutoSwimming) {
    if (noticeTimer > 0) {
      noticeTimer -= dt;
    } else {
      chaseFactor = Math.min(1, chaseFactor + 0.045 * dt);
    }
  }

  // 1. 유영 궤적 및 조향 (이중 사인파 곡선 + 선회 각속도 제한)
  swimPhase += CONFIG.waveFreq * dt;
  const wander = (Math.sin(swimPhase) + 0.45 * Math.sin(swimPhase * 0.43)) * CONFIG.waveAmp;

  if (dist > 28) {
    const baseAngle = Math.atan2(dy, dx);
    const waveWeight = isAutoSwimming ? 1 : Math.min(1, dist / 260) * 0.55;
    const desiredHeading = baseAngle + wander * waveWeight;
    const diff = normalizeAngle(desiredHeading - heading);
    const maxTurn = (isAutoSwimming ? CONFIG.turnRateAuto : CONFIG.turnRateFollow) * dt;
    heading = normalizeAngle(heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }

  // 2. 속도 변화 (추진-활공 물리)
  const strokeRate = isAutoSwimming ? CONFIG.strokeFreq : CONFIG.strokeFreq * (1 + chaseFactor * 0.45);
  strokePhase += strokeRate * dt;
  const strokeWave = Math.sin(strokePhase);
  // 주기의 일정 구간에서만 짧은 추진 펄스 발생
  const thrustPulse = strokeWave > 0.65 ? Math.pow((strokeWave - 0.65) / 0.35, 2) : 0;

  const arrivalFactor = isAutoSwimming ? 1 : Math.min(1, dist / 140);
  const glideTarget = (isAutoSwimming ? CONFIG.autoGlideSpeed : CONFIG.followGlideSpeed * chaseFactor) * arrivalFactor;
  const thrustForce = (isAutoSwimming ? CONFIG.autoThrust : CONFIG.followThrust * chaseFactor) * arrivalFactor;

  // 추진 가속 후 저항으로 활공 감속
  speed += thrustPulse * thrustForce * 0.14 * dt;
  speed += (glideTarget - speed) * CONFIG.drag * dt;

  let vx = Math.cos(heading) * speed;
  let vy = Math.sin(heading) * speed;

  currentX += vx * dt;
  currentY += vy * dt;

  // 경계 충돌 및 부드러운 반사 처리
  let hitLeft = false, hitRight = false, hitTop = false, hitBottom = false;

  if (currentX <= minX) {
    currentX = minX;
    hitLeft = targetX <= minX || vx < 0;
    if (vx < 0) heading = Math.atan2(vy, Math.abs(vx));
  } else if (currentX >= maxX) {
    currentX = maxX;
    hitRight = targetX >= maxX || vx > 0;
    if (vx > 0) heading = Math.atan2(vy, -Math.abs(vx));
  }

  if (currentY <= minY) {
    currentY = minY;
    hitTop = targetY <= minY || vy < 0;
    if (vy < 0) heading = Math.atan2(Math.abs(vy), vx);
  } else if (currentY >= maxY) {
    currentY = maxY;
    hitBottom = targetY >= maxY || vy > 0;
    if (vy > 0) heading = Math.atan2(-Math.abs(vy), vx);
  }

  const offLeft = updateBounce(bounceLeft, hitLeft, dt);
  const offRight = updateBounce(bounceRight, hitRight, dt);
  const offTop = updateBounce(bounceTop, hitTop, dt);
  const offBottom = updateBounce(bounceBottom, hitBottom, dt);

  if (!isBackgroundMode && isMouseOutside && !isAutoSwimming) {
    if (hitLeft || hitRight || hitTop || hitBottom) {
      hitWallAfterLeave = true;
    }
    const maxBounceVy = Math.max(
      Math.abs(bounceLeft.vy),
      Math.abs(bounceRight.vy),
      Math.abs(bounceTop.vy),
      Math.abs(bounceBottom.vy)
    );
    if (hitWallAfterLeave && maxBounceVy < 1.2) {
      isAutoSwimming = true;
      pickNewAutoTarget(minX, maxX, minY, maxY);
    }
  }

  // 3. 진행 방향 기반 좌우 반전 + 상하 회전(Pitch) 보간
  vx = Math.cos(heading) * speed;
  vy = Math.sin(heading) * speed;

  if (Math.abs(vx) > 0.18) {
    direction = vx > 0 ? 1 : -1;
  }
  currentScaleX += (direction - currentScaleX) * Math.min(1, 0.1 * dt);

  // 속도가 거의 0일 때는 수평(0rad)으로 자연 복귀
  const rawPitch = speed > 0.12 ? Math.atan2(vy, Math.max(Math.abs(vx), 0.35)) : 0;
  const clampedPitch = Math.max(-CONFIG.maxPitch, Math.min(CONFIG.maxPitch, rawPitch));
  currentPitch += (clampedPitch - currentPitch) * Math.min(1, 0.1 * dt);

  const renderX = currentX + offLeft - offRight;
  const renderY = currentY + offTop - offBottom;

  // scaleX 이후 rotate 적용 -> 왼쪽 유영 시에도 배가 뒤집히지 않고 진행 각도 유지
  shark.style.transform = `translate3d(${renderX}px, ${renderY}px, 0) translate(-50%, -50%) scaleX(${currentScaleX}) rotate(${currentPitch}rad)`;

  if (++saveCounter >= 15) {
    saveSharkState();
    saveCounter = 0;
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);