# Візуальні матеріали ASTRIS

Портрети вигаданих членів екіпажу створено вбудованим генератором зображень OpenAI. Це не фотографії реальних астронавтів. Остаточні локальні матеріали: `dist/assets/a1.jpg` — `dist/assets/a6.jpg`; 720 × 720, JPEG. Для автономного HTML вони вбудовані у файл, запити до зовнішнього сервера не потрібні.

Спільний промпт серії:

> Photorealistic high-end editorial studio portrait of a fictional adult astronaut, chest-up, entire head visible with generous room above hair, centered, facing camera with a slight natural three-quarter angle, calm competent expression. Dark graphite spacecraft studio backdrop, soft lavender rim light and cool soft key light, realistic skin texture. Charcoal and pale grey modern intravehicular flight suit, subtle lavender piping, no helmet, technical collar and upper torso visible. Cohesive premium photography series. No text, name tags, logos, flags or watermarks. Not a real public figure.

Індивідуальні описи:

| Матеріал | Персонаж | Доповнення до промпту |
|---|---|---|
| a1.jpg | Олена Коваль | 38-year-old woman, light skin, shoulder-length dark chestnut hair tucked back, grey-green eyes, subtle freckles, composed and approachable commander. |
| a2.jpg | Маркус Чен | 35-year-old East Asian man, short black hair, clean-shaven, thoughtful dark eyes, natural face, flight engineer. |
| a3.jpg | Амара Окафор | 36-year-old Black woman, dark skin, neat natural braids pulled back, warm dark eyes, empathetic expression, medical officer. |
| a4.jpg | Лука Моретті | 40-year-old European man, short slightly wavy dark brown hair, natural stubble, hazel eyes, calm pilot. |
| a5.jpg | Юкі Танака | 33-year-old Japanese woman, straight black hair tied back, natural loose strands, gentle focused expression, biologist. |
| a6.jpg | Софія Реєс | 37-year-old Latina woman, medium tan skin, dark curly hair tied back with a few soft curls, brown eyes, poised geologist. |

3D-модель створена процедурно з плавного об’єднання об’ємних форм. Поверхня містить 84 688 трикутників; нормалі згладжені. Це узагальнений манекен для навігації по показниках, а не скан тіла або анатомічне обстеження. Візуалізація використовує WebGL, обертання перетягуванням та клавіатурою; потрібна підтримка WebGL у браузері. Модель не змінює форму за медичними даними.

Модель версії 1.2 відтворює загальні пропорції наданого растрового референсу. Руки розведено у A-позу; додано дрібну сітку поверхні. Це процедурно відтворена форма, а не імпорт готової 3D-сітки з фотографії.
