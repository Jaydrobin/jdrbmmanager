/* 배포별 설정 (선택, DECISIONS.md D-026)
   고치지 않으면 index.html에 들어 있는 기본 Firebase 프로젝트를 쓴다.
   - 자기 Firebase 프로젝트를 쓰려면: 아래 주석을 풀고 Firebase 콘솔의 firebaseConfig 객체 안의 값만 옮긴다.
     (콘솔의 코드를 통째로 붙여 넣으면 import 줄 때문에 동작하지 않는다.)
   - 로그인 없이 로컬 모드로만 쓰려면: window.APP_CONFIG = { firebase: null };
   window.APP_CONFIG에 값을 넣는 것 말고 다른 선언(const, let, function 등)을 추가하지 않는다.
   index.html의 이름과 겹치면 앱 스크립트 전체가 멈춘다. */

// window.APP_CONFIG = {
//   firebase: {
//     apiKey: '...',
//     authDomain: '...',
//     projectId: '...',
//     storageBucket: '...',
//     messagingSenderId: '...',
//     appId: '...'
//   }
// };
