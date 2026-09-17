/* Keep the loading/error UI independent of the 3D engine and modern game syntax. */
(function () {
  'use strict';
  var panel = document.getElementById('boot-panel');
  var status = document.getElementById('boot-status');
  var detail = document.getElementById('boot-detail');
  var failed = false, complete = false, timer;
  var safe = /(?:\?|&)safe=1(?:&|$)/.test(location.search);
  function stage(message) { if (!failed && !complete) status.textContent = message; }
  function fail(message, reason) {
    failed = true;
    clearTimeout(timer);
    panel.hidden = false;
    status.textContent = message || '게임을 시작하지 못했습니다.';
    detail.textContent = reason || '아래의 가벼운 모드 또는 실행 진단을 이용해 주세요.';
    document.getElementById('boot-title').textContent = '실행을 확인해 주세요';
  }
  window.GameBoot = {
    safe: safe, stage: stage, fail: fail,
    ready: function () { if (failed) return; complete = true; clearTimeout(timer); panel.hidden = true; }
  };
  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') {
      fail('게임 파일을 불러오지 못했습니다.', event.target.getAttribute('src'));
    } else if (event.message) {
      fail('게임 실행 중 오류가 발생했습니다.', event.message + (event.lineno ? ' · 줄 ' + event.lineno : ''));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    fail('게임 준비 중 오류가 발생했습니다.', reason && reason.message ? reason.message : String(reason || '알 수 없는 오류'));
  });
  var files = [
    ['vendor/babylon.js', '3D 엔진 다운로드 중…'],
    ['vendor/babylonjs.loaders.min.js', '모델 로더 준비 중…'],
    ['rules.js?v=3.2', '게임 규칙 준비 중…'],
    ['shared/world.js?v=3.2', '공유 전장 준비 중…'],
    ['loot-visuals.js?v=3.2', '아이템 준비 중…'],
    ['controls.js?v=3.2', '모바일 조작 준비 중…'],
    ['online.js?v=3.2', '친구와 플레이 준비 중…'],
    ['environment.js?v=3.2', '전장 재질과 조명 준비 중…'],
    ['game.js?v=3.2', '전장 생성 중…']
  ];
  function load(index) {
    if (failed || index >= files.length) return;
    stage(files[index][1]);
    var script = document.createElement('script');
    script.src = files[index][0];
    script.onload = function () { load(index + 1); };
    script.onerror = function () { fail('게임 파일을 불러오지 못했습니다.', files[index][0]); };
    document.head.appendChild(script);
  }
  // Give Safari a chance to paint the lightweight UI before compiling the engine.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      timer = setTimeout(function () { fail('로딩이 오래 걸리고 있습니다.', status.textContent + ' · 연결을 확인하고 다시 시도해 주세요.'); }, 90000);
      load(0);
    });
  });
})();
