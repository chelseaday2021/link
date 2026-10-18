const entryView = document.querySelector('#entryView');
const roomView = document.querySelector('#roomView');
const studentForm = document.querySelector('#studentForm');
const teacherForm = document.querySelector('#teacherForm');
const entryError = document.querySelector('#entryError');
const roomError = document.querySelector('#roomError');
const connectionPill = document.querySelector('.connection-pill');
const connectionText = document.querySelector('#connectionText');
let activeRouteRole = ['/student', '/student/'].includes(location.pathname) ? 'student' : ['/teacher', '/teacher/'].includes(location.pathname) ? 'teacher' : null;
let socket;
let reconnectTimer;
let reconnectDelay = 800;
let reconnecting = false;
let session = null;
let roomState = null;
let selectedMode = 'student';
let answerResult = null;
let hasSentResume = false;
let teacherSortBy = 'score';
let teacherQuestions = [];
let questionManagerOpen = false;
let renderedRevealCount = -1;
let questionManagerInitialized = false;
let scoreChanges = new Map();
const lastKnownScores = new Map();
let stealPending = false;
let stealNotice = '';
let selectedStealTargetId = '';
let studentQuestionPending = false;
let studentQuestionStatus = '';

function clientId() {
  let id = localStorage.getItem('reviewClientId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('reviewClientId', id);
  }
  return id;
}

function setConnection(connected) {
  connectionPill.classList.toggle('connected', connected);
  connectionText.textContent = connected ? '실시간 연결됨' : '다시 연결 중';
}

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/live`);
  socket.addEventListener('open', () => {
    setConnection(true);
    reconnectDelay = 800;
    hasSentResume = false;
    if (session) {
      send({ type: 'resume', ...session, clientId: clientId() });
      hasSentResume = true;
    }
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'state') {
      if (roomState && roomState.questionNumber !== message.state.questionNumber) {
        answerResult = null;
        const answerInput = document.querySelector('#answerInput');
        if (answerInput) answerInput.value = '';
      }
      roomState = message.state;
      if (!activeRouteRole && roomState.role) applyRoleRoute(roomState.role);
      if (roomState.role === 'teacher' && roomState.status === 'lobby' && !questionManagerInitialized) {
        questionManagerInitialized = true;
        questionManagerOpen = true;
        send({ type: 'getQuestions' });
      }
      if (session) {
        session.roomCode = roomState.roomCode;
        session.role = roomState.role;
        localStorage.setItem('reviewSession', JSON.stringify(session));
      }
      renderRoom();
    }
    if (message.type === 'answerResult') {
      answerResult = message;
      if (message.stealAwarded) stealNotice = '정답 보너스! 점수 빼앗기 특권을 얻었어요.';
      renderRoom();
    }
    if (message.type === 'stealResult') {
      stealPending = false;
      stealNotice = `${message.targetName}에게서 ${formatScore(message.amount)}점을 가져왔어요!`;
      renderRoom();
    }
    if (message.type === 'questionSubmissionResult') {
      studentQuestionPending = false;
      studentQuestionStatus = message.notice;
      document.querySelector('#studentQuestionForm').reset();
      configureStudentQuestionForm();
      renderRoom();
    }
    if (message.type === 'questionSubmissionUpdate') {
      studentQuestionStatus = message.notice;
      renderRoom();
    }
    if (message.type === 'questionCatalog') {
      teacherQuestions = message.questions;
      if (message.resetForm) {
        const subject = document.querySelector('#customSubject').value;
        const difficulty = document.querySelector('#customDifficulty').value;
        document.querySelector('#customQuestionForm').reset();
        document.querySelector('#customSubject').value = subject;
        document.querySelector('#customDifficulty').value = difficulty;
        document.querySelector('#editQuestionId').value = '';
        document.querySelector('#customFormHeading').textContent = '문제 직접 추가';
        document.querySelector('#saveQuestionButton').innerHTML = '문제 추가하기 <span>＋</span>';
        document.querySelector('#cancelQuestionEdit').classList.add('hidden');
      }
      document.querySelector('#questionManagerMessage').textContent = message.notice || '';
      renderQuestionCatalog();
    }
    if (message.type === 'error') {
      if (studentQuestionPending) {
        studentQuestionPending = false;
        studentQuestionStatus = message.message;
        renderRoom();
        return;
      }
      if (stealPending) {
        stealPending = false;
        stealNotice = message.message;
        renderRoom();
        return;
      }
      const isSessionError = hasSentResume && !roomState;
      if (isSessionError) {
        session = null;
        localStorage.removeItem('reviewSession');
        entryView.classList.remove('hidden');
        roomView.classList.add('hidden');
      }
      if (roomState && questionManagerOpen) document.querySelector('#questionManagerMessage').textContent = message.message;
      else (roomState ? roomError : entryError).textContent = message.message;
    }
  });
  socket.addEventListener('close', () => {
    setConnection(false);
    reconnecting = true;
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.7, 8000);
  });
  socket.addEventListener('error', () => socket.close());
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function setMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  studentForm.classList.toggle('hidden', mode !== 'student');
  teacherForm.classList.toggle('hidden', mode !== 'teacher');
  entryError.textContent = '';
}

function applyRoleRoute(role) {
  activeRouteRole = role;
  const targetPath = `/${role}`;
  if (location.pathname !== targetPath) history.replaceState(null, '', `${targetPath}${location.search}`);
  setMode(role);
  document.querySelector('#modeTabs').classList.add('hidden');
  document.querySelector('#routeBadge').textContent = role === 'teacher' ? '선생님 관리' : '학생 입장';
  document.querySelector('#routeBadge').classList.remove('hidden');
  document.querySelector('.brand').href = targetPath;
  document.title = role === 'teacher' ? '같이풀자! | 선생님 관리' : '같이풀자! | 학생 입장';
  if (role === 'student') {
    const code = new URLSearchParams(location.search).get('code');
    if (code) document.querySelector('#roomCode').value = code.replace(/\D/g, '').slice(0, 6);
  }
}

document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

studentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  entryError.textContent = '';
  const name = document.querySelector('#studentName').value.trim();
  const roomCode = document.querySelector('#roomCode').value.replace(/\D/g, '').slice(0, 6);
  if (roomCode.length !== 6) {
    entryError.textContent = '교실 코드는 숫자 6자리로 입력해 주세요.';
    return;
  }
  if (socket?.readyState !== WebSocket.OPEN) {
    entryError.textContent = '연결을 확인하고 있어요. 잠시 후 다시 눌러주세요.';
    return;
  }
  applyRoleRoute('student');
  lastKnownScores.clear();
  scoreChanges.clear();
  stealNotice = '';
  stealPending = false;
  selectedStealTargetId = '';
  studentQuestionStatus = '';
  studentQuestionPending = false;
  session = { role: 'student', roomCode, name };
  send({ type: 'join', ...session, clientId: clientId() });
});

teacherForm.addEventListener('submit', (event) => {
  event.preventDefault();
  entryError.textContent = '';
  if (socket?.readyState !== WebSocket.OPEN) {
    entryError.textContent = '연결을 확인하고 있어요. 잠시 후 다시 눌러주세요.';
    return;
  }
  const name = document.querySelector('#teacherName').value.trim();
  applyRoleRoute('teacher');
  lastKnownScores.clear();
  scoreChanges.clear();
  stealNotice = '';
  stealPending = false;
  selectedStealTargetId = '';
  session = { role: 'teacher', name };
  questionManagerInitialized = false;
  send({ type: 'create', ...session, clientId: clientId(), subject: document.querySelector('#subjectSelect').value, difficulty: document.querySelector('#difficultySelect').value });
});

document.querySelector('#roomCode').addEventListener('input', (event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6); });
document.querySelector('#answerForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = document.querySelector('#answerInput').value.trim();
  if (text) send({ type: 'answer', text });
});
document.querySelector('#startButton').addEventListener('click', () => send({ type: 'start' }));
document.querySelector('#teacherStopLiveButton').addEventListener('click', () => send({ type: 'stop' }));
document.querySelector('#finalRevealButton').addEventListener('click', () => send({ type: 'revealNextRank' }));
document.querySelector('#stealButton').addEventListener('click', () => {
  const targetId = document.querySelector('#stealTarget').value;
  if (!targetId || stealPending) return;
  stealPending = true;
  stealNotice = '보석 특권을 사용하고 있어요...';
  renderStealPanel();
  send({ type: 'stealPoints', targetId });
});
document.querySelector('#stealTarget').addEventListener('change', (event) => { selectedStealTargetId = event.target.value; });
document.querySelector('#teacherSortSelect').addEventListener('change', (event) => {
  teacherSortBy = event.target.value;
  if (roomState?.role === 'teacher') renderTeacherDashboard();
});
document.querySelector('#manageQuestionsButton').addEventListener('click', () => {
  questionManagerOpen = !questionManagerOpen;
  document.querySelector('#questionManager').classList.toggle('hidden', !questionManagerOpen);
  document.querySelector('#manageQuestionsButton').textContent = questionManagerOpen ? '문제 관리 닫기' : '문제은행 구성';
  if (questionManagerOpen) {
    document.querySelector('#questionManagerMessage').textContent = '';
    prepareQuestionForm();
    send({ type: 'getQuestions' });
  }
});
document.querySelector('#closeQuestionsButton').addEventListener('click', () => {
  questionManagerOpen = false;
  document.querySelector('#questionManager').classList.add('hidden');
  document.querySelector('#manageQuestionsButton').textContent = '문제은행 구성';
});
document.querySelector('#customQuestionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('#questionManagerMessage').textContent = '';
  const id = document.querySelector('#editQuestionId').value;
  send({
    type: id ? 'editQuestion' : 'addQuestion',
    id,
    subject: document.querySelector('#customSubject').value,
    difficulty: document.querySelector('#customDifficulty').value,
    text: document.querySelector('#customQuestionText').value.trim(),
    answer: document.querySelector('#customQuestionAnswer').value.trim(),
    explanation: document.querySelector('#customQuestionExplanation').value.trim(),
  });
});
document.querySelector('#studentQuestionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  studentQuestionPending = true;
  studentQuestionStatus = '문제를 선생님께 보내고 있어요...';
  renderStudentQuestionPanel();
  send({
    type: 'submitQuestion',
    subject: document.querySelector('#studentQuestionSubject').value,
    difficulty: document.querySelector('#studentQuestionDifficulty').value,
    text: document.querySelector('#studentQuestionText').value.trim(),
    answer: document.querySelector('#studentQuestionAnswer').value.trim(),
    explanation: document.querySelector('#studentQuestionExplanation').value.trim(),
  });
});
document.querySelector('#cancelQuestionEdit').addEventListener('click', cancelQuestionEdit);
document.querySelector('#selectAllQuestions').addEventListener('click', () => {
  send({ type: 'setQuestionSelection', ids: teacherQuestions.map((question) => question.id) });
});
document.querySelector('#clearQuestionSelection').addEventListener('click', () => {
  send({ type: 'setQuestionSelection', ids: [] });
});
document.querySelector('#pendingQuestionList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-moderate-question]');
  if (!button) return;
  const messageType = button.dataset.action === 'approve' ? 'approveStudentQuestion' : 'rejectStudentQuestion';
  send({ type: messageType, id: button.dataset.moderateQuestion });
});
document.querySelector('#copyCodeButton').addEventListener('click', async () => {
  if (!roomState) return;
  try {
    await navigator.clipboard.writeText(roomState.roomCode);
    document.querySelector('#copyCodeButton').textContent = '복사했어요!';
    setTimeout(() => { document.querySelector('#copyCodeButton').textContent = '코드 복사'; }, 1600);
  } catch {
    document.querySelector('#copyCodeButton').textContent = roomState.roomCode;
  }
});
document.querySelector('#copyStudentLinkButton').addEventListener('click', async () => {
  if (!roomState) return;
  const link = `${location.origin}/student?code=${encodeURIComponent(roomState.roomCode)}`;
  try {
    await navigator.clipboard.writeText(link);
    document.querySelector('#copyStudentLinkButton').textContent = '초대 링크 복사 완료';
    setTimeout(() => { document.querySelector('#copyStudentLinkButton').textContent = '학생 링크 복사'; }, 1600);
  } catch {
    document.querySelector('#copyStudentLinkButton').textContent = link;
  }
});
document.querySelector('#backButton').addEventListener('click', () => {
  session = null;
  roomState = null;
  answerResult = null;
  lastKnownScores.clear();
  scoreChanges.clear();
  stealNotice = '';
  stealPending = false;
  selectedStealTargetId = '';
  localStorage.removeItem('reviewSession');
  questionManagerOpen = false;
  questionManagerInitialized = false;
  entryView.classList.remove('hidden');
  roomView.classList.add('hidden');
});

function renderLeaderboard() {
  const players = roomState.players;
  scoreChanges = new Map(players.map((player) => {
    const previousScore = lastKnownScores.get(player.id);
    lastKnownScores.set(player.id, player.score);
    return [player.id, previousScore === undefined ? 0 : Math.round((player.score - previousScore) * 10) / 10];
  }));
  document.querySelector('#playerCount').textContent = `${players.length}명`;
  document.querySelector('#emptyPlayers').classList.toggle('hidden', players.length > 0);
  document.querySelector('#leaderboard').innerHTML = players.map((player, index) => {
    const rankClass = index < 3 ? `rank-${index + 1}` : '';
    const streakText = player.streak > 0 ? `${player.streak}연속 정답` : player.online ? '참여 중' : '나감';
    const score = Number.isInteger(player.score) ? player.score : player.score.toFixed(1);
    return `<div class="player-row"><span class="rank-number ${rankClass}">${index + 1}</span><div><div class="player-name">${escapeHtml(player.name)} ${player.online ? '' : '<span class="offline-mark">· 오프라인</span>'}</div><div class="player-details">${streakText}${player.answered ? ' · 답 제출 완료' : ''}</div></div><span class="player-score-wrap">${gemMarkup(player.score, scoreChanges.get(player.id))}<span class="player-score">${score}<small> 점</small></span></span></div>`;
  }).join('');
}

function gemMarkup(score, change = 0) {
  const tier = score >= 50 ? 'diamond' : score >= 35 ? 'ruby' : score >= 20 ? 'sapphire' : score >= 10 ? 'emerald' : 'amber';
  const label = { amber: '호박 보석', emerald: '에메랄드', sapphire: '사파이어', ruby: '루비', diamond: '다이아몬드' }[tier];
  const burst = change ? `<i class="gem-fragment fragment-one"></i><i class="gem-fragment fragment-two"></i><i class="gem-fragment fragment-three"></i><span class="gem-score-change">${change > 0 ? '+' : ''}${formatScore(change)}</span>` : '';
  return `<span class="gem-display gem-${tier} ${change > 0 ? 'gem-pop' : change < 0 ? 'gem-drop' : ''}" title="${label}"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m4 11 6-7h12l6 7-12 18L4 11Z"/><path d="M4 11h24M10 4l3 7 3 18 3-18 3-7"/></svg>${burst}</span>`;
}

function renderStealPanel() {
  const tokens = roomState.myStealTokens || 0;
  const selfId = clientId();
  const targets = roomState.players.filter((player) => player.id !== selfId && player.online && player.score > 0);
  const select = document.querySelector('#stealTarget');
  document.querySelector('#powerTokenCount').textContent = `${tokens}개`;
  document.querySelector('#powerControls').classList.toggle('hidden', !tokens || !targets.length);
  document.querySelector('#powerHint').textContent = !tokens
    ? '정답을 맞히면 15% 확률로 특권을 얻어요.'
    : targets.length ? `친구 한 명에게서 최대 2점을 가져올 수 있어요. 특권 ${tokens}개 보유 중!`
      : '특권을 보유했어요. 점수를 가진 친구가 생기면 사용할 수 있어요.';
  select.innerHTML = targets.map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)} · ${formatScore(player.score)}점</option>`).join('');
  if (targets.some((player) => player.id === selectedStealTargetId)) select.value = selectedStealTargetId;
  else selectedStealTargetId = select.value;
  document.querySelector('#stealButton').disabled = stealPending || !tokens || !targets.length;
  document.querySelector('#powerMessage').textContent = stealNotice;
}

function renderTeacherDashboard() {
  const players = roomState.players;
  const answeredCount = players.reduce((sum, player) => sum + player.answeredCount, 0);
  const correctCount = players.reduce((sum, player) => sum + player.correctCount, 0);
  const overallAccuracy = answeredCount ? (correctCount / answeredCount) * 100 : 0;
  document.querySelector('#teacherOnlineCount').textContent = `${players.filter((player) => player.online).length}/${players.length}명 접속`;
  document.querySelector('#teacherSolvedCount').textContent = answeredCount;
  document.querySelector('#teacherCorrectCount').textContent = correctCount;
  document.querySelector('#teacherAccuracy').textContent = `${overallAccuracy.toFixed(1)}%`;
  document.querySelector('#teacherQuestionNumber').textContent = `${players.filter((player) => player.online && player.questionNumber > 0 && !player.answered).length}명`;

  const sorted = [...players].sort((a, b) => teacherSortBy === 'accuracy'
    ? b.accuracy - a.accuracy || b.score - a.score || a.name.localeCompare(b.name, 'ko')
    : b.score - a.score || b.accuracy - a.accuracy || a.name.localeCompare(b.name, 'ko'));
  document.querySelector('#teacherRankRows').innerHTML = sorted.map((player, index) => {
    const score = formatScore(player.score);
    const accuracy = player.answeredCount ? `${player.accuracy.toFixed(1)}%` : '—';
    return `<tr><td><span class="table-rank rank-${Math.min(index + 1, 3)}">${index + 1}</span></td><td><span class="table-player-name">${escapeHtml(player.name)}</span>${player.online ? '' : '<span class="table-offline">오프라인</span>'}</td><td class="table-score"><span class="table-score-cell">${gemMarkup(player.score, scoreChanges.get(player.id))}${score}</span></td><td>${player.answeredCount}</td><td>${player.correctCount}</td><td><span class="accuracy-value">${accuracy}</span></td></tr>`;
  }).join('');
  document.querySelector('#emptyTeacherRows').classList.toggle('hidden', players.length > 0);

}

function renderTeacherLive() {
  const players = roomState.players;
  const working = players.filter((player) => player.online && player.questionNumber > 0 && !player.answered).length;
  const solved = players.reduce((sum, player) => sum + player.answeredCount, 0);
  document.querySelector('#teacherLiveWorkingCount').textContent = `${working}명`;
  document.querySelector('#teacherLiveSolvedCount').textContent = `${solved}개`;
}

function renderQuestionCatalog() {
  const list = document.querySelector('#questionList');
  const canManage = roomState.status === 'lobby';
  const selectedCount = teacherQuestions.filter((question) => question.selected).length;
  document.querySelector('#questionCatalogCount').textContent = `${teacherQuestions.length}문제`;
  document.querySelector('#questionSelectionSummary').textContent = `${selectedCount} / ${teacherQuestions.length}개 선택됨`;
  document.querySelector('#selectAllQuestions').disabled = !canManage;
  document.querySelector('#clearQuestionSelection').disabled = !canManage;
  document.querySelector('#emptyQuestionList').classList.toggle('hidden', teacherQuestions.length > 0);
  list.innerHTML = teacherQuestions.map((question, index) => `<article class="catalog-question ${question.selected ? 'question-selected' : ''}"><div class="catalog-meta"><label class="question-choice"><input type="checkbox" data-select-question="${escapeHtml(question.id)}" ${question.selected ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>출제</span></label><span class="catalog-number">${index + 1}</span><span class="catalog-tag ${question.subject === '수학' ? 'math' : 'social'}">${question.subject}</span><span class="catalog-tag ${question.difficulty === '어려움' ? 'hard' : ''}">${question.difficulty}</span>${question.custom ? '<span class="catalog-custom-tag">직접 추가</span>' : ''}</div><h4>${escapeHtml(question.text)}</h4><p class="catalog-answer"><span>정답</span>${escapeHtml(question.answer)}</p><p class="catalog-explanation">${escapeHtml(question.explanation)}</p>${canManage ? `<div class="catalog-actions"><button class="catalog-edit" type="button" data-edit-question="${escapeHtml(question.id)}">수정</button><button class="catalog-delete" type="button" data-delete-question="${escapeHtml(question.id)}">삭제</button></div>` : ''}</article>`).join('');
  list.querySelectorAll('[data-select-question]').forEach((checkbox) => checkbox.addEventListener('change', () => {
    const ids = [...list.querySelectorAll('[data-select-question]:checked')].map((input) => input.dataset.selectQuestion);
    send({ type: 'setQuestionSelection', ids });
  }));
  list.querySelectorAll('[data-edit-question]').forEach((button) => button.addEventListener('click', () => {
    const question = teacherQuestions.find((item) => item.id === button.dataset.editQuestion);
    if (question) beginQuestionEdit(question);
  }));
  list.querySelectorAll('[data-delete-question]').forEach((button) => button.addEventListener('click', () => {
    if (window.confirm('이 문제를 이번 교실 출제 목록에서 삭제할까요?')) {
      document.querySelector('#questionManagerMessage').textContent = '';
      send({ type: 'deleteQuestion', id: button.dataset.deleteQuestion });
    }
  }));
}

function beginQuestionEdit(question) {
  document.querySelector('#editQuestionId').value = question.id;
  document.querySelector('#customFormHeading').textContent = '문제 수정';
  document.querySelector('#customSubject').value = question.subject;
  document.querySelector('#customDifficulty').value = question.difficulty;
  document.querySelector('#customQuestionText').value = question.text;
  document.querySelector('#customQuestionAnswer').value = question.answer;
  document.querySelector('#customQuestionExplanation').value = question.explanation;
  document.querySelector('#saveQuestionButton').innerHTML = '수정 저장 <span>✓</span>';
  document.querySelector('#cancelQuestionEdit').classList.remove('hidden');
  document.querySelector('#questionManagerMessage').textContent = '수정 내용을 저장하면 다음 출제부터 반영돼요.';
  document.querySelector('#customQuestionText').focus();
}

function cancelQuestionEdit() {
  document.querySelector('#customQuestionForm').reset();
  document.querySelector('#editQuestionId').value = '';
  document.querySelector('#customFormHeading').textContent = '문제 직접 추가';
  document.querySelector('#saveQuestionButton').innerHTML = '문제 추가하기 <span>＋</span>';
  document.querySelector('#cancelQuestionEdit').classList.add('hidden');
  document.querySelector('#questionManagerMessage').textContent = '';
  if (roomState && questionManagerOpen) prepareQuestionForm();
}

function prepareQuestionForm() {
  const subject = document.querySelector('#customSubject');
  const difficulty = document.querySelector('#customDifficulty');
  for (const option of subject.options) {
    option.disabled = roomState.settings.subject !== 'mixed' && option.value !== roomState.settings.subject;
  }
  for (const option of difficulty.options) {
    option.disabled = roomState.settings.difficulty !== 'mixed' && option.value !== roomState.settings.difficulty;
  }
  if (roomState.settings.subject !== 'mixed') subject.value = roomState.settings.subject;
  if (roomState.settings.difficulty !== 'mixed') difficulty.value = roomState.settings.difficulty;
  const canManage = roomState.status === 'lobby';
  document.querySelector('#customQuestionForm').classList.toggle('hidden', !canManage);
  document.querySelector('#questionManagerIntro').textContent = canManage
    ? '출제할 문제를 고르고, 기존 문제를 수정·삭제하거나 새 문제를 추가해 복습을 구성하세요. 변경은 이 교실에만 적용돼요.'
    : '복습이 진행 중이거나 종료되어 문제 구성이 잠겼어요. 다음 방을 만들 때 다시 편집할 수 있어요.';
}

function configureStudentQuestionForm() {
  const subject = document.querySelector('#studentQuestionSubject');
  const difficulty = document.querySelector('#studentQuestionDifficulty');
  for (const option of subject.options) {
    option.disabled = roomState.settings.subject !== 'mixed' && option.value !== roomState.settings.subject;
  }
  for (const option of difficulty.options) {
    option.disabled = roomState.settings.difficulty !== 'mixed' && option.value !== roomState.settings.difficulty;
  }
  if (roomState.settings.subject !== 'mixed') subject.value = roomState.settings.subject;
  if (roomState.settings.difficulty !== 'mixed') difficulty.value = roomState.settings.difficulty;
}

function renderStudentQuestionPanel() {
  const canSubmit = roomState.status !== 'finished';
  document.querySelector('#studentQuestionPanel').classList.toggle('hidden', roomState.role !== 'student' || !canSubmit);
  document.querySelector('#studentQuestionStatus').textContent = studentQuestionStatus;
  document.querySelector('#submitStudentQuestionButton').disabled = studentQuestionPending;
  if (!canSubmit) document.querySelector('#studentQuestionStatus').textContent = '복습이 끝난 뒤에는 문제를 제안할 수 없어요.';
}

function renderPendingQuestionInbox() {
  const teacher = roomState.role === 'teacher';
  const questions = roomState.pendingQuestions || [];
  const show = teacher && roomState.status !== 'finished';
  const list = document.querySelector('#pendingQuestionList');
  document.querySelector('#pendingQuestionInbox').classList.toggle('hidden', !show);
  document.querySelector('#pendingQuestionCount').textContent = `${questions.length}개`;
  document.querySelector('#pendingQuestionEmpty').classList.toggle('hidden', questions.length > 0);
  list.innerHTML = questions.map((question) => `<article class="pending-question-card"><div class="pending-question-meta"><span class="catalog-tag ${question.subject === '수학' ? 'math' : 'social'}">${question.subject}</span><span class="catalog-tag ${question.difficulty === '어려움' ? 'hard' : ''}">${question.difficulty}</span><span class="pending-author">${escapeHtml(question.studentName)} 제안</span></div><h3>${escapeHtml(question.text)}</h3><p class="pending-answer"><span>정답</span>${escapeHtml(question.answer)}</p><p class="catalog-explanation">${escapeHtml(question.explanation)}</p><div class="pending-actions"><button type="button" data-moderate-question="${escapeHtml(question.id)}" data-action="reject">보류</button><button type="button" data-moderate-question="${escapeHtml(question.id)}" data-action="approve">승인하고 출제</button></div></article>`).join('');
}

function renderFinalReveal(teacher) {
  const finished = roomState.status === 'finished';
  const section = document.querySelector('#finalReveal');
  const button = document.querySelector('#finalRevealButton');
  section.classList.toggle('hidden', !finished);
  button.classList.toggle('hidden', !teacher || !finished);
  if (!finished) {
    renderedRevealCount = -1;
    return;
  }

  const rankedPlayers = [...roomState.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  const maxRank = Math.min(5, rankedPlayers.length);
  const revealCount = Math.min(roomState.finalRevealCount || 0, maxRank);
  const currentRank = revealCount ? maxRank - revealCount + 1 : null;
  const currentPlayer = currentRank ? rankedPlayers[currentRank - 1] : null;
  const card = document.querySelector('#finalRevealCard');
  card.classList.toggle('hidden', !currentPlayer);
  if (currentPlayer && revealCount !== renderedRevealCount) {
    card.classList.remove('reveal-in');
    void card.offsetWidth;
    card.classList.add('reveal-in');
  }
  renderedRevealCount = revealCount;
  document.querySelector('#finalRevealStatus').textContent = maxRank === 0
    ? '참여한 학생이 없어 순위를 공개할 수 없어요.'
    : revealCount === 0 ? `${maxRank}등부터 선생님이 한 명씩 공개해요.`
      : revealCount === maxRank ? '최종 순위 공개가 끝났어요!' : `다음은 ${maxRank - revealCount}등이에요. 공개를 기다려 주세요.`;
  if (currentPlayer) {
    document.querySelector('#finalRevealRank').textContent = `${currentRank}등`;
    document.querySelector('#finalRevealName').textContent = currentPlayer.name;
    document.querySelector('#finalRevealStats').textContent = `${formatScore(currentPlayer.score)}점 · 정답률 ${currentPlayer.answeredCount ? `${currentPlayer.accuracy.toFixed(1)}%` : '—'}`;
  }
  const historyRanks = Array.from({ length: Math.max(0, revealCount - 1) }, (_, index) => maxRank - index);
  document.querySelector('#finalRevealHistory').innerHTML = historyRanks.map((rank) => {
    const player = rankedPlayers[rank - 1];
    return `<li class="${rank === 1 ? 'winner-row' : ''}"><span class="final-rank">${rank}등</span><span class="final-player-name">${escapeHtml(player.name)}</span><span class="final-player-stats">${formatScore(player.score)}점 · 정답률 ${player.answeredCount ? `${player.accuracy.toFixed(1)}%` : '—'}</span></li>`;
  }).join('');
  button.disabled = maxRank === 0 || revealCount >= maxRank;
  button.innerHTML = revealCount >= maxRank ? '순위 공개 완료' : `${maxRank - revealCount}등 공개하기 <span>→</span>`;
}

function renderRoom() {
  if (!roomState) return;
  entryView.classList.add('hidden');
  roomView.classList.remove('hidden');
  roomError.textContent = '';
  document.querySelector('#roomGreeting').textContent = session?.role === 'teacher' ? `${session.name} 선생님의 교실` : `${session?.name || '친구'}의 복습 교실`;
  document.querySelector('#roomCodeDisplay').textContent = roomState.roomCode;
  document.querySelector('.brand').href = roomState.role === 'teacher' ? '/teacher' : '/student';
  document.querySelector('#roomSubject').textContent = roomState.settings.subject === 'mixed' ? '사회 + 수학' : roomState.settings.subject;
  document.querySelector('#roomDifficulty').textContent = roomState.settings.difficulty === 'mixed' ? '보통 + 어려움' : `${roomState.settings.difficulty} 난이도`;
  document.querySelector('#roomQuestionCount').textContent = `${roomState.selectedQuestionCount}개 선택`;
  document.querySelector('#startButton').disabled = roomState.selectedQuestionCount === 0;
  const teacher = roomState.role === 'teacher';
  const active = roomState.status === 'active';
  const finished = roomState.status === 'finished';
  document.querySelector('#studentScoreboard').classList.toggle('hidden', teacher || finished);
  document.querySelector('#copyCodeButton').classList.toggle('hidden', !teacher);
  document.querySelector('#copyStudentLinkButton').classList.toggle('hidden', !teacher);
  document.querySelector('#teacherOverview').classList.toggle('hidden', !teacher);
  document.querySelector('#teacherDashboard').classList.toggle('hidden', !teacher);
  document.querySelector('#questionManager').classList.toggle('hidden', !teacher || !questionManagerOpen);
  document.querySelector('#manageQuestionsButton').textContent = questionManagerOpen ? '문제 관리 닫기' : '문제은행 구성';
  renderLeaderboard();
  if (teacher) renderTeacherDashboard();
  renderStudentQuestionPanel();
  renderPendingQuestionInbox();
  if (!teacher) configureStudentQuestionForm();
  document.querySelector('#teacherLivePanel').classList.toggle('hidden', !teacher || !active);
  if (teacher && active) renderTeacherLive();
  document.querySelector('#studentPowerPanel').classList.toggle('hidden', teacher || roomState.status !== 'active');
  renderStealPanel();
  renderFinalReveal(teacher);

  const lobby = roomState.status === 'lobby';
  document.querySelector('#lobbyPanel').classList.toggle('hidden', !lobby);
  document.querySelector('#questionPanel').classList.toggle('hidden', !active || teacher);
  document.querySelector('#finishedPanel').classList.toggle('hidden', !finished);
  document.querySelector('#teacherLobbyControls').classList.toggle('hidden', !teacher || !lobby);
  document.querySelector('#roomStatus').textContent = lobby ? '친구를 기다리는 중' : active ? '복습 진행 중' : '복습을 마쳤어요';
  document.querySelector('#lobbyTitle').textContent = teacher ? '친구들을 기다리고 있어요!' : '선생님이 시작하기를 기다려요!';
  document.querySelector('#lobbyCopy').textContent = teacher ? '참여 코드를 공유하고, 아래 문제은행에서 출제할 문제를 골라주세요.' : '친구들이 모이면 선생님이 문제를 시작해요.';

  if (active && !teacher && roomState.question) renderQuestion(false);
  if (finished) {
    document.querySelector('#roomStatus').textContent = '최종 순위';
  }
  if (teacher && questionManagerOpen) prepareQuestionForm();
}

function renderQuestion(teacher) {
  const question = roomState.question;
  const subject = document.querySelector('#questionSubject');
  const difficulty = document.querySelector('#questionDifficulty');
  subject.textContent = question.subject;
  subject.className = `subject-tag ${question.subject === '사회' ? 'social' : 'math'}`;
  difficulty.textContent = question.difficulty;
  difficulty.className = `difficulty-tag ${question.difficulty === '어려움' ? 'hard' : ''}`;
  document.querySelector('#questionNumber').textContent = `문제 ${roomState.questionNumber}`;
  document.querySelector('#questionText').textContent = question.text;
  document.querySelector('#progressBar').style.animation = 'none';
  void document.querySelector('#progressBar').offsetWidth;
  document.querySelector('#progressBar').style.animation = '';

  const answered = Boolean(roomState.myAnswer) || Boolean(answerResult);
  const answerForm = document.querySelector('#answerForm');
  const answerInput = document.querySelector('#answerInput');
  const draft = answerInput.value;
  answerForm.classList.toggle('hidden', teacher);
  answerInput.value = roomState.myAnswer?.text || draft;
  answerInput.disabled = teacher || answered;
  answerForm.querySelector('button').disabled = teacher || answered;

  const feedback = document.querySelector('#answerFeedback');
  const powerReward = answerResult?.stealAwarded || roomState.myAnswer?.stealAwarded ? ' · 보석 특권 획득!' : '';
  const result = answerResult || roomState.myAnswer;
  if (result?.timeout) {
    feedback.textContent = `시간이 다 됐어요. 정답은 “${roomState.correctAnswer}”예요.`;
  } else if (result?.correct) {
    feedback.textContent = `정답이에요! +${formatScore(result.earned)}점${result.streak > 1 ? ` · ${result.streak}연속 정답!` : ''}${powerReward}`;
  } else if (result && roomState.correctAnswer) {
    feedback.textContent = `아깝다! 정답은 “${roomState.correctAnswer}”예요.`;
  } else if (result) {
    feedback.textContent = '정답을 확인하고 있어요.';
  } else if (roomState.correctAnswer) {
    feedback.textContent = `정답은 “${roomState.correctAnswer}”예요.`;
  } else feedback.textContent = '';
  const incorrect = Boolean(result && !result.correct && !result.timeout);
  feedback.classList.toggle('incorrect', incorrect);
  feedback.classList.toggle('neutral', !result);
  const explanation = document.querySelector('#explanationBox');
  explanation.classList.toggle('hidden', !roomState.explanation);
  explanation.textContent = roomState.explanation ? `정답 해설 · ${roomState.explanation}` : '';
}

function formatScore(value) { return Number.isInteger(value) ? value : value.toFixed(1); }

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

try {
  session = JSON.parse(localStorage.getItem('reviewSession') || 'null');
  if (session?.roomCode) hasSentResume = true;
} catch { session = null; }
const inviteCode = new URLSearchParams(location.search).get('code');
if (activeRouteRole && session && session.role !== activeRouteRole) {
  session = null;
  localStorage.removeItem('reviewSession');
  hasSentResume = false;
}
if (activeRouteRole === 'student' && inviteCode && session?.roomCode !== inviteCode) {
  session = null;
  localStorage.removeItem('reviewSession');
  hasSentResume = false;
}
if (activeRouteRole) applyRoleRoute(activeRouteRole);
connect();
