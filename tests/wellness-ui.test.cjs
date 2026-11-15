'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'..','dist','crew.js'),'utf8');
const start=js.indexOf('function wellnessResult(text){');
const end=js.indexOf('\nfunction guidance(){',start);
assert.ok(start>=0&&end>start,'wellness section renderer exists');
const fn=js.slice(start,end);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(text){return vm.runInNewContext(fn+'\nwellnessResult(text)',{text,escape});}
test('AI wellbeing advice displays as three readable sections with actionable steps',()=>{
 const output=render('Що змінилося:\nСон скоротився з 7,7 до 6,2 год.\n\nЩо спробувати сьогодні:\n1. Встановіть час відпочинку.\n2. Робіть короткі перерви.\n3. Стежте за самопочуттям.\n\nЩо перевірити завтра:\nПорівняйте втому з учора.');
 assert.equal((output.match(/class="wellness-section wellness-step-/g)||[]).length,3);
 assert.match(output,/Робіть короткі перерви/);
 assert.match(output,/Що перевірити завтра/);
});
test('assistant formatting tolerates Markdown headings, escapes HTML, and preserves old reports',()=>{
 const html=render('**Що змінилося:**\nСон <script>bad()</script>\n### **Що спробувати сьогодні:**\n1. Зробіть перерву.\n**Що перевірити завтра:**\nОцініть відпочинок.');
 assert.equal((html.match(/class="wellness-section wellness-step-/g)||[]).length,3);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 const legacy=render('Спостереження: Сон став коротшим. Обмеження: даних мало. Наступні кроки: перевірити.');
 assert.match(legacy,/crew-analysis-summary/);
});
