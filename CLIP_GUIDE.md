# 📋 EL Clipboard Canvas 스펙 가이드 (CLIP_GUIDE)

EL Clipboard Canvas는 클립보드에 복사된 이미지를 웹 캔버스에 자유롭게 붙여넣고 배치, 크기 조절, 주석 메모 작성, 다중 정렬 및 병합을 수행할 수 있는 고성능 무한 캔버스 디자인 도구입니다.

---

## 1. 핵심 아키텍처 및 개선 사항

### 1) 무손실 원본 화질 보존 (Lossless Quality)
- **압축 해제:** 기존 JPEG 75% 강제 변환 및 1280px 축소 압축 알고리즘을 전면 제거하였습니다.
- **원본 해상도 유지:** 클립보드 원본 포맷(PNG/JPEG 등)과 픽셀 데이터를 100% 무손실 상태로 보존합니다.
- **초기 뷰포트 적응:** 최초 화면 배치 시 시각적 편의를 위해 뷰포트에 맞게 디스플레이 크기만 조정되며, 원본 픽셀은 그대로 유지되어 확대하거나 원본 크기로 복원 시에도 선명함을 유지합니다.

### 2) IndexedDB 영속성 레이어 도입 및 자동 마이그레이션
- **대용량 로컬 저장소:** 브라우저 내장 IndexedDB(`ClipCanvasDB`, store: `cards`)를 구축하여 브라우저 용량 제한(기존 LocalStorage 5MB 한계)을 극복하고 고화질 이미지를 넉넉하게 보관합니다.
- **안전한 자동 마이그레이션:** 페이지 첫 로드 시 IndexedDB가 비어있으면 기존 `localStorage`의 카드 목록을 조회하여 데이터 유실 없이 자동으로 IndexedDB에 이관합니다.
- **디바운스 동기화:** 잦은 드래그/리사이즈 작업 중 I/O 부하를 방지하기 위해 디바운스(`saveTimeout`) 기반으로 최적화 저장됩니다.

### 3) 레이더 미니맵(Mini-map) & 뷰포트 내비게이션
- **우측 하단 플로팅 레이더:** 전체 캔버스에 분산된 이미지와 메모 카드들의 위치와 크기를 미니어처 박스로 실시간 시각화합니다.
- **뷰파인더(Viewfinder):** 현재 사용자가 보고 있는 화면 영역(Viewport)을 미니맵 상에 반투명 파란색 사각형으로 표시합니다.
- **원클릭 전체 맞춤 (Fit to All Content):**
  - 상단 🔲 아이콘 클릭 시, 캔버스에 흩어진 모든 요소들의 바운딩 박스를 자동 계산하여 한눈에 쏙 들어오도록 줌(`zoom`)과 팬(`panX`, `panY`) 좌표를 자동 조정합니다.
- **미니맵 클릭 & 드래그 탐색:**
  - 미니맵 상의 특정 지점을 클릭하거나 드래그하면 즉시 해당 좌표가 화면 중앙으로 오도록 보드가 부드럽게 이동합니다.
- **줌 레벨 컨트롤러:**
  - `+` (확대), `-` (축소), `100%` (1:1 픽셀 등배율 리셋), 실시간 줌 배율 배지 제공.
  - 미니맵 접기/펼치기 토글 지원.

### 4) 동적 반응형 액션 툴바 (Container Query Responsive Toolbar)
- **카드 크기 연동 자동 스케일링:** CSS Container Queries (`inline-size` & `cqw`) 및 `clamp()`를 도입하여 카드가 아주 작거나 커져도 액션 버튼 크기(`--action-btn-size: clamp(22px, 6cqw, 36px)`)와 아이콘 비율이 유기적으로 자동 조절됩니다.
- **플렉스 툴바 캡슐화 (`.card-action-bar`):** 기존의 하드코딩된 절대 좌표 오프셋을 flex 컨테이너로 구조화하여 메모 카드, 합성 이미지 등 버튼 구성이 달라져도 일관된 간격과 우상단 정렬을 보장합니다.

---

## 2. 주요 기능 및 사용자 인터랙션 명세

| 기능 | 조작 방식 | 설명 |
| :--- | :--- | :--- |
| **이미지 붙여넣기** | `Ctrl + V` 또는 상단 📋 버튼 | 클립보드의 이미지를 손실 없이 즉시 캔버스 중앙에 추가 |
| **캔버스 이동 (Pan)** | `Space + 드래그` 또는 미니맵 클릭 | 무한 캔버스 공간을 자유롭게 이동 |
| **캔버스 줌 (Zoom)** | `마우스 휠` 또는 하단 `+/-` 버튼 | 마우스 커서 중심 15% ~ 600% 무한 줌 인/아웃 |
| **전체 화면 맞춤** | 미니맵 상단 `Fit View` 버튼 | 모든 카드 요소가 한 화면에 들어오도록 줌/위치 자동 정렬 |
| **포스트잇 메모 생성**| 캔버스 빈 영역 `더블 클릭` | 텍스트 입력, 글꼴 크기 변경, 볼드, 투명도 조절 스티커 카드 생성 |
| **요소 다중 선택** | `Shift + 클릭` | 여러 카드를 동시 선택하여 그룹 이동 및 정렬 가능 |
| **다중 정렬 & 병합** | 상단 정렬 툴바 & 🔲 병합 버튼 | 좌/우/상/하/중앙 정렬 및 여러 이미지를 1장의 이미지로 합성 병합 |
| **크기 조절 & 복원** | 모서리/변 핸들 드래그, 속성창 | 종횡비 고정 리사이징 및 ↺ 원본 해상도 원클릭 복원 지원 |
| **작업 실행 취소** | `Ctrl + Z` | 최대 30단계의 작업 이력 Undo 지원 |

---

## 3. 데이터 구조 명세 (IndexedDB)

```typescript
interface CanvasCardItem {
  id: string;               // 카드 고유 ID (예: "card_1695861234567_abc123")
  type: 'image' | 'memo';   // 카드 유형
  left: number;             // 캔버스 X 좌표 (px)
  top: number;              // 캔버스 Y 좌표 (px)
  width: number;            // 카드 너비 (px)
  height: number;           // 카드 높이 (px)
  zIndex: number;           // 레이어 순서
  keepRatio: boolean;       // 종횡비 고정 여부
  src?: string;             // 무손실 Base64 이미지 데이터 (image 타입)
  text?: string;            // HTML 서식 텍스트 내용 (memo 타입)
  opacity?: number;         // 배경 투명도 0~100 (memo 타입)
  mergedSources?: Array<{   // 병합된 합성 이미지 원본 소스 정보
    type: string;
    src?: string;
    text?: string;
    left: number;
    top: number;
    width: number;
    height: number;
    zIndex: number;
  }>;
}
```

---

## 4. 디렉터리 구성

- `d:\AYCWork\color-picker\clip\index.html` : 캔버스 메인 애플리케이션 및 스타일, 로직
- `d:\AYCWork\color-picker\clip\manifest.json` : PWA 매니페스트 설정
- `d:\AYCWork\color-picker\clip\sw.js` : 오프라인 캐싱 및 Service Worker
- `d:\AYCWork\color-picker\CLIP_GUIDE.md` : 본 스펙 가이드 문서
