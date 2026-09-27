# 공식 자료 및 확인 범위

확인 날짜: 2026-09-27.

- [Google generateContent API](https://ai.google.dev/api/generate-content): REST generateContent, systemInstruction, generationConfig 및 구조화 출력 스키마. 실제 키/모델 호출 미검증.
- [OpenAI 텍스트 생성](https://developers.openai.com/api/docs/guides/text): Responses API 입력·출력 구조.
- [OpenAI 구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs): text.format JSON schema. 실제 키/선택 모델의 지원 여부는 화면 연결 시험에서 확인 필요.
- [Meta 공식 Threads API 컬렉션](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api): OAuth, 컨테이너 생성/게시, 자기 답글 reply_to_id, 미디어 URL, 상태 및 사용량 조회 예시. 이번 환경의 문서 렌더링 제약으로 모든 항목의 현행 세부값을 재검증하지 못함. 어댑터의 실제 OAuth/권한/필드 응답은 미확인.

제휴 프로그램이 지정되지 않았으므로 프로그램별 링크 사용·매체 등록·미디어 권리·광고 문구 적합성은 미확인이다. 프로그램은 운영자가 확인한 정책 URL과 문구를 저장하며 법적 적합성을 자동 보증하지 않는다. 본문 첫 광고 표시와 답글 고지는 필수 조건으로 구현했다.

Threads 텍스트 검사 500자는 현재 보수적 구현값이다. 이미지/영상 규격, 캐러셀, 운영 모드 앱 심사, 세부 권한, 통계 필드는 실제 계정으로 추가 검증해야 한다. 특정 모델의 무료 한도·가격을 고정해 주장하지 않으며 공급자 콘솔에서 확인해야 한다.

- [Codex 인증](https://learn.chatgpt.com/docs/auth): ChatGPT 로그인은 구독 접근, API 키 로그인은 사용량 과금. 
- [Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode): exec의 저장된 인증 사용과 output-schema 출력 지원. 이 앱은 로컬 개인용 공식 CLI 호출을 사용한다.

