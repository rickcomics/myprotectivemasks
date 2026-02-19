require('dotenv').config();
const { Bot, Keyboard } = require('grammy');
const express = require('express');

// Инициализация бота
const bot = new Bot(process.env.BOT_API_KEY);

// 0. Логирование
bot.use((ctx, next) => {
  console.log('[MIDDLEWARE] Запущен для:', ctx.from?.id, 'Текст:', ctx.message?.text);
  return next();
});

// 1. Вопросы по ролям (3 на каждую)
const questions = {
  hero: [
    'Вы часто берёте на себя ответственность за чужие проблемы?',
    'Вам сложно сказать "нет", чтобы не подвести кого‑то?',
    'Вы оцениваете себя только через достижения?'
  ],
  scapegoat: [
    'Вы провоцируете конфликты, даже если можно решить мирно?',
    'Вы обвиняете других в своих проблемах?',
    'Вы сознательно нарушаете правила, чтобы "наказать" окружающих?'
  ],
  clown: [
    'Вы шутите в напряжённой ситуации, даже если это неуместно?',
    'Вы избегаете серьёзных разговоров, переводя всё в шутку?',
    'Вы используете юмор, чтобы скрыть боль?'
  ],
  invisible: [
    'Вы молчите, даже если у вас есть мнение?',
    'Вы избегаете внимания, потому что оно вызывает тревогу?',
    'Вы откладываете важные решения из‑за страха ошибиться?'
  ]
};

// 2. Альтернативы для каждой роли
const alternatives = {
  hero: [
    'Попробуйте сказать "нет" без чувства вины.',
    'Запишите 3 своих желания, не связанных с обязанностями.',
    'Позвольте себе отдохнуть без оправданий.'
  ],
  scapegoat: [
    'Перед реакцией сделайте 3 глубоких вдоха.',
    'Сформулируйте свою потребность словами (например: "Я злюсь, потому что...").',
    'Найдите безопасный способ выразить злость (спорт, творчество).'
  ],
  clown: [
    'Скажите прямо: "Мне сейчас некомфортно".',
    'Напишите в заметках, что на самом деле вас тревожит.',
    'Попросите поддержки, не используя юмор.'
  ],
  invisible: [
    'Выскажите мнение в чате (хотя бы одно предложение).',
    'Запишите 3 свои потребности за день.',
    'Сделайте маленький шаг к цели (даже 5 минут).'
  ]
};

// 3. Веса ответов и пороги
const answerWeights = { Да: 2, Иногда: 1, Нет: 0 };
const THRESHOLD_SINGLE = 4;  // Одна роль с ≥4 баллами — доминирует
const THRESHOLD_MULTIPLE = 3; // Роли с ≥3 баллами — показываем все такие


// 4. Клавиатуры
const startKeyboard = new Keyboard()
  .add('Начать самоанализ').row().resized()
  .oneTime();

const feedbackKeyboard = new Keyboard()
  .add('Да, согласен').resized()
  .add('Нет, не согласен').resized()
  .oneTime();

// 5. Состояние пользователей
const userState = new Map();


// 6. Команда /start
bot.command('start', async (ctx) => {
  await ctx.reply(
    '👋 Привет! Этот бот поможет вам отследить проявления защитных ролей из детства.\n\n' +
    'Нажмите кнопку ниже, чтобы начать.',
    { reply_markup: startKeyboard }
  );
});

// 7. Начало самоанализа
bot.hears('Начать самоанализ', async (ctx) => {
  userState.set(ctx.from.id, {
    currentQuestion: 0,
    answers: [] // { role, answer, weight }
  });
  await askNextQuestion(ctx);
});

// 8. Задать следующий вопрос
async function askNextQuestion(ctx) {
  const userId = ctx.from.id;
  const state = userState.get(userId);


  if (state.currentQuestion >= 12) {
    const detectedRoles = determineRoles(state.answers);
    await showResults(ctx, detectedRoles);
    return;
  }

  const roleIndex = Math.floor(state.currentQuestion / 3);
  const questionIndex = state.currentQuestion % 3;
  const roles = Object.keys(questions);
  const currentRole = roles[roleIndex];
  const question = questions[currentRole][questionIndex];

  const answerKeyboard = new Keyboard()
    .add('Да')
    .row()
    .resized()
    .add('Нет')
    .row()
    .resized()
    .add('Иногда')
    .resized()
    .oneTime();

  await ctx.reply(question, { reply_markup: answerKeyboard });
}


// 9. Определение ролей
function determineRoles(answers) {
  const score = { hero: 0, scapegoat: 0, clown: 0, invisible: 0 };


  answers.forEach(({ role, weight }) => {
    score[role] += weight;
  });

  const detected = [];

  // Сначала ищем доминирующую роль (≥4 баллов)
  for (const role in score) {
    if (score[role] >= THRESHOLD_SINGLE) {
      detected.push(role);
    }
  }

  // Если нет доминирующей, ищем все роли с ≥3 баллов
  if (detected.length === 0) {
    for (const role in score) {
      if (score[role] >= THRESHOLD_MULTIPLE) {
        detected.push(role);
      }
    }
  }

  return detected.length > 0 ? detected : ['neutral'];
}

// 10. Показ результатов и запрос обратной связи
async function showResults(ctx, roles) {
  const roleNames = {
    hero: 'Герой',
    scapegoat: 'Козёл отпущения',
    clown: 'Шут',
    invisible: 'Невидимка',
    neutral: 'Признаки ролей не выражены ярко'
  };

  if (roles[0] === 'neutral') {
    await ctx.reply(
      '🔍 Признаки ролей не выражены ярко. Возможно, вы уже выработали гибкие стратегии поведения.\n\n' +
      'Хотите попробовать ещё раз? Нажмите /start.',
      { reply_markup: feedbackKeyboard }
    );
    return;
  }

  let resultText = '🎭 Вы проявили признаки следующих ролей:\n';
  for (const role of roles) {
    resultText += `• ${roleNames[role]}\n`;
  }

  resultText += '\n💡 Попробуйте альтернативные действия:\n';

  for (const role of roles) {
    resultText += `\n*Для роли "${roleNames[role]}":*\n`;
    resultText += alternatives[role].map((alt, i) =>
      `  ${i + 1}. ${alt}`
    ).join('\n');
  }

  resultText += '\n\n📌 Помните: это не диагноз, а возможность выбрать новый сценарий.';

  await ctx.reply(resultText, { parse_mode: 'Markdown' });

  // 11. Запрос обратной связи
  await ctx.reply(
    'Согласны ли вы с результатами?',
    { reply_markup: feedbackKeyboard }
  );

  // Сохраняем роли для обработки ответа
  userState.get(ctx.from.id).detectedRoles = roles;
}
// 12.
bot.hears(['Да, согласен', 'Нет, не согласен'], async (ctx) => {
  const userId = ctx.from.id;
  const state = userState.get(userId);

  // Если нет состояния или ролей — выходим
  if (!state || !state.detectedRoles) {
    console.log(`[ERROR] Нет состояния для пользователя ${userId}`);
    return;
  }

  // Очищаем состояние
  userState.delete(userId);
  console.log(`[LOG] Пользователь ${userId} завершил тест. Состояние очищено.`);

  // Отправляем ответ
  try {
    if (ctx.message.text === 'Да, согласен') {
      await ctx.reply(
        'Спасибо за обратную связь! Это помогает сделать тест точнее.\n\n' +
        'Если захотите повторить анализ — просто нажмите  /start.',
        { reply_markup: { remove_keyboard: true } }
      );
    } else {
      await ctx.reply(
        'Понял. Спасибо за честность!\n\n' +
        'Возможно, ваши стратегии поведения сложнее, чем предполагает этот тест. ' +
        'Вот несколько идей, как двигаться дальше:\n\n' +
        '1. Запишите 2–3 ситуации, где вы чувствовали дискомфорт — попробуйте найти общий паттерн.\n' +
        '2. Поговорите с близким человеком, которому доверяете: попросите его описать, как он видит ваше поведение в сложных моментах.\n' +
        '3. Вернитесь к результатам теста через неделю — возможно, взгляд изменится.\n\n' +
        'Чтобы начать заново, нажмите /start.',
        { reply_markup: { remove_keyboard: true } }
      );
    }


  } catch (error) {
    console.error('[ERROR] При отправке сообщений:', error);
  }

  return; // Явно останавливаем обработку
});


// 13.
bot.on('message', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState.get(userId);
  const text = ctx.message.text;

  console.log('[DEBUG] Получено сообщение:', text, 'UserID:', userId);

  // 1. Приоритет 1: обработка кнопок обратной связи
  if (text === 'Да, согласен' || text === 'Нет, не согласен') {
    console.log('[DEBUG] Передаём в bot.hears:', text);
    await bot.handleUpdate(ctx.update);
    return; // Явно останавливаем обработку
  }

  // 2. Приоритет 2: обработка команд
  if (text === '/start' || text === 'Начать самоанализ') {
    console.log('[DEBUG] Передаём в команду:', text);
    await bot.handleUpdate(ctx.update);
    return; // Явно останавливаем обработку
  }

  // 3. Если тест не начат или завершён
  if (!state || state.currentQuestion >= 12) {
    await ctx.reply(
      'Я пока умею только проводить тест на выявление ролей.\n' +
      'Чтобы начать, нажмите /start.',
      { reply_markup: startKeyboard }
    );
    return;
  }

  // 4. Проверка валидности ответа
  const validAnswers = ['Да', 'Нет', 'Иногда'];
  if (!validAnswers.includes(text)) {
    await ctx.reply(
      'Пожалуйста, выберите ответ из предложенных кнопок.',
      {
        reply_markup: new Keyboard()
          .add('Да').row()
          .add('Нет').row()
          .add('Иногда').oneTime()
      }
    );
    return;
  }

  // 5. Обработка валидного ответа
  try {
    const roleIndex = Math.floor(state.currentQuestion / 3);
    const roles = Object.keys(questions);
    const currentRole = roles[roleIndex];
    const weight = answerWeights[text] || 0;

    state.answers.push({ role: currentRole, answer: text, weight });
    state.currentQuestion++;

    await askNextQuestion(ctx);
  } catch (error) {
    console.error('[ERROR] При обработке ответа:', error);
    await ctx.reply('Произошла ошибка. Попробуйте начать заново: /start.');
  }
});


// 14. Обработчик ошибок
bot.catch((err, ctx) => {
  console.error('Ошибка в боте:', err);
  ctx.reply(
    'Произошла техническая ошибка. Попробуйте начать заново: /start.'
  );
});

// Настройка Express-сервера
const app = express();
app.use(express.json());

// Эндпоинт для мониторинга (обязателен для Render.com)
app.get('/', (req, res) => {
  res.status(200).send('Bot is running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Эндпоинт для Webhook Telegram
app.post(`/${process.env.BOT_API_KEY}`, async (req, res) => {
  await bot.handleUpdate(req.body, res);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Бот запущен на порту ${PORT}`);

  // Проверяем существующий Webhook перед установкой
  try {
    const webhookInfo = await bot.api.getWebhookInfo();

    if (!webhookInfo.url) {
      // Если Webhook не установлен, устанавливаем его
      const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/${process.env.BOT_API_KEY}`;
      await bot.api.setWebhook(webhookUrl);
      console.log('Webhook установлен:', webhookUrl);
    } else {
      console.log('Webhook уже активен:', webhookInfo.url);
    }
  } catch (error) {
    console.error('Ошибка при проверке/установке Webhook:', error);
  }
});

// Убираем обработчик SIGTERM — пусть Render.com управляет перезапусками
// process.on('SIGTERM', async () => { ... });