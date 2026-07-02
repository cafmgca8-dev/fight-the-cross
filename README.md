# 남매사기단 파이트 더 크로스 v2.0

HTML5, CSS3, Vanilla JavaScript, Node.js, Express, Socket.IO 기반의 확장형 멀티플레이 게임 프로젝트입니다.

## 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 확장 규칙

- 새 캐릭터는 `config/characters.json`에 객체를 추가합니다.
- 새 게임 모드는 `config/settings.json`의 `modes` 배열에 등록합니다.
- 상자 보상 확률은 `config/boxes.json`에서 관리합니다.
- 레벨업 비용과 성장률은 `config/settings.json`의 `level`에서 관리합니다.

## 구조

- `client/game`: 캐릭터, 레벨, 상자, 저장, 모드 등 클라이언트 게임 관리 클래스
- `client/scenes`: 메인, 로비, 캐릭터, 상자, 설정 화면
- `client/network`: Socket.IO 이벤트 송수신 분리
- `server`: 방, 플레이어, 게임 시작, 저장, 캐릭터, 상자 관리 클래스
- `config`: 모든 핵심 수치와 콘텐츠 데이터
