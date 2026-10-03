import type { Condition, Job, Language } from '../types'

export const LANGUAGES: readonly { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
]

export type Strings = {
  flowers: readonly [string, string, string, string, string, string]
  accessories: readonly [string, string, string, string, string]
  weather: Record<Condition, string>
  clearNight: string
  resting: string
  planting: (flower: string) => string
  watering: (flower: string) => string
  harvesting: (flower: string) => string
  storing: (flower: string) => string
  selling: (count: number, earned: number) => string
  stages: readonly [string, string, string, string]
  withStage: (chore: string, stage: string) => string
  coins: (count: number) => string
  languageTitle: string
  autoLanguage: (name: string) => string
  pickHint: string
  languageSet: (name: string) => string
  unknownLanguage: (input: string) => string
  supportedLanguages: string
  badge: { host: string; joined: string; hostAway: string; away: string }
  claude: (seat: number) => string
  host: string
  you: string
  members: { hide: string; show: string }
  away: string
  roomHelp: string
  aloneStatus: string
  roomStatus: (code: string, isHost: boolean) => string
  created: (code: string) => string
  joined: (code: string) => string
  left: (code: string) => string
  closed: (code: string) => string
  alreadyIn: (code: string) => string
  notIn: string
  noFreeRoom: string
  noSuchRoom: (code: string) => string
  badCode: (input: string) => string
  roomFull: (code: string) => string
  seatHeld: (code: string) => string
  hostIsAway: (code: string) => string
  hostNotAway: (code: string) => string
  reclaimed: (code: string) => string
  hostClosed: (code: string) => string
  welcomeBack: (code: string) => string
  closedWhileAway: (code: string) => string
  accessoryTitle: string
  accessorySet: (name: string) => string
  accessoryTaken: (name: string) => string
  unknownAccessory: (input: string) => string
  accessoryAlone: string
  freeAccessories: string
}

const hasFinalConsonant = (word: string): boolean => {
  const last = word.codePointAt(word.length - 1) ?? 0
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
}

const worn = (name: string): string => (/^(straw hat|flower crown)$/.test(name) ? `a ${name}` : name)

const ENGLISH: Strings = {
  flowers: ['daisy', 'tulip', 'sunflower', 'lavender', 'rose', 'cornflower'],
  accessories: ['sunglasses', 'headphones', 'straw hat', 'flower crown', 'bunny ears'],
  weather: { sunny: 'sunny', cloudy: 'cloudy', rainy: 'rainy', snowy: 'snowy' },
  clearNight: 'clear night',
  resting: 'resting',
  planting: flower => `planting ${flower}`,
  watering: flower => `watering ${flower}`,
  harvesting: flower => `picking ${flower}`,
  storing: flower => `putting the ${flower} in the basket`,
  selling: (count, earned) => `selling ${count}, +${earned} coins`,
  stages: ['seed', 'sprout', 'bud', 'in bloom'],
  withStage: (chore, stage) => `${chore}, ${stage}`,
  coins: count => `${count} coins`,
  languageTitle: 'Garden language',
  autoLanguage: name => `Auto (follows your computer: ${name})`,
  pickHint: '↑↓ choose · Enter pick · Esc close',
  languageSet: name => `Garden Claude now speaks ${name}.`,
  unknownLanguage: input => `"${input}" isn't a supported language.`,
  supportedLanguages: 'Supported languages:',
  badge: { host: 'HOST', joined: 'JOINED', hostAway: 'HOST AWAY', away: 'AWAY' },
  claude: seat => `Claude ${seat}`,
  host: 'host',
  you: 'you',
  members: { hide: 'hide members', show: 'show members' },
  away: 'away',
  roomHelp: [
    '/garden-claude-room create      start a room and get its code',
    '/garden-claude-room join CODE   join a room (3 Claudes at most)',
    '/garden-claude-room leave       go back to your own garden',
    '/garden-claude-room host CODE   take over a room whose host is away',
  ].join('\n'),
  aloneStatus: "You're gardening alone.",
  roomStatus: (code, isHost) => (isHost ? `You're the host of room ${code}.` : `You're in room ${code}.`),
  created: code => `Room ${code} is open. Others join with /garden-claude-room join ${code}`,
  joined: code => `You joined room ${code}.`,
  left: code => `You left room ${code} and are back in your own garden.`,
  closed: code => `You closed room ${code}. Everyone is back in their own garden.`,
  alreadyIn: code => `You're already in room ${code}. Leave it first.`,
  notIn: "You're not in a room.",
  noFreeRoom: 'Every fruit is taken by another room right now. Try again once a room closes.',
  noSuchRoom: code => `There's no open room ${code}.`,
  badCode: input => `"${input}" isn't a room code. Room codes are fruits, like MANGO.`,
  roomFull: code => `Room ${code} is full.`,
  seatHeld: code => `Room ${code} is full: a seat is held for someone who stepped away.`,
  hostIsAway: code => `The host of room ${code} is away. Try again when they're back.`,
  hostNotAway: code => `The host of room ${code} is here, so it can't be taken over.`,
  reclaimed: code => `You're now the host of room ${code}.`,
  hostClosed: code => `The host closed room ${code}. You're back in your own garden.`,
  welcomeBack: code => `Welcome back to room ${code}.`,
  closedWhileAway: code => `Room ${code} closed while you were away.`,
  accessoryTitle: 'Your accessory',
  accessorySet: name => `Your Claude now wears ${worn(name)}.`,
  accessoryTaken: name => `Another Claude in the room already wears ${worn(name)}.`,
  unknownAccessory: input => `"${input}" isn't an accessory.`,
  accessoryAlone: 'When gardening alone, your Claude swaps accessories every hour. In a room, pick one so the others can tell you apart.',
  freeAccessories: 'Free accessories:',
}

const TRADITIONAL: Strings = {
  flowers: ['雛菊', '鬱金香', '向日葵', '薰衣草', '玫瑰', '矢車菊'],
  accessories: ['太陽眼鏡', '耳機', '草帽', '花冠', '兔耳朵'],
  weather: { sunny: '晴天', cloudy: '多雲', rainy: '下雨', snowy: '下雪' },
  clearNight: '晴夜',
  resting: '休息中',
  planting: flower => `種${flower}`,
  watering: flower => `澆${flower}`,
  harvesting: flower => `摘${flower}`,
  storing: flower => `把${flower}放進籃子`,
  selling: (count, earned) => `賣出 ${count} 朵 +${earned} 金幣`,
  stages: ['種子', '發芽', '花苞', '盛開'],
  withStage: (chore, stage) => `${chore}（${stage}）`,
  coins: count => `${count} 金幣`,
  languageTitle: '花園語言',
  autoLanguage: name => `自動（跟著電腦設定：${name}）`,
  pickHint: '↑↓ 選擇 · Enter 確定 · Esc 關閉',
  languageSet: name => `Garden Claude 現在說${name}。`,
  unknownLanguage: input => `不支援「${input}」這個語言。`,
  supportedLanguages: '支援的語言：',
  badge: { host: '房主', joined: '已加入', hostAway: '房主暫離', away: '暫離' },
  claude: seat => `Claude ${seat}`,
  host: '房主',
  you: '你',
  members: { hide: '隱藏成員', show: '顯示成員' },
  away: '暫離',
  roomHelp: [
    '/garden-claude-room create      開房間並取得房號',
    '/garden-claude-room join 房號   加入房間（最多 3 隻 Claude）',
    '/garden-claude-room leave       回到自己的花園',
    '/garden-claude-room host 房號   接手房主暫離的房間',
  ].join('\n'),
  aloneStatus: '你現在一個人在種花。',
  roomStatus: (code, isHost) => (isHost ? `你是房間 ${code} 的房主。` : `你在房間 ${code} 裡。`),
  created: code => `房間開好了，房號 ${code}。其他人用 /garden-claude-room join ${code} 加入`,
  joined: code => `你加入了房間 ${code}。`,
  left: code => `你離開了房間 ${code}，回到自己的花園。`,
  closed: code => `你把房間 ${code} 關掉了，大家都回到自己的花園。`,
  alreadyIn: code => `你已經在房間 ${code} 裡了，請先離開。`,
  notIn: '你不在任何房間裡。',
  noFreeRoom: '所有水果房號都被用掉了，等有房間關掉再試試看。',
  noSuchRoom: code => `找不到房號 ${code} 的房間。`,
  badCode: input => `「${input}」不是房號。房號是英文的水果名字，例如 MANGO。`,
  roomFull: code => `房間 ${code} 已經滿了。`,
  seatHeld: code => `房間 ${code} 已經滿了，有個位子留給暫離的人。`,
  hostIsAway: code => `房間 ${code} 的房主暫離中，等房主回來再試試看。`,
  hostNotAway: code => `房間 ${code} 的房主還在，不能接手。`,
  reclaimed: code => `你現在是房間 ${code} 的房主。`,
  hostClosed: code => `房主把房間 ${code} 關掉了，你回到自己的花園。`,
  welcomeBack: code => `歡迎回到房間 ${code}。`,
  closedWhileAway: code => `你暫離的時候，房間 ${code} 已經關掉了。`,
  accessoryTitle: '你的配件',
  accessorySet: name => `你的 Claude 現在戴著${name}。`,
  accessoryTaken: name => `房間裡已經有別隻 Claude 戴著${name}了。`,
  unknownAccessory: input => `沒有「${input}」這個配件。`,
  accessoryAlone: '獨自種花時，Claude 每小時換一次配件。在房間裡才能自己挑，讓大家認得出你。',
  freeAccessories: '可選的配件：',
}

const SIMPLIFIED: Strings = {
  flowers: ['雏菊', '郁金香', '向日葵', '薰衣草', '玫瑰', '矢车菊'],
  accessories: ['墨镜', '耳机', '草帽', '花冠', '兔耳朵'],
  weather: { sunny: '晴天', cloudy: '多云', rainy: '下雨', snowy: '下雪' },
  clearNight: '晴夜',
  resting: '休息中',
  planting: flower => `种${flower}`,
  watering: flower => `浇${flower}`,
  harvesting: flower => `摘${flower}`,
  storing: flower => `把${flower}放进篮子`,
  selling: (count, earned) => `卖出 ${count} 朵 +${earned} 金币`,
  stages: ['种子', '发芽', '花苞', '盛开'],
  withStage: (chore, stage) => `${chore}（${stage}）`,
  coins: count => `${count} 金币`,
  languageTitle: '花园语言',
  autoLanguage: name => `自动（跟随系统：${name}）`,
  pickHint: '↑↓ 选择 · Enter 确定 · Esc 关闭',
  languageSet: name => `Garden Claude 现在说${name}。`,
  unknownLanguage: input => `不支持“${input}”这个语言。`,
  supportedLanguages: '支持的语言：',
  badge: { host: '房主', joined: '已加入', hostAway: '房主暂离', away: '暂离' },
  claude: seat => `Claude ${seat}`,
  host: '房主',
  you: '你',
  members: { hide: '隐藏成员', show: '显示成员' },
  away: '暂离',
  roomHelp: [
    '/garden-claude-room create        开房间，拿到房间号',
    '/garden-claude-room join 房间号   加入房间（最多 3 个 Claude）',
    '/garden-claude-room leave         回到自己的花园',
    '/garden-claude-room host 房间号   接管房主不在的房间',
  ].join('\n'),
  aloneStatus: '你现在一个人在种花。',
  roomStatus: (code, isHost) => (isHost ? `你是房间 ${code} 的房主。` : `你在房间 ${code} 里。`),
  created: code => `房间开好了，房间号 ${code}。其他人输入 /garden-claude-room join ${code} 即可加入`,
  joined: code => `你加入了房间 ${code}。`,
  left: code => `你离开了房间 ${code}，回到自己的花园。`,
  closed: code => `你关闭了房间 ${code}，大家都回到自己的花园了。`,
  alreadyIn: code => `你已经在房间 ${code} 里了，请先离开。`,
  notIn: '你不在任何房间里。',
  noFreeRoom: '所有水果房间号都被占用了，等有房间关闭再试吧。',
  noSuchRoom: code => `找不到房间号为 ${code} 的房间。`,
  badCode: input => `“${input}”不是房间号。房间号是英文水果名，例如 MANGO。`,
  roomFull: code => `房间 ${code} 已经满了。`,
  seatHeld: code => `房间 ${code} 已经满了，有个位置留给暂离的人。`,
  hostIsAway: code => `房间 ${code} 的房主暂时不在，等房主回来再试吧。`,
  hostNotAway: code => `房间 ${code} 的房主还在，不能接管。`,
  reclaimed: code => `你现在是房间 ${code} 的房主。`,
  hostClosed: code => `房主关闭了房间 ${code}，你回到自己的花园了。`,
  welcomeBack: code => `欢迎回到房间 ${code}。`,
  closedWhileAway: code => `你不在的时候，房间 ${code} 已经关闭了。`,
  accessoryTitle: '你的配饰',
  accessorySet: name => `你的 Claude 现在戴着${name}。`,
  accessoryTaken: name => `房间里已经有别的 Claude 戴着${name}了。`,
  unknownAccessory: input => `没有“${input}”这个配饰。`,
  accessoryAlone: '独自种花时，Claude 每小时换一次配饰。进了房间才能自己选，让大家认出你。',
  freeAccessories: '可选的配饰：',
}

const JAPANESE: Strings = {
  flowers: ['デイジー', 'チューリップ', 'ひまわり', 'ラベンダー', 'バラ', 'ヤグルマギク'],
  accessories: ['サングラス', 'ヘッドホン', '麦わら帽子', '花かんむり', 'うさ耳'],
  weather: { sunny: '晴れ', cloudy: 'くもり', rainy: '雨', snowy: '雪' },
  clearNight: '晴れた夜',
  resting: '休憩中',
  planting: flower => `${flower}の種まき`,
  watering: flower => `${flower}に水やり`,
  harvesting: flower => `${flower}を収穫`,
  storing: flower => `${flower}をかごへ`,
  selling: (count, earned) => `${count}本販売 +${earned} コイン`,
  stages: ['種', '芽', 'つぼみ', '満開'],
  withStage: (chore, stage) => `${chore}、${stage}`,
  coins: count => `${count} コイン`,
  languageTitle: 'ガーデンの言語',
  autoLanguage: name => `自動（パソコンの設定：${name}）`,
  pickHint: '↑↓ 選ぶ · Enter 決定 · Esc 閉じる',
  languageSet: name => `Garden Claude はこれから${name}で話します。`,
  unknownLanguage: input => `「${input}」には対応していません。`,
  supportedLanguages: '対応言語：',
  badge: { host: 'ホスト', joined: '参加中', hostAway: 'ホスト不在', away: '不在' },
  claude: seat => `Claude ${seat}`,
  host: 'ホスト',
  you: 'あなた',
  members: { hide: 'メンバーを隠す', show: 'メンバーを表示' },
  away: '不在',
  roomHelp: [
    '/garden-claude-room create         ルームを作ってコードをもらう',
    '/garden-claude-room join コード    ルームに参加（Claude は 3 人まで）',
    '/garden-claude-room leave          自分のガーデンに戻る',
    '/garden-claude-room host コード    ホスト不在のルームを引き継ぐ',
  ].join('\n'),
  aloneStatus: 'ひとりでガーデニング中です。',
  roomStatus: (code, isHost) => (isHost ? `ルーム ${code} のホストです。` : `ルーム ${code} に参加中です。`),
  created: code => `ルーム ${code} を開きました。ほかの人は /garden-claude-room join ${code} で参加できます`,
  joined: code => `ルーム ${code} に参加しました。`,
  left: code => `ルーム ${code} を出て、自分のガーデンに戻りました。`,
  closed: code => `ルーム ${code} を閉じました。みんな自分のガーデンに戻りました。`,
  alreadyIn: code => `すでにルーム ${code} にいます。先に退出してください。`,
  notIn: 'ルームに参加していません。',
  noFreeRoom: 'フルーツのコードがすべて使われています。どこかのルームが閉じてからもう一度お試しください。',
  noSuchRoom: code => `開いているルーム ${code} はありません。`,
  badCode: input => `「${input}」はルームコードではありません。コードは MANGO のような英語のフルーツ名です。`,
  roomFull: code => `ルーム ${code} は満員です。`,
  seatHeld: code => `ルーム ${code} は満員です。離席中の人の席が確保されています。`,
  hostIsAway: code => `ルーム ${code} のホストは不在です。ホストが戻ったらもう一度お試しください。`,
  hostNotAway: code => `ルーム ${code} のホストは在席中なので、引き継げません。`,
  reclaimed: code => `ルーム ${code} のホストになりました。`,
  hostClosed: code => `ホストがルーム ${code} を閉じました。自分のガーデンに戻りました。`,
  welcomeBack: code => `ルーム ${code} におかえりなさい。`,
  closedWhileAway: code => `不在の間にルーム ${code} は閉じられました。`,
  accessoryTitle: 'あなたのアクセサリー',
  accessorySet: name => `あなたの Claude は${name}をつけました。`,
  accessoryTaken: name => `ルームのほかの Claude がすでに${name}をつけています。`,
  unknownAccessory: input => `「${input}」というアクセサリーはありません。`,
  accessoryAlone: 'ひとりのとき、Claude は 1 時間ごとにアクセサリーを変えます。ルームではひとつ選んで、ほかの人に見分けてもらいましょう。',
  freeAccessories: '選べるアクセサリー：',
}

const KOREAN: Strings = {
  flowers: ['데이지', '튤립', '해바라기', '라벤더', '장미', '수레국화'],
  accessories: ['선글라스', '헤드폰', '밀짚모자', '화관', '토끼 귀'],
  weather: { sunny: '맑음', cloudy: '흐림', rainy: '비', snowy: '눈' },
  clearNight: '맑은 밤',
  resting: '휴식 중',
  planting: flower => `${flower} 심기`,
  watering: flower => `${flower} 물주기`,
  harvesting: flower => `${flower} 수확`,
  storing: flower => `${flower}${hasFinalConsonant(flower) ? '을' : '를'} 바구니에 담기`,
  selling: (count, earned) => `${count}송이 판매 +${earned} 코인`,
  stages: ['씨앗', '새싹', '꽃봉오리', '만개'],
  withStage: (chore, stage) => `${chore}, ${stage}`,
  coins: count => `${count} 코인`,
  languageTitle: '정원 언어',
  autoLanguage: name => `자동 (컴퓨터 설정: ${name})`,
  pickHint: '↑↓ 선택 · Enter 확인 · Esc 닫기',
  languageSet: name => `Garden Claude가 이제 ${name}(으)로 말해요.`,
  unknownLanguage: input => `"${input}"은(는) 지원하지 않는 언어예요.`,
  supportedLanguages: '지원 언어:',
  badge: { host: '방장', joined: '참여 중', hostAway: '방장 부재', away: '부재' },
  claude: seat => `Claude ${seat}`,
  host: '방장',
  you: '나',
  members: { hide: '멤버 숨기기', show: '멤버 보기' },
  away: '자리 비움',
  roomHelp: [
    '/garden-claude-room create         방을 만들고 코드 받기',
    '/garden-claude-room join 코드      방에 참여 (Claude 최대 3명)',
    '/garden-claude-room leave          내 정원으로 돌아가기',
    '/garden-claude-room host 코드      방장이 자리를 비운 방 넘겨받기',
  ].join('\n'),
  aloneStatus: '혼자 정원을 가꾸고 있어요.',
  roomStatus: (code, isHost) => (isHost ? `${code} 방의 방장이에요.` : `${code} 방에 있어요.`),
  created: code => `${code} 방을 열었어요. 다른 사람은 /garden-claude-room join ${code} 명령으로 참여할 수 있어요`,
  joined: code => `${code} 방에 참여했어요.`,
  left: code => `${code} 방을 나와 내 정원으로 돌아왔어요.`,
  closed: code => `${code} 방을 닫았어요. 모두 자기 정원으로 돌아갔어요.`,
  alreadyIn: code => `이미 ${code} 방에 있어요. 먼저 나가 주세요.`,
  notIn: '참여 중인 방이 없어요.',
  noFreeRoom: '모든 과일 코드가 사용 중이에요. 방이 하나 닫히면 다시 시도해 주세요.',
  noSuchRoom: code => `열려 있는 ${code} 방이 없어요.`,
  badCode: input => `"${input}"은(는) 방 코드가 아니에요. 코드는 MANGO처럼 영어 과일 이름이에요.`,
  roomFull: code => `${code} 방이 꽉 찼어요.`,
  seatHeld: code => `${code} 방이 꽉 찼어요. 자리를 비운 사람의 자리를 맡아 두고 있어요.`,
  hostIsAway: code => `${code} 방의 방장이 자리를 비웠어요. 돌아오면 다시 시도해 주세요.`,
  hostNotAway: code => `${code} 방의 방장이 자리에 있어서 넘겨받을 수 없어요.`,
  reclaimed: code => `이제 ${code} 방의 방장이에요.`,
  hostClosed: code => `방장이 ${code} 방을 닫았어요. 내 정원으로 돌아왔어요.`,
  welcomeBack: code => `${code} 방에 다시 오신 걸 환영해요.`,
  closedWhileAway: code => `자리를 비운 사이에 ${code} 방이 닫혔어요.`,
  accessoryTitle: '내 액세서리',
  accessorySet: name => `내 Claude가 이제 ${name}을(를) 하고 있어요.`,
  accessoryTaken: name => `방의 다른 Claude가 이미 ${name}을(를) 하고 있어요.`,
  unknownAccessory: input => `"${input}"(이)라는 액세서리는 없어요.`,
  accessoryAlone: '혼자일 때는 Claude가 한 시간마다 액세서리를 바꿔요. 방에서는 하나 골라 두면 서로 구별하기 쉬워요.',
  freeAccessories: '고를 수 있는 액세서리:',
}

export const STRINGS: Record<Language, Strings> = {
  en: ENGLISH,
  'zh-TW': TRADITIONAL,
  'zh-CN': SIMPLIFIED,
  ja: JAPANESE,
  ko: KOREAN,
}

export const languageName = (code: Language): string =>
  LANGUAGES.find(language => language.code === code)?.name ?? code

const flowerName = (strings: Strings, kind: number): string =>
  strings.flowers[kind % strings.flowers.length] ?? strings.flowers[0]

const withStageOf = (strings: Strings, job: Job, chore: string): string => {
  const stage = strings.stages[job.stage - 1]
  return stage === undefined ? chore : strings.withStage(chore, stage)
}

export const doingText = (strings: Strings, job: Job, isWorking: boolean): string => {
  if (!isWorking) return strings.resting
  switch (job.kind) {
    case 'planting':
      return withStageOf(strings, job, strings.planting(flowerName(strings, job.flower)))
    case 'watering':
      return withStageOf(strings, job, strings.watering(flowerName(strings, job.flower)))
    case 'harvesting':
      return withStageOf(strings, job, strings.harvesting(flowerName(strings, job.flower)))
    case 'storing':
      return strings.storing(flowerName(strings, job.flower))
    case 'selling':
      return strings.selling(job.count, job.earned)
    default:
      return strings.resting
  }
}

export const languageFromLocale = (locale: string): Language => {
  const tag = locale.toLowerCase().replace(/_/g, '-')
  if (tag.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN'
  if (tag.startsWith('ja')) return 'ja'
  if (tag.startsWith('ko')) return 'ko'
  return 'en'
}

const ZONE_LANGUAGES: Readonly<Record<string, Language>> = {
  'Asia/Taipei': 'zh-TW',
  'Asia/Hong_Kong': 'zh-TW',
  'Asia/Macau': 'zh-TW',
  'Asia/Shanghai': 'zh-CN',
  'Asia/Chongqing': 'zh-CN',
  'Asia/Harbin': 'zh-CN',
  'Asia/Urumqi': 'zh-CN',
  'Asia/Tokyo': 'ja',
  'Asia/Seoul': 'ko',
}

const isReadableLocale = (locale: string | undefined): locale is string =>
  locale !== undefined && locale.trim() !== '' && !/^(c|posix)(\.|$)/i.test(locale)

export const detectLanguage = (locales: readonly (string | undefined)[], timeZone: string): Language => {
  const locale = locales.find(isReadableLocale)
  if (locale) return languageFromLocale(locale)
  return ZONE_LANGUAGES[timeZone] ?? 'en'
}

export const parseLanguage = (input: string): Language | 'auto' | null => {
  const wanted = input.trim().toLowerCase().replace(/_/g, '-')
  if (wanted === 'auto') return 'auto'
  const exact = LANGUAGES.find(
    language => language.code.toLowerCase() === wanted || language.name.toLowerCase() === wanted,
  )
  if (exact) return exact.code
  if (['zh-hant', 'tw', 'traditional', 'traditional chinese'].includes(wanted)) return 'zh-TW'
  if (['zh-hans', 'cn', 'simplified', 'simplified chinese'].includes(wanted)) return 'zh-CN'
  if (['english', 'japanese', 'korean'].includes(wanted)) {
    return wanted === 'english' ? 'en' : wanted === 'japanese' ? 'ja' : 'ko'
  }
  return null
}

export const parseAccessory = (input: string): number | null => {
  const wanted = input.trim().toLowerCase().replace(/^an? /, '')
  for (const { code } of LANGUAGES) {
    const found = STRINGS[code].accessories.findIndex(name => name.toLowerCase() === wanted)
    if (found >= 0) return found
  }
  return null
}
