# Living Spec: Developer Workspace Suite & Utilities

```mermaid
flowchart TD
    ROOT["Root Landing Hub (index.html)<br/>Developer Suite Launcher"]

    subgraph Tools ["Core Developer Tools (Active)"]
        PICKER["Color Picker (/picker/)<br/>100+ Palettes & Color Manager"]
        CLIP["Image Clip (/clip/)<br/>Capture, Crop & Image Editor"]
        PREVIEW["Markdown Preview (/preview/)<br/>2-Pane, Mermaid v11, 100 FIFO History"]
    end

    subgraph Archived ["Archived / Disabled (URL Access Blocked)"]
        TRIP["_archive/trip/ (404 / Redirect Block)"]
        WG["_archive/wg/ (404 / Redirect Block)"]
    end

    ROOT -->|단축키 1 / Click| PICKER
    ROOT -->|단축키 2 / Click| CLIP
    ROOT -->|단축키 3 / Click| PREVIEW
```

---

## 1. 프로젝트 개요 & 통합 허브 구조
- **목적:** 번들러나 백엔드 서버 없이 브라우저에서 즉시 실행되는 경량 모던 웹 개발 유틸리티 스위트
- **배포:** Vercel, Netlify, GitHub Pages, 로컬 `file:///` 100% 호환 단일 정적 웹 구조
- **진입 경로:**
  1. `index.html` ➔ 통합 런처 대시보드 (Color Picker, Image Clip, Markdown Preview 3대 도구 안내 및 키보드 단축키 1~3 바로가기)
  2. `picker/index.html` ➔ 100개 이상의 체계적인 컬러 팔레트 관리자
  3. `clip/index.html` ➔ 웹 기반 이미지 크롭 & 클리핑 도구
  4. `preview/index.html` ➔ Linear/Notion 스타일 실시간 마크다운 & Mermaid v11 뷰어
  5. `_archive/` ➔ 비활성화된 기존 프로젝트(`trip`, `wg`)를 안전하게 격리 보관 (URL 직접 접근 시 리다이렉트 및 404 차단)

---

## 2. 디자인 시스템 (Linear / Notion Dark Theme)
- **전체 배경:** `#1a1d24` (메인 셸)
- **패널 및 카드 표면:** `#1e212b` (미세 딥네이비 차콜)
- **보더 및 구분선:** `#2d313f` (1px 정돈된 보더)
- **타이포그래피:** Pretendard (UI), JetBrains Mono (코드)

---

## 3. 핵심 도구별 명세

### ① Markdown Preview (`preview/index.html`)
- **2-Pane Split View:** 좌우 드래그 리사이저(20%~80%) 및 에디터 접기/펼치기 토글 (단축키 `Ctrl + B` 지원)
- **공식 Mermaid v11 파이프라인:** markdownlivepreview.com 공식 스펙과 100% 일치하는 `<pre class="mermaid">` 및 비동기 렌더링
- **로컬 이력 관리:** 최대 100건 FIFO 큐, 첫 줄 제목 기반 모달 목록 로드 및 최신순 동기화
- **고해상도 캡처:** 2x Retina PNG 다운로드 및 클립보드 복사
- **코드 리가처 차단:** `!==`, `===` 등 프로그래밍 연산자 원본 1:1 보존

### ② Color Picker (`picker/index.html`)
- 100개 이상의 정돈된 디자인 시스템 컬러 팔레트 라이브러리
- HEX/RGB/HSL 색상 조회 및 원클릭 클립보드 복사

### ③ Image Clip (`clip/index.html`)
- 브라우저 기반 이미지 자르기, 영역 캡처 및 편집 최적화

---

## 4. Changelog
### [2026-10-29] 리사이저 고스트 가이드(Deferred Ghost Mode) 리사이징 구현
- **요약:** 실시간 DOM 리사이징 중 발생하던 깜빡임과 닫힘 버그를 원천 차단하기 위해, 드래그 중에는 예상 위치 가이드 라인(Ghost Guide)만 이동하고 마우스를 놓았을 때 최종 위치로 스냅/확정되는 지연 리사이즈 모드 도입.
- **주요 변경:**
  - 드래그 중 DOM 리플로우 및 실시간 접힘 로직 비활성화, 고스트 라인 커서 추종 및 비율 뱃지 실시간 표시.
  - 좌측 끝(80px/12% 이하) 도달 시 고스트 라인이 붉은색(`놓으면 접힘`)으로 반응하며 피드백 제공.
  - 마우스를 놓는(`pointerup`) 순간 단 1회 최종 위치로 부드럽게 스냅 적용.

### [2026-10-29] 리사이저 드래그 접기/펼치기 UX 전면 개선 (깜빡임 루프 제거 & 부드러운 스냅)
- **요약:** 20% 하한 제한을 해제하여 에디터가 자연스럽게 10%까지 줄어들다 80px 이하에서 부드럽게 스냅 접히도록 개선하고, 접힌 상태에서 우측 드래그 시 즉시 펼쳐지는 무한 깜빡임 루프 버그 해결.
- **주요 변경:**
  - `setSplitRatio`의 고정 20% clamp 제거 (에디터가 더 좁은 폭까지 줄어들도록 허용).
  - 접힘/펼침 시 `transition: width 0.22s, opacity 0.22s` 부드러운 애니메이션 적용.
  - 접힌 상태에서 우측 드래그 시 `isEditorCollapsed = false`로 즉시 상태 전환하여 깜빡임 없이 마우스 위치를 1:1 추종하도록 개선.

### [2026-10-29] 리사이저 바 스마트 오토 접기/펼치기 제스처 구현
- **요약:** 최소 너비(15% 또는 100px) 이하로 좌측 드래그 시 에디터 자동 접힘 처리 및 접힌 상태에서 리사이저 클릭/우측 드래그 시 자동 펼침 제스처 추가.
- **주요 변경:**
  - `setEditorCollapse(true)` 시에도 리사이저 바를 좌측 끝에 유지하여 시각적 힌트 제공.
  - 마우스 드래그 임계값 감지(좌측 끝 도달 시 자동 접기, 접힌 상태에서 우측 드래그 시 자동 복귀) 및 단순 클릭 시 5:5 복귀 기능 탑재.

### [2026-10-29] 마크다운 모바일 뷰 탭 전환 시 높이 계산 및 스크롤 단절 버그 픽스
- **요약:** 모바일 화면(<768px)에서 Editor에 긴 마크다운을 붙여넣고 Preview 탭으로 전환했을 때 컨테이너 높이가 붕괴되어 스크롤이 생기지 않고 잘리던 문제 해결.
- **주요 변경:**
  - `#pane-preview`에 `min-h-0` 추가 및 모바일 탭 전환 핸들러(`setupMobileTabs`)에서 `flex` 클래스를 명시적으로 토글하도록 개선 (`display: block` 폴백 방지).
  - `#preview-scroll-container`에 `min-h-0` 및 `-webkit-overflow-scrolling: touch;`를 부여하여 모바일 기기 네이티브 가속 스크롤 활성화.

### [2026-10-29] 에디터 접기/펼치기 토글 단축키(Ctrl + B) 적용
- **요약:** 에디터 패널을 키보드 단축키 `Ctrl + B` (Mac: `Cmd + B`)로 즉시 접고 펼칠 수 있도록 전역 키 이벤트 바인딩 및 툴팁 힌트 추가.
- **주요 변경:**
  - `window.addEventListener('keydown')`에 `Ctrl + B` 단축키 및 브라우저 북마크바 충돌 방지(`e.preventDefault()`) 적용.
  - 상단 접기 버튼 툴팁 및 배지에 `Ctrl+B` 표기.

### [2026-10-29] 프로젝트 구조 전면 개편 (3대 도구 런처 허브 구축 및 trip/wg 아카이브)
- **요약:** 루트의 Color Manager를 `picker/`로 이동하고, 루트(`index.html`)를 3대 도구(Color Picker, Image Clip, Markdown Preview) 런처 대시보드로 신규 구축. 미사용 프로젝트(`trip`, `wg`)는 `_archive/`로 안전 격리하여 URL 접근 원천 차단.
- **주요 변경:**
  - `picker/index.html` 신규 생성 및 기존 색상 매니저 이전 (`/picker/` 경로).
  - 루트 `index.html`을 Linear 다크 테마 기반 3대 핵심 도구 런처로 신규 개발 (키보드 단축키 1, 2, 3 지원).
  - `trip/`, `wg/`를 `_archive/`로 이동 및 접속 시 즉시 루트 리다이렉트 가드 주입 (URL 접근 원천 봉쇄).

### [2026-10-29] 마크다운 이력 관리(FIFO 100건) 및 이력 불러오기 모달 구현
- **요약:** 로컬스토리지 기반으로 작성/열람한 마크다운을 최대 100건까지 FIFO 큐로 자동 누적 저장하고, 상단 '이력 불러오기' 버튼을 통해 첫 줄 제목 기반 리스트에서 선택 로드 및 최신순 동기화 기능 추가.
