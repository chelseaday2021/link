const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const clients = new Map();
let reloadVersion = Date.now();
const questionBank = [
  { subject: '사회', difficulty: '보통', text: '대한민국에서 법을 만들고 나라의 중요한 일을 결정하는 기관은 어디일까요?', options: ['국회', '법원', '학교', '시청'], answer: 0, explain: '국회는 국민이 뽑은 국회의원들이 법을 만들고 나라의 중요한 일을 논의하는 기관이에요.' },
  { subject: '사회', difficulty: '보통', text: '우리나라에서 대통령을 뽑는 선거에 참여할 수 있는 나이는 만 몇 살부터일까요?', options: ['16세', '18세', '19세', '20세'], answer: 1, explain: '대한민국 국민은 만 18세부터 대통령 선거에 참여할 수 있어요.' },
  { subject: '사회', difficulty: '보통', text: '물건의 가격이 오를 때 사람들이 그 물건을 더 적게 사려는 현상과 가장 관계있는 것은?', options: ['수요와 공급', '계절의 변화', '지구의 자전', '인구 이동'], answer: 0, explain: '가격과 사람들이 사려는 양은 수요와 공급의 영향을 받아요.' },
  { subject: '사회', difficulty: '보통', text: '지도에서 실제 거리를 줄여 나타낼 때 사용하는 약속은 무엇일까요?', options: ['방위표', '축척', '범례', '등고선'], answer: 1, explain: '축척은 지도 위 거리와 실제 거리의 비율을 나타내요.' },
  { subject: '사회', difficulty: '보통', text: '우리나라에서 지방자치단체의 장을 뽑는 선거는 무엇일까요?', options: ['지방 선거', '대통령 선거', '국회의원 선거', '재판'], answer: 0, explain: '지방 선거에서는 시장, 도지사처럼 지역의 일을 맡을 사람을 뽑아요.' },
  { subject: '사회', difficulty: '어려움', text: '우리나라가 다른 나라와 물건이나 서비스를 사고파는 일을 무엇이라고 할까요?', options: ['국제 무역', '지방 자치', '문화유산', '인구 조사'], answer: 0, explain: '나라와 나라 사이에 물건과 서비스를 사고파는 것을 국제 무역이라고 해요.' },
  { subject: '사회', difficulty: '어려움', text: '민주주의에서 다수결로 결정할 때 함께 지켜야 할 태도로 알맞은 것은?', options: ['소수 의견도 존중하기', '이긴 의견만 기억하기', '투표하지 않기', '결정을 계속 미루기'], answer: 0, explain: '다수결로 결정해도 소수 의견을 존중하고 살펴야 해요.' },
  { subject: '사회', difficulty: '어려움', text: '우리나라의 산업이 농업 중심에서 공업·서비스업 중심으로 바뀌는 현상은?', options: ['산업 구조의 변화', '계절풍', '영토 확장', '자연재해'], answer: 0, explain: '사회가 발전하며 중심이 되는 산업이 달라지는 것을 산업 구조의 변화라고 해요.' },
  { subject: '사회', difficulty: '어려움', text: '한 나라에서 다른 나라로 옮겨가 생활하는 사람이 늘어날 때 나타날 수 있는 변화는?', options: ['문화의 다양성 증가', '하루 길이 변화', '산의 높이 변화', '위도 변화'], answer: 0, explain: '서로 다른 문화가 만나면서 사회의 문화적 다양성이 커질 수 있어요.' },
  { subject: '사회', difficulty: '어려움', text: '환경을 생각하며 물건을 만들고 소비할 때 가장 알맞은 행동은?', options: ['필요한 만큼 사고 재활용하기', '쓰고 바로 버리기', '포장을 많이 하기', '가까운 거리도 차로 가기'], answer: 0, explain: '필요한 만큼 소비하고 재사용·재활용하면 자원을 아낄 수 있어요.' },
  { subject: '수학', difficulty: '보통', text: '민수는 피자 3/4판을 먹고 동생은 1/8판을 먹었어요. 두 사람이 먹은 피자는 모두 몇 판일까요?', options: ['4/12', '7/8', '1', '5/8'], answer: 1, explain: '3/4판은 6/8판과 같아요. 6/8 + 1/8 = 7/8판이에요.' },
  { subject: '수학', difficulty: '보통', text: '물통 하나에 물이 1.2L씩 들어 있어요. 이런 물통 5개에 담긴 물은 모두 몇 L일까요?', options: ['0.6L', '6L', '60L', '5.2L'], answer: 1, explain: '물통 5개에 든 양은 1.2 × 5 = 6L예요.' },
  { subject: '수학', difficulty: '보통', text: '가로 8m, 세로 5m인 직사각형 텃밭에 잔디를 깔려고 해요. 필요한 잔디의 넓이는 몇 m²일까요?', options: ['13m²', '26m²', '40m²', '80m²'], answer: 2, explain: '직사각형 넓이는 가로 × 세로예요. 8 × 5 = 40m²가 필요해요.' },
  { subject: '수학', difficulty: '보통', text: '과일 음료를 만들 때 원액과 물을 2:3으로 섞어요. 원액을 10컵 넣는다면 물은 몇 컵 넣어야 할까요?', options: ['12컵', '15컵', '20컵', '30컵'], answer: 1, explain: '원액 2가 10이 되려면 5배예요. 물도 3의 5배인 15컵이 필요해요.' },
  { subject: '수학', difficulty: '보통', text: '보드게임에서 주사위 한 개를 한 번 굴려요. 짝수가 나올 가능성은 얼마일까요?', options: ['1/6', '1/3', '1/2', '2/3'], answer: 2, explain: '짝수는 2, 4, 6으로 6가지 눈 중 3가지예요. 3/6 = 1/2예요.' },
  { subject: '수학', difficulty: '어려움', text: '쌀 4.8kg을 한 봉지에 0.6kg씩 나누어 담으려고 해요. 봉지는 모두 몇 개 필요할까요?', options: ['0.8개', '8개', '80개', '2.88개'], answer: 1, explain: '4.8 ÷ 0.6 = 8이므로 봉지 8개가 필요해요.' },
  { subject: '수학', difficulty: '어려움', text: '반지름이 5m인 둥근 분수대 둘레에 장식 띠를 두르려고 해요. 원주율을 3.14로 할 때 띠는 몇 m 필요할까요?', options: ['15.7m', '31.4m', '78.5m', '10m'], answer: 1, explain: '지름은 반지름의 2배인 10m예요. 원의 둘레는 10 × 3.14 = 31.4m예요.' },
  { subject: '수학', difficulty: '어려움', text: '모서리의 길이가 4cm인 정육면체 선물 상자가 있어요. 상자 안의 부피는 몇 cm³일까요?', options: ['16cm³', '48cm³', '64cm³', '96cm³'], answer: 2, explain: '정육면체 부피는 한 모서리 길이를 세 번 곱해요. 4 × 4 × 4 = 64cm³예요.' },
  { subject: '수학', difficulty: '어려움', text: '어떤 저금액의 25%가 12,000원이에요. 처음 저금액은 얼마였을까요?', options: ['3,000원', '36,000원', '48,000원', '60,000원'], answer: 2, explain: '25%는 전체의 1/4이에요. 12,000원의 4배인 48,000원이 처음 저금액이에요.' },
  { subject: '수학', difficulty: '어려움', text: '연필 12자루와 지우개 18개를 남김없이 똑같이 나누어 선물하려고 해요. 만들 수 있는 선물 꾸러미는 최대 몇 개일까요?', options: ['2개', '3개', '6개', '9개'], answer: 2, explain: '12와 18을 모두 나눌 수 있는 가장 큰 수는 6이에요. 최대 6개 꾸러미를 만들 수 있어요.' },
];
questionBank.forEach((question, index) => { question.id = `bank-${index + 1}`; });

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/+$/, '') || '/';
  if (pathname === '/__reload-check') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(String(reloadVersion));
    return;
  }
  if (pathname === '/__preview-bridge.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end("let version; async function checkPreview(){try{const response=await fetch('/__reload-check',{cache:'no-store'});const next=await response.text();if(version!==undefined&&version!==next)location.reload();version=next;}catch{}setTimeout(checkPreview,1200)}checkPreview();");
    return;
  }
  if (pathname === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  const pagePath = pathname === '/' || pathname === '/teacher' || pathname === '/student' ? '/index.html' : pathname;
  const filePath = path.resolve(ROOT, `.${pagePath}`);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404).end('Not found');
      return;
    }
    const type = filePath.endsWith('.css') ? 'text/css' : filePath.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(content);
  });
});

fs.watch(ROOT, (_event, filename) => {
  if (!filename) return;
  reloadVersion = Date.now();
});

const wss = new WebSocketServer({ server, path: '/live' });

function codeForRoom() {
  let code;
  do code = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(code));
  return code;
}

function roomFor(socket) {
  const client = clients.get(socket);
  return client && rooms.get(client.roomCode);
}

function normalizeAnswer(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s,，。!?·]/g, '').replace(/\.$/, '');
}

function numericAnswer(value) {
  const normalized = normalizeAnswer(value).replace(/(cm3|cm2|m3|m2|cm|mm|km|kg|l|m|세|개|명|점|원|컵|판|%)+$/g, '');
  const fraction = normalized.match(/^([-+]?\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return Number(normalized);
  return null;
}

function answersMatch(input, expected) {
  const normalizedInput = normalizeAnswer(input);
  const normalizedExpected = normalizeAnswer(expected);
  if (normalizedInput === normalizedExpected) return true;
  const inputNumber = numericAnswer(input);
  const expectedNumber = numericAnswer(expected);
  return inputNumber !== null && expectedNumber !== null && Math.abs(inputNumber - expectedNumber) < 1e-9;
}

function publicState(room, socket) {
  const client = clients.get(socket);
  const currentPlayer = client?.role === 'student' ? room.players.get(client.id) : null;
  const players = [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    streak: player.streak,
    answeredCount: player.answeredCount,
    correctCount: player.correctCount,
    accuracy: player.answeredCount ? Math.round((player.correctCount / player.answeredCount) * 1000) / 10 : 0,
    questionNumber: player.questionNumber,
    online: player.online,
    answered: Boolean(player.currentAnswer),
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  const state = {
    roomCode: room.code,
    role: client?.role,
    status: room.status,
    settings: room.settings,
    questionNumber: currentPlayer?.questionNumber || 0,
    selectedQuestionCount: room.selectedQuestionIds.size,
    availableQuestionCount: availableQuestionsForRoom(room).length,
    players,
    question: currentPlayer?.currentQuestion ? {
      subject: currentPlayer.currentQuestion.subject,
      difficulty: currentPlayer.currentQuestion.difficulty,
      text: currentPlayer.currentQuestion.text,
    } : null,
    answeredCount: players.reduce((sum, player) => sum + player.answeredCount, 0),
    connectedCount: [...room.players.values()].filter((player) => player.online).length,
    myAnswer: currentPlayer?.currentAnswer || null,
    myStealTokens: currentPlayer?.stealTokens || 0,
    finalRevealCount: room.finalRevealCount,
    final: room.status === 'finished',
  };
  if (currentPlayer?.currentAnswer && currentPlayer.currentQuestion) {
    state.correctAnswer = currentPlayer.currentQuestion.options[currentPlayer.currentQuestion.answer];
    state.explanation = currentPlayer.currentQuestion.explain;
  }
  return state;
}

function send(socket, type, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
}

function broadcast(room) {
  for (const socket of room.connections) send(socket, 'state', { state: publicState(room, socket) });
}

function errorTo(socket, message) {
  send(socket, 'error', { message });
}

function cancelPlayerTimer(player) {
  if (player.advanceTimer) clearTimeout(player.advanceTimer);
  player.advanceTimer = null;
}

function availableQuestionsForRoom(room) {
  return [...questionBank, ...room.customQuestions]
    .filter((question) => !room.deletedQuestionIds.has(question.id))
    .map((question) => room.questionEdits.get(question.id) || question)
    .filter((question) => {
    const subjectMatches = room.settings.subject === 'mixed' || room.settings.subject === question.subject;
    const difficultyMatches = room.settings.difficulty === 'mixed' || room.settings.difficulty === question.difficulty;
    return subjectMatches && difficultyMatches;
  });
}

function questionsForRoom(room) {
  return availableQuestionsForRoom(room).filter((question) => room.selectedQuestionIds.has(question.id));
}

function questionCatalog(room) {
  return availableQuestionsForRoom(room).map((question) => ({
    id: question.id,
    subject: question.subject,
    difficulty: question.difficulty,
    text: question.text,
    answer: question.options[question.answer],
    explanation: question.explain,
    custom: Boolean(question.custom),
    selected: room.selectedQuestionIds.has(question.id),
  }));
}

function questionFromMessage(message) {
  const subject = String(message.subject || '');
  const difficulty = String(message.difficulty || '');
  const text = String(message.text || '').trim().slice(0, 240);
  const answer = String(message.answer || '').trim().slice(0, 100);
  const explain = String(message.explanation || '').trim().slice(0, 300) || '선생님이 직접 관리한 문제예요.';
  if (!['사회', '수학'].includes(subject) || !['보통', '어려움'].includes(difficulty) || !text || !answer) return null;
  return { subject, difficulty, text, options: [answer], answer: 0, explain };
}

function questionMatchesRoom(room, question) {
  return (room.settings.subject === 'mixed' || room.settings.subject === question.subject)
    && (room.settings.difficulty === 'mixed' || room.settings.difficulty === question.difficulty);
}

function hasDuplicateQuestion(room, text, exceptId = '') {
  return availableQuestionsForRoom(room).some((question) => question.id !== exceptId && normalizeAnswer(question.text) === normalizeAnswer(text));
}

function chooseQuestion(room, player) {
  const eligible = questionsForRoom(room);
  for (const priorityId of room.priorityQuestionIds) {
    const priorityQuestion = eligible.find((question) => question.id === priorityId);
    if (priorityQuestion && !player.usedQuestionIds.has(priorityId)) {
      player.usedQuestionIds.add(priorityQuestion.id);
      return priorityQuestion;
    }
  }
  let available = eligible.filter((question) => !player.usedQuestionIds.has(question.id));
  if (!available.length) {
    player.usedQuestionIds.clear();
    available = eligible;
  }
  const question = available[Math.floor(Math.random() * available.length)];
  player.usedQuestionIds.add(question.id);
  return question;
}

function schedulePlayerTimeout(room, player) {
  cancelPlayerTimer(player);
  player.advanceTimer = setTimeout(() => {
    if (room.status !== 'active' || !player.online || player.currentAnswer || !player.currentQuestion) return;
    player.streak = 0;
    player.currentAnswer = { text: '', correct: false, earned: 0, stealAwarded: false, timeout: true };
    broadcast(room);
    player.advanceTimer = setTimeout(() => beginPlayerQuestion(room, player), 1500);
  }, 22000);
}

function beginPlayerQuestion(room, player, { broadcastState = true } = {}) {
  cancelPlayerTimer(player);
  player.currentQuestion = chooseQuestion(room, player);
  player.questionNumber += 1;
  player.currentAnswer = null;
  if (broadcastState) broadcast(room);
  schedulePlayerTimeout(room, player);
}

function attachToRoom(socket, room, role, id, name) {
  const safeName = String(name || '').trim().slice(0, 18);
  if (!safeName) return errorTo(socket, '이름을 입력해 주세요.');
  clients.set(socket, { roomCode: room.code, role, id, name: safeName });
  room.connections.add(socket);
  if (role === 'student') {
    let player = room.players.get(id);
    if (!player) {
      if (room.players.size >= 40) return errorTo(socket, '한 방에는 학생 40명까지 참여할 수 있어요.');
      player = { id, name: safeName, score: 0, streak: 0, answeredCount: 0, correctCount: 0, stealTokens: 0, questionNumber: 0, usedQuestionIds: new Set(), currentQuestion: null, currentAnswer: null, advanceTimer: null, online: true };
      room.players.set(id, player);
    } else {
      player.name = safeName;
      player.online = true;
    }
    if (room.status === 'active') {
      if (player.currentAnswer) {
        cancelPlayerTimer(player);
        player.advanceTimer = setTimeout(() => beginPlayerQuestion(room, player), 1500);
      }
      else if (!player.currentQuestion) beginPlayerQuestion(room, player, { broadcastState: false });
      else schedulePlayerTimeout(room, player);
    }
  }
  broadcast(room);
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw); } catch { return errorTo(socket, '요청을 읽을 수 없어요. 다시 시도해 주세요.'); }

    if (message.type === 'create') {
      const id = String(message.clientId || '');
      if (!id) return errorTo(socket, '잠시 후 다시 시도해 주세요.');
      const code = codeForRoom();
      const room = {
        code,
        hostId: id,
        hostName: String(message.name || '').trim().slice(0, 18),
        status: 'lobby',
        settings: {
          subject: ['mixed', '사회', '수학'].includes(message.subject) ? message.subject : 'mixed',
          difficulty: ['mixed', '보통', '어려움'].includes(message.difficulty) ? message.difficulty : 'mixed',
        },
        players: new Map(),
        connections: new Set(),
        customQuestions: [],
        questionEdits: new Map(),
        deletedQuestionIds: new Set(),
        selectedQuestionIds: new Set(),
        priorityQuestionIds: [],
        finalRevealCount: 0,
      };
      if (!room.hostName) return errorTo(socket, '선생님 이름을 입력해 주세요.');
      for (const question of availableQuestionsForRoom(room)) room.selectedQuestionIds.add(question.id);
      rooms.set(code, room);
      attachToRoom(socket, room, 'teacher', id, room.hostName);
      return;
    }

    if (message.type === 'join') {
      const code = String(message.roomCode || '').replace(/\D/g, '').slice(0, 6);
      const room = rooms.get(code);
      if (!room) return errorTo(socket, '이 코드를 사용하는 방을 찾지 못했어요.');
      const id = String(message.clientId || '');
      if (!id) return errorTo(socket, '잠시 후 다시 시도해 주세요.');
      return attachToRoom(socket, room, 'student', id, message.name);
    }

    if (message.type === 'resume') {
      const room = rooms.get(String(message.roomCode || ''));
      if (!room) return errorTo(socket, '복구할 방이 없어졌어요. 새 방에 참여해 주세요.');
      const role = message.role === 'teacher' && room.hostId === message.clientId ? 'teacher' : 'student';
      if (role === 'student' && !room.players.has(message.clientId)) return errorTo(socket, '참여 정보가 만료되었어요. 다시 입장해 주세요.');
      return attachToRoom(socket, room, role, message.clientId, message.name || room.players.get(message.clientId)?.name || room.hostName);
    }

    const room = roomFor(socket);
    const client = clients.get(socket);
    if (!room || !client) return errorTo(socket, '먼저 방에 입장해 주세요.');

    if (message.type === 'getQuestions') {
      if (client.role !== 'teacher') return errorTo(socket, '문제 관리는 선생님만 사용할 수 있어요.');
      return send(socket, 'questionCatalog', { questions: questionCatalog(room) });
    }

    if (message.type === 'setQuestionSelection') {
      if (client.role !== 'teacher') return errorTo(socket, '문제 선택은 선생님만 할 수 있어요.');
      if (room.status !== 'lobby') return errorTo(socket, '복습을 시작한 뒤에는 문제 구성을 바꿀 수 없어요.');
      const availableIds = new Set(availableQuestionsForRoom(room).map((question) => question.id));
      const requestedIds = Array.isArray(message.ids) ? message.ids.map(String) : [];
      room.selectedQuestionIds = new Set(requestedIds.filter((id) => availableIds.has(id)));
      room.priorityQuestionIds = room.priorityQuestionIds.filter((id) => room.selectedQuestionIds.has(id));
      broadcast(room);
      return send(socket, 'questionCatalog', {
        questions: questionCatalog(room),
        notice: `${room.selectedQuestionIds.size}개 문제를 선택했어요.`,
      });
    }

    if (message.type === 'addQuestion') {
      if (client.role !== 'teacher') return errorTo(socket, '문제 추가는 선생님만 사용할 수 있어요.');
      if (room.status !== 'lobby') return errorTo(socket, '문제는 복습을 시작하기 전에 추가해 주세요.');
      const question = questionFromMessage(message);
      if (!question) return errorTo(socket, '과목, 난이도, 문제와 정답을 모두 입력해 주세요.');
      if (!questionMatchesRoom(room, question)) return errorTo(socket, '현재 교실의 과목과 난이도에 맞는 문제를 선택해 주세요.');
      if (room.customQuestions.length >= 60) return errorTo(socket, '한 교실에는 직접 만든 문제를 60개까지 추가할 수 있어요.');
      if (hasDuplicateQuestion(room, question.text)) return errorTo(socket, '같은 문장이 이미 문제 목록에 있어요.');
      const addedQuestion = {
        ...question,
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        custom: true,
      };
      room.customQuestions.push(addedQuestion);
      room.selectedQuestionIds.add(addedQuestion.id);
      room.priorityQuestionIds.unshift(addedQuestion.id);
      broadcast(room);
      return send(socket, 'questionCatalog', { questions: questionCatalog(room), notice: '문제를 추가하고 이번 복습에 선택했어요.', resetForm: true });
    }

    if (message.type === 'editQuestion') {
      if (client.role !== 'teacher') return errorTo(socket, '문제 수정은 선생님만 사용할 수 있어요.');
      if (room.status !== 'lobby') return errorTo(socket, '문제는 복습을 시작하기 전에 수정해 주세요.');
      const id = String(message.id || '');
      const current = availableQuestionsForRoom(room).find((question) => question.id === id);
      if (!current) return errorTo(socket, '수정할 문제를 찾지 못했어요. 목록을 새로고침해 주세요.');
      const question = questionFromMessage(message);
      if (!question) return errorTo(socket, '과목, 난이도, 문제와 정답을 모두 입력해 주세요.');
      if (!questionMatchesRoom(room, question)) return errorTo(socket, '현재 교실의 과목과 난이도에 맞는 문제를 선택해 주세요.');
      if (hasDuplicateQuestion(room, question.text, id)) return errorTo(socket, '같은 문장이 이미 문제 목록에 있어요.');
      const updatedQuestion = { ...current, ...question, id, custom: current.custom };
      room.questionEdits.set(id, updatedQuestion);
      room.priorityQuestionIds = room.priorityQuestionIds.filter((questionId) => questionId !== id);
      if (room.selectedQuestionIds.has(id)) room.priorityQuestionIds.unshift(id);
      return send(socket, 'questionCatalog', { questions: questionCatalog(room), notice: '문제를 수정했어요. 선택된 문제는 복습에 반영됩니다.', resetForm: true });
    }

    if (message.type === 'deleteQuestion') {
      if (client.role !== 'teacher') return errorTo(socket, '문제 삭제는 선생님만 사용할 수 있어요.');
      if (room.status !== 'lobby') return errorTo(socket, '문제는 복습을 시작하기 전에 삭제해 주세요.');
      const id = String(message.id || '');
      if (!availableQuestionsForRoom(room).some((question) => question.id === id)) return errorTo(socket, '삭제할 문제를 찾지 못했어요. 목록을 새로고침해 주세요.');
      if (room.selectedQuestionIds.has(id) && room.selectedQuestionIds.size <= 1) return errorTo(socket, '선택된 문제가 한 개는 남아 있어야 해요.');
      room.deletedQuestionIds.add(id);
      room.questionEdits.delete(id);
      room.selectedQuestionIds.delete(id);
      room.priorityQuestionIds = room.priorityQuestionIds.filter((questionId) => questionId !== id);
      broadcast(room);
      return send(socket, 'questionCatalog', { questions: questionCatalog(room), notice: '이 문제를 이번 교실 목록에서 삭제했어요.', resetForm: true });
    }

    if (message.type === 'revealNextRank') {
      if (client.role !== 'teacher') return errorTo(socket, '최종 순위 공개는 선생님만 할 수 있어요.');
      if (room.status !== 'finished') return errorTo(socket, '교실을 종료한 뒤 최종 순위를 공개해 주세요.');
      room.finalRevealCount = Math.min(Math.min(5, room.players.size), room.finalRevealCount + 1);
      return broadcast(room);
    }

    if (message.type === 'stealPoints') {
      if (client.role !== 'student' || room.status !== 'active') return errorTo(socket, '복습 중인 학생만 특권을 사용할 수 있어요.');
      const player = room.players.get(client.id);
      if (!player || player.stealTokens < 1) return errorTo(socket, '사용할 수 있는 점수 빼앗기 특권이 없어요.');
      const target = room.players.get(String(message.targetId || ''));
      if (!target || target.id === player.id || !target.online || target.score <= 0) {
        return errorTo(socket, '점수를 빼앗을 수 있는 친구를 선택해 주세요.');
      }
      const amount = Math.min(2, target.score);
      target.score = Math.round((target.score - amount) * 10) / 10;
      player.score = Math.round((player.score + amount) * 10) / 10;
      player.stealTokens -= 1;
      send(socket, 'stealResult', { amount, targetName: target.name });
      broadcast(room);
      return;
    }

    if (message.type === 'start' || message.type === 'stop' || message.type === 'settings') {
      if (client.role !== 'teacher') return errorTo(socket, '이 기능은 선생님만 사용할 수 있어요.');
      if (message.type === 'settings' && room.status === 'lobby') {
        if (['mixed', '사회', '수학'].includes(message.subject)) room.settings.subject = message.subject;
        if (['mixed', '보통', '어려움'].includes(message.difficulty)) room.settings.difficulty = message.difficulty;
        broadcast(room);
      } else if (message.type === 'start' && room.status === 'lobby') {
        if (!room.selectedQuestionIds.size) return errorTo(socket, '복습을 시작하려면 문제를 한 개 이상 선택해 주세요.');
        room.status = 'active';
        for (const player of room.players.values()) {
          if (player.online) beginPlayerQuestion(room, player, { broadcastState: false });
        }
        broadcast(room);
      } else if (message.type === 'stop' && room.status !== 'finished') {
        for (const player of room.players.values()) cancelPlayerTimer(player);
        room.status = 'finished';
        room.finalRevealCount = 0;
        broadcast(room);
      }
      return;
    }

    if (message.type === 'answer') {
      if (client.role !== 'student' || room.status !== 'active') return;
      const player = room.players.get(client.id);
      const text = String(message.text || '').trim().slice(0, 100);
      if (!player || !text) return errorTo(socket, '답을 입력한 뒤 제출해 주세요.');
      if (player.currentAnswer || !player.currentQuestion) return;
      const expected = player.currentQuestion.options[player.currentQuestion.answer];
      const correct = answersMatch(text, expected);
      player.answeredCount += 1;
      let earned = 0;
      let stealAwarded = false;
      if (correct) {
        const base = player.currentQuestion.difficulty === '보통'
          ? 3 + Math.floor(Math.random() * 3)
          : 4 + Math.floor(Math.random() * 3);
        earned = base + player.streak * 0.5;
        player.streak += 1;
        player.score = Math.round((player.score + earned) * 10) / 10;
        player.correctCount += 1;
        stealAwarded = Math.random() < 0.15;
        if (stealAwarded) player.stealTokens += 1;
      } else {
        player.streak = 0;
      }
      player.currentAnswer = { text, correct, earned, stealAwarded, timeout: false };
      cancelPlayerTimer(player);
      send(socket, 'answerResult', { correct, earned, streak: player.streak, stealAwarded });
      broadcast(room);
      player.advanceTimer = setTimeout(() => beginPlayerQuestion(room, player), 1500);
    }
  });

  socket.on('close', () => {
    const client = clients.get(socket);
    const room = roomFor(socket);
    clients.delete(socket);
    if (!room || !client) return;
    room.connections.delete(socket);
    if (client.role === 'student') {
      const player = room.players.get(client.id);
      if (player) {
        player.online = false;
        cancelPlayerTimer(player);
      }
    }
    broadcast(room);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Review room listening on ${PORT}`);
});
