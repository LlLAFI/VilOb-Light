# VILOB LIGHT V0.8F — GitHub Pages 간편 배포본

## 배포 구성 (폴더 없음)
- index.html: 게임 진입점 (약 76 KB)
- style.css: CSS (약 102 KB)
- editor.html: 별도 맵 에디터 (약 19 KB)
- part-01.js ~ part-10.js: 게임 엔진, 원본 순서대로 분리 (각 약 65~278 KB)

원래 V0.8F 실행 HTML의 JavaScript 소스를 10개 청크로 나누었습니다. 합친 JavaScript의 SHA-256 해시는 원본과 동일합니다. **게임 규칙·전투 수치·저장 형식을 변경하지 않았습니다.**

## 웹 업로드 방법
1. ZIP을 *압축 해제*합니다. GitHub에 ZIP만 올려서는 Pages가 자동으로 압축을 풀지 않습니다.
2. GitHub에서 현재 Pages 배포 대상으로 설정된 브랜치/폴더(보통 main의 최상위)를 엽니다.
3. `Add file` → `Upload files`로 `index.html`, `style.css`, `editor.html`, `part-01.js`부터 `part-10.js`까지 **모든 파일을 같은 폴더에 업로드**합니다.
4. 업로드 진행 표시가 완전히 끝난 뒤에만 `Commit changes`를 누릅니다.
5. 저장소 파일 목록에서 `index.html`이 약 76KB, `part-XX.js`가 65~278KB인지 확인합니다. 0B인 경우는 배포 문제가 아니라 GitHub에 저장된 파일 자체가 비어 있는 것이므로 다시 업로드해야 합니다.
6. Settings → Pages에서 배포 브랜치/폴더를 확인하고, Actions 탭에서 Pages 배포 성공 여부를 확인합니다. 사이트가 옛 버전을 보이면 강력 새로고침을 합니다.

## 주의
- 단일 HTML과 달리, 이 버전은 여러 파일에 의존하므로 **하나라도 빠지면 동작하지 않습니다**.
- 오류가 계속 나면 GitHub에서 실제 0바이트로 보이는 파일의 이름과, 업로드가 웹 UI/모바일/PC/GitHub Desktop 중 어떤 방식인지 알려 주세요.
- 이 분할판은 파일을 하나만 열어 오프라인 실행하기보다 GitHub Pages 또는 로컬 웹 서버에서 실행하는 용도입니다.

## 검증
- JS 10개 각각 Node.js 문법 검사: PASS
- JS 10개 연결 SHA-256 == 원본 실행 HTML 내 JS SHA-256: PASS
- index.html의 모든 JS 상대경로 존재: PASS
- ZIP 압축 테스트: PASS
- 실제 GitHub 원격 배포·브라우저 화면: 미검증
