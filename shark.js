const shark = document.getElementById('shark');
const brand = document.querySelector('.brand');
const isBackgroundMode = shark.dataset.mode === 'background';
const STORAGE_KEY = 'shark_shared_state';

let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;
let targetX = currentX;
let targetY = currentY;
let rawMouseX = currentX;
let rawMouseY = currentY;

let direction = 1;      // 목표 방향 (1: 오른쪽, -1: 왼쪽)
let currentScaleX = 1;  // 실제 렌더링 방향 (부드러운 회전용)

const followSpeed = 0.0085; // 최대 추적 속도
const autoSpeed = 0.007;    // 자율 유영 속도
const topMargin = 6;
const edgeMargin = 12;

let isMouseOutside = false;
let hitWallAfterLeave = false;
let isAutoSwimming = true;
let autoTimer = 0;

// 반응 지연 및 가속 제어 변수
let noticeTimer = 0;   // 포인터 인지 후 회전 대기 프레임
let chaseFactor = 0;   // 0에서 1로 서서히 올라가는 출발 가속도

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
    direction = state.direction ?? direction;
    currentScaleX = direction;
    autoTimer = state.autoTimer ?? 0;
  } catch (e) {}
}

const bounceTop = { hit: false, offset: 0, vy: 0 };
const bounceBottom = { hit: false, offset: 0, vy: 0 };
const bounceLeft = { hit: false, offset: 0, vy: 0 };
const bounceRight = { hit: false, offset: 0, vy: 0 };

function updateBounce(b, isAtEdge) {
  if (isAtEdge) {
    if (!b.hit) {
      b.hit = true;
      b.vy = 6.0;
    }
  } else {
    b.hit = false;
  }

  if (b.offset > 0 || b.vy > 0) {
    b.offset += b.vy;
    b.vy -= 0.32;
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
  const padX = Math.min(80, (maxX - minX) / 4);
  const padY = Math.min(60, (maxY - minY) / 4);
  targetX = minX + padX + Math.random() * Math.max(0, maxX - minX - padX * 2);
  targetY = minY + padY + Math.random() * Math.max(0, maxY - minY - padY * 2);
  autoTimer = 180 + Math.floor(Math.random() * 140);
}

function onPointerMove(x, y) {
  rawMouseX = x;
  rawMouseY = y;
  isMouseOutside = false;
  hitWallAfterLeave = false;

  if (isAutoSwimming) {
    isAutoSwimming = false;
    noticeTimer = 18;
    chaseFactor = 0;
  }
}

if (!isBackgroundMode) {
  // 데스크톱 마우스 추적
  window.addEventListener('mousemove', (e) => {
    onPointerMove(e.clientX, e.clientY);
  });

  document.addEventListener('mouseleave', (e) => {
    isMouseOutside = true;
    hitWallAfterLeave = false;
    rawMouseX = e.clientX;
    rawMouseY = e.clientY;
    targetX = e.clientX;
    targetY = e.clientY;
  });

  // 모바일 터치(탭) 및 드래그 추적
  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 0) {
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true }
  );
}

function saveSharkState() {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      currentX,
      currentY,
      targetX,
      targetY,
      direction,
      autoTimer
    })
  );
}

window.addEventListener('pagehide', saveSharkState);

function animate() {
  const isMobile = window.innerWidth <= 768;
  const halfW = (shark.offsetWidth / 2) || (isMobile ? 50 : 100);
  const halfH = (shark.offsetHeight / 2) || (isMobile ? 25 : 50);

  const textBottom = brand ? brand.getBoundingClientRect().bottom : 0;
  const minX = halfW + edgeMargin;
  const maxX = Math.max(minX, window.innerWidth - halfW - edgeMargin);
  const minY = isBackgroundMode ? (halfH + edgeMargin) : (textBottom + halfH + topMargin);
  const maxY = Math.max(minY, window.innerHeight - halfH - edgeMargin);

  if (isAutoSwimming) {
    if (autoTimer <= 0 || Math.hypot(targetX - currentX, targetY - currentY) < 30) {
      pickNewAutoTarget(minX, maxX, minY, maxY);
    }
    autoTimer--;
  } else if (!isMouseOutside) {
    targetX += (rawMouseX - targetX) * 0.04;
    targetY += (rawMouseY - targetY) * 0.04;
  }

  const clampedX = Math.max(minX, Math.min(maxX, targetX));
  const clampedY = Math.max(minY, Math.min(maxY, targetY));

  const dx = clampedX - currentX;
  const dy = clampedY - currentY;

  const desiredDir = dx > 8 ? 1 : (dx < -8 ? -1 : direction);

  if (!isAutoSwimming) {
    if (noticeTimer > 0) {
      noticeTimer--;
    } else {
      if (desiredDir !== direction) {
        direction = desiredDir;
        chaseFactor = 0;
      }
      const isTurning = Math.abs(direction - currentScaleX) > 0.25;
      if (!isTurning) {
        chaseFactor = Math.min(1, chaseFactor + 0.012);
      }
    }
  } else {
    direction = desiredDir;
  }

  currentScaleX += (direction - currentScaleX) * 0.1;

  const activeSpeed = isAutoSwimming ? autoSpeed : (followSpeed * chaseFactor);

  currentX += dx * activeSpeed;
  currentY += dy * activeSpeed;

  const hitLeft = currentX <= minX + 1 && targetX <= minX;
  const hitRight = currentX >= maxX - 1 && targetX >= maxX;
  const hitTop = currentY <= minY + 1 && targetY <= minY;
  const hitBottom = currentY >= maxY - 1 && targetY >= maxY;

  const offLeft = updateBounce(bounceLeft, hitLeft);
  const offRight = updateBounce(bounceRight, hitRight);
  const offTop = updateBounce(bounceTop, hitTop);
  const offBottom = updateBounce(bounceBottom, hitBottom);

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

  const renderX = currentX + offLeft - offRight;
  const renderY = currentY + offTop - offBottom;

  shark.style.transform = `translate3d(${renderX}px, ${renderY}px, 0) translate(-50%, -50%) scaleX(${currentScaleX})`;

  saveSharkState();
  requestAnimationFrame(animate);
}

animate();