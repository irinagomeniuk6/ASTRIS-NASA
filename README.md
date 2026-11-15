# ASTRIS 2.7 — Groq + Render + Supabase (публічне демо)

**Для розгортання журі:** почни з [`DEPLOY-GROQ-RENDER.md`](DEPLOY-GROQ-RENDER.md).

- Сайт і авторизація працюють на Render (Node.js), без постійно ввімкненого твого ПК.
- Персональні AI-поради генеруються у Groq із моделлю Qwen; Ollama залишена як локальний режим.
- Щоденники та останні AI-результати зберігаються в Supabase і переживають рестарт Render.
- Публічний операторський пароль обов’язково задається через `ASTRIS_OPERATOR_PASSWORD` (16+ символів); старий стандартний пароль не діє в production.
- Render Free не зберігає стан поточної місії та login-сесії після засинання. Сайт працює на синтетичних профілях.

---

# ASTRIS 2.6 — Ground + Crew + локальна Ollama/Qwen

ASTRIS — дослідницький симулятор для NASA Space Apps Challenge. Наземний оператор бачить усі 6 синтетичних профілів; астронавти бачать власні вимірювання, графіки, прогнози, сигнали й щоденник, а у вкладці «Екіпаж» можуть вибрати будь-кого з п’ятьох колег для перегляду його **поточних** показників. Сервер Node.js генерує одну спільну місійну телеметрію.

**Новинка 2.4:** GPT4Free повністю вилучено з активного AI-шляху. Вкладка «AI-помічник» викликає локальний Ollama API та модель `qwen3.5:4b`, відповідь повертається в Crew без зовнішнього AI-провайдера й без додаткового браузера. При відмові є окремо позначений резервний статистичний розрахунок.

### Швидкий початок

Спочатку встановіть Ollama та модель: див. [AI-SETUP.md](AI-SETUP.md).

```powershell
ollama pull qwen3.5:4b
$env:Path = "D:\Strudy\nodejs;$env:Path"
npm.cmd start
```

Вебсайт: http://127.0.0.1:4173. Акаунти: `operator` / `operatoroperator`, `astra1` / `astra1astra1` і так далі до `astra6` / `astra6astra6`.

### Перевірка

```powershell
npm.cmd test
npm.cmd run ai:check
npm.cmd run build
```

**Хостинг поки не виконувався.** Після тестування AI й інтерфейсу можна відкрити **лише вебсервер ASTRIS** через Cloudflare Tunnel — Ollama залишиться доступною тільки на `127.0.0.1:11434`. План див. [PUBLIC-DEPLOY.md](PUBLIC-DEPLOY.md).

Не використовуйте реальні медичні дані, клінічні діагнози чи публічну авторизацію на фіксованих демопаролях.


## Demo scenario: astra6 (Sofia Reyes)

The server automatically seeds **seven fictional daily self-reports** for `astra6` covering the most recent week. The reports contain gradually reduced sleep, fatigue, headaches, concentration issues, and partial improvement on the last day. These are diary reports, **not sensor measurements or diagnoses**. The other astronauts' diaries remain unchanged. Open `astra6` / `astra6astra6` → **Щоденник** to inspect them; go to **AI-помічник** → **Відправити на аналіз** to include them in the 30-day diary input alongside `astra6`'s real-time synthetic telemetry and forecasts. The original manually written diary records are preserved; only records with `source: "demo-seed"` for `a6` are rotated on server restart. Set `ASTRIS_SEED_WEEK_A6=0` before starting the server to disable future seed refreshes. See `DEMO-WEEK.md`.


## Новинка 2.5: «Екіпаж» у Crew

У меню астронавта додано розділ **«Екіпаж»**. Він показує п'ятьох інших учасників (без самого користувача) та оновлює їхні поточні вимірювання з єдиної Node.js-симуляції приблизно раз на 1,2 с: пульс, систолічний і діастолічний тиск, SpO₂, температуру та глюкозу. Вибір учасника не змінює власний профіль астронавта.

**Ізоляція на сервері:** `GET /api/crew/team` потребує ролі `astronaut`, виключає `account.crewId` і повертає лише одну останню точку для кожного з п'ятьох. Жодної історії, щоденників, прогнозів, AI-звітів, сповіщень чи акаунтів колег у відповіді немає. Операторська консоль не змінена. Усі дані є вигаданими.

Перевірка: `npm.cmd test` (включно з `tests/crew-team.test.cjs`).


## Новинка 2.6: AI-помічник із персональними порадами

Замість загального перелічування значень і автоматичного скерування до медика Qwen формує **практичні інформаційні поради для самопочуття** на основі власного щоденника (до 30 днів), короткої історії вимірювань та прогнозів. Відповідь у Crew поділена на три читабельні блоки: «Що змінилося», «Що спробувати сьогодні», «Що перевірити завтра». Для демонстраційного профілю `astra6` модель має підстави обговорити сон, втому й концентрацію, не вигадуючи медичних діагнозів. Якщо Ollama недоступна, резервний алгоритм також використовує щоденник для базових порад і чітко позначається як автоматичний, не генеративний AI.

Уточнення: автономний AI — інформаційна допомога; за небезпечних симптомів потрібна дія за протоколами місії. Графіки, Ground, командний моніторинг і обмеження доступу не змінено.
