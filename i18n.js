"use strict";
/* Калорія — interface translations.
   To add a language: copy the `en` block, translate the values, add its code to LANGS. */

const LANGS = {
  uk: { name: "Українська", locale: "uk-UA" },
  en: { name: "English",    locale: "en-GB" },
};

const I18N = {
  uk: {
    brand1: "Кало", brand2: "рія",
    "tab.new": "Аналіз", "tab.hist": "Історія",
    "settings.open": "Налаштування",

    "install.android": "Встанови «Калорію» на головний екран: відкривається як застосунок.",
    "install.ios": 'Щоб встановити: натисни <span class="ios-share" aria-label="Поділитися"></span> «Поділитися» внизу Safari, потім «На початковий екран».',
    "install.btn": "Встановити", "close": "Закрити",

    "gate.title": "Код доступу",
    "gate.text": "Застосунок у закритому тестуванні. Введи код, який тобі дали.",
    "gate.ph": "Код", "gate.btn": "Продовжити", "gate.wrong": "Невірний код",

    "goal.aria": "Денна ціль", "goal.today": "Сьогодні", "goal.edit": "Змінити ціль",
    "goal.label": "Денна ціль калорій", "goal.save": "Зберегти ціль", "cancel": "Скасувати",
    "goal.left": "Залишилось {n} ккал · {p}%", "goal.over": "Перевищено на {n} ккал",
    "goal.macro": "Б {p} · Ж {f} · В {c} г", "goal.none": "Ще нічого не з'їдено", "goal.of": "/ {n} ккал",
    "goal.meter": "Прогрес денної цілі",

    "s1": "Фото тарілки", "drop.title": "Сфотографуй страву", "drop.text": "Зверху, при денному світлі, вся тарілка в кадрі",
    "camera": "Камера", "gallery": "Галерея", "photo.alt": "Фото страви",
    "s2": "Загальна вага порції", "weight.aria": "Вага в грамах", "g": "г", "kcal": "ккал",
    "weight.note": "Вага їжі без тарілки. Якщо зважуєш з тарілкою, відніми її вагу.",
    "hint.ph": "Підказка (необов'язково): «соус песто», «смажено на оливковій олії», «веганське»",
    "go": "Розібрати страву", "stop": "Стоп",

    "cam.tip": "Тарілка в колі, знімай зверху", "cam.shot": "Зробити фото",

    "st.working": "Розпізнаю інгредієнти… зазвичай 10–30 секунд",
    "st.saved": "Збережено в історію", "st.saveFail": "Не вдалося зберегти в історію",
    "st.notFood": "На фото не видно їжі: {x}", "st.noIng": "Не вдалося визначити інгредієнти. Спробуй інше фото.",
    "st.camDenied": "Доступ до камери заборонено. Дозволь камеру в налаштуваннях браузера або вибери фото з галереї.",
    "st.decode": "Не вдалося відкрити це фото. Спробуй JPEG або PNG.",
    "st.offline": "Немає інтернету. Аналіз потребує з'єднання.",

    "err.code": "Потрібен код доступу.", "err.rate": "Забагато запитів. Спробуй за хвилину.",
    "err.too_big": "Фото завелике. Спробуй інше.", "err.weight": "Вкажи вагу від 1 до 5000 г.",
    "err.no_image": "Немає фото.", "err.overloaded": "Claude перевантажений. Спробуй ще раз.",
    "err.no_credit": "На рахунку Claude API закінчились кошти.", "err.server_config": "Сервер не налаштований. Напиши розробнику.",
    "err.bad_image": "Claude не зміг обробити фото. Спробуй інше.", "err.parse": "Відповідь не вдалося розібрати. Спробуй ще раз.",
    "err.network": "Не вдалося зв'язатися з сервером. Спробуй ще раз.", "err.generic": "Збій сервера. Спробуй ще раз.",

    "r.example": "Приклад розбору", "r.conf": "впевненість {n}%",
    "r.protein": "білки г", "r.fat": "жири г", "r.carbs": "вугл. г",
    "r.shareW": "Частка ваги", "r.shareK": "Частка калорій",
    "r.energy": "Енергія з макро: білки {p}% · жири {f}% · вуглеводи {c}% · клітковина {fi} г",
    "r.ing": "Інгредієнти", "r.th": ["Інгредієнт","%","г","ккал","Б","Ж","В"],
    "r.hidden": "прихов.", "r.benefit": "На що впливає", "r.facts": "Факти",
    "r.approx": "Оцінка орієнтовна.",

    "h.local": "Історія зберігається на цьому телефоні.",
    "h.emptyT": "Поки порожньо", "h.emptyX": "Кожен розбір страви автоматично з'явиться тут.",
    "h.today": "Сьогодні", "h.yesterday": "Вчора", "h.kcalUp": "ККАЛ", "h.hint": "підказка",
    "back": "← Історія", "del": "Видалити", "del.sure": "Точно видалити?", "dish.default": "Страва",

    "set.title": "Налаштування", "set.lang": "Мова", "set.auto": "Автоматично ({x})",
    "set.support": "Підтримати розробку",
    "set.supportText": "«Калорія» безкоштовна. Кожен аналіз фото коштує грошей на сервері, тож донати допомагають застосунку жити й розвиватися.",
    "set.mono": "Банка Monobank", "set.kofi": "Ko-fi (картка з-за кордону)",
    "set.about": "Оцінка калорійності орієнтовна і не є медичною порадою.",
    "set.back": "← Назад",
    "nudge.text": "Подобається «Калорія»? Підтримай розробку, якщо застосунок тобі корисний.",
    "nudge.btn": "Підтримати", "nudge.later": "Пізніше",
  },

  en: {
    brand1: "Kalo", brand2: "riya",
    "tab.new": "Analyse", "tab.hist": "History",
    "settings.open": "Settings",

    "install.android": "Install Kaloriya on your home screen: it opens like an app.",
    "install.ios": 'To install: tap <span class="ios-share" aria-label="Share"></span> Share at the bottom of Safari, then “Add to Home Screen”.',
    "install.btn": "Install", "close": "Close",

    "gate.title": "Access code",
    "gate.text": "The app is in closed testing. Enter the code you were given.",
    "gate.ph": "Code", "gate.btn": "Continue", "gate.wrong": "Wrong code",

    "goal.aria": "Daily goal", "goal.today": "Today", "goal.edit": "Change goal",
    "goal.label": "Daily calorie goal", "goal.save": "Save goal", "cancel": "Cancel",
    "goal.left": "{n} kcal left · {p}%", "goal.over": "{n} kcal over",
    "goal.macro": "P {p} · F {f} · C {c} g", "goal.none": "Nothing eaten yet", "goal.of": "/ {n} kcal",
    "goal.meter": "Daily goal progress",

    "s1": "Plate photo", "drop.title": "Take a photo of your meal", "drop.text": "From above, in daylight, the whole plate in frame",
    "camera": "Camera", "gallery": "Gallery", "photo.alt": "Meal photo",
    "s2": "Total portion weight", "weight.aria": "Weight in grams", "g": "g", "kcal": "kcal",
    "weight.note": "Weight of the food without the plate. If you weigh it on the plate, subtract the plate.",
    "hint.ph": "Hint (optional): “pesto sauce”, “fried in olive oil”, “vegan”",
    "go": "Analyse meal", "stop": "Stop",

    "cam.tip": "Plate inside the circle, shoot from above", "cam.shot": "Take photo",

    "st.working": "Recognising ingredients… usually 10–30 seconds",
    "st.saved": "Saved to history", "st.saveFail": "Couldn't save to history",
    "st.notFood": "No food in the photo: {x}", "st.noIng": "Couldn't identify the ingredients. Try another photo.",
    "st.camDenied": "Camera access is blocked. Allow the camera in your browser settings or pick a photo from the gallery.",
    "st.decode": "Couldn't open this photo. Try a JPEG or PNG.",
    "st.offline": "No internet connection. Analysis needs to be online.",

    "err.code": "An access code is required.", "err.rate": "Too many requests. Try again in a minute.",
    "err.too_big": "The photo is too large. Try another one.", "err.weight": "Enter a weight from 1 to 5000 g.",
    "err.no_image": "No photo.", "err.overloaded": "Claude is overloaded. Try again.",
    "err.no_credit": "The Claude API account is out of credit.", "err.server_config": "The server isn't configured. Contact the developer.",
    "err.bad_image": "Claude couldn't process the photo. Try another one.", "err.parse": "Couldn't read the response. Try again.",
    "err.network": "Couldn't reach the server. Try again.", "err.generic": "Server error. Try again.",

    "r.example": "Sample analysis", "r.conf": "confidence {n}%",
    "r.protein": "protein g", "r.fat": "fat g", "r.carbs": "carbs g",
    "r.shareW": "Share of weight", "r.shareK": "Share of calories",
    "r.energy": "Energy from macros: protein {p}% · fat {f}% · carbs {c}% · fibre {fi} g",
    "r.ing": "Ingredients", "r.th": ["Ingredient","%","g","kcal","P","F","C"],
    "r.hidden": "hidden", "r.benefit": "What it's good for", "r.facts": "Facts",
    "r.approx": "This is an estimate.",

    "h.local": "History is stored on this phone.",
    "h.emptyT": "Nothing here yet", "h.emptyX": "Every meal you analyse will appear here automatically.",
    "h.today": "Today", "h.yesterday": "Yesterday", "h.kcalUp": "KCAL", "h.hint": "hint",
    "back": "← History", "del": "Delete", "del.sure": "Delete for sure?", "dish.default": "Meal",

    "set.title": "Settings", "set.lang": "Language", "set.auto": "Automatic ({x})",
    "set.support": "Support development",
    "set.supportText": "Kaloriya is free. Every photo analysis costs money on the server, so donations keep the app alive and growing.",
    "set.mono": "Monobank jar (Ukraine)", "set.kofi": "Ko-fi",
    "set.about": "Calorie estimates are approximate and are not medical advice.",
    "set.back": "← Back",
    "nudge.text": "Enjoying Kaloriya? Support development if the app is useful to you.",
    "nudge.btn": "Support", "nudge.later": "Later",
  },
};

/* Example shown before the first analysis, per language */
const EXAMPLES = {
  uk: {dish:"Гречка з тушкованими грибами та салатом",cooking_method:"тушковане",cooking_note:"Гриби тушковані з цибулею на соняшниковій олії — олія додає помітну частку калорій.",confidence:.74,
    ingredients:[
     {name:"Гречка варена",percent:45,hidden:false,confidence:.9,per100:{kcal:110,protein:4.2,fat:1.1,carbs:21.3,fiber:2.7},benefit:"Повільні вуглеводи, магній і рутин — рівна енергія та підтримка судин."},
     {name:"Печериці тушковані",percent:25,hidden:false,confidence:.8,per100:{kcal:35,protein:3.1,fat:.5,carbs:3.3,fiber:2},benefit:"Вітаміни групи B і селен — обмін речовин та антиоксидантний захист."},
     {name:"Цибуля тушкована",percent:8,hidden:false,confidence:.6,per100:{kcal:44,protein:1.2,fat:.1,carbs:10,fiber:1.7},benefit:"Кверцетин і пребіотичні волокна для мікробіому."},
     {name:"Огірок і томат",percent:19,hidden:false,confidence:.85,per100:{kcal:17,protein:.8,fat:.2,carbs:3.4,fiber:1},benefit:"Вода, калій і лікопін — гідратація та серцево-судинна система."},
     {name:"Соняшникова олія",percent:3,hidden:true,confidence:.5,per100:{kcal:884,protein:0,fat:100,carbs:0,fiber:0},benefit:"Вітамін E; але це найкалорійніша складова тарілки."}],
    facts:["Гречка — не злак, а псевдозлак, родич щавлю й ревеню, тому не містить глютену.","Печериці, полежавши під сонцем, накопичують вітамін D."],
    caveats:"Кількість олії під час тушкування — головне джерело похибки (±60 ккал)."},
  en: {dish:"Buckwheat with stewed mushrooms and salad",cooking_method:"stewed",cooking_note:"Mushrooms stewed with onion in sunflower oil — the oil adds a noticeable share of calories.",confidence:.74,
    ingredients:[
     {name:"Boiled buckwheat",percent:45,hidden:false,confidence:.9,per100:{kcal:110,protein:4.2,fat:1.1,carbs:21.3,fiber:2.7},benefit:"Slow carbs, magnesium and rutin — steady energy and healthy blood vessels."},
     {name:"Stewed mushrooms",percent:25,hidden:false,confidence:.8,per100:{kcal:35,protein:3.1,fat:.5,carbs:3.3,fiber:2},benefit:"B vitamins and selenium — metabolism and antioxidant protection."},
     {name:"Stewed onion",percent:8,hidden:false,confidence:.6,per100:{kcal:44,protein:1.2,fat:.1,carbs:10,fiber:1.7},benefit:"Quercetin and prebiotic fibre for the gut microbiome."},
     {name:"Cucumber and tomato",percent:19,hidden:false,confidence:.85,per100:{kcal:17,protein:.8,fat:.2,carbs:3.4,fiber:1},benefit:"Water, potassium and lycopene — hydration and heart health."},
     {name:"Sunflower oil",percent:3,hidden:true,confidence:.5,per100:{kcal:884,protein:0,fat:100,carbs:0,fiber:0},benefit:"Vitamin E, but also the most calorie-dense part of the plate."}],
    facts:["Buckwheat isn't a grain but a pseudocereal related to sorrel and rhubarb, so it's gluten-free.","Mushrooms left in the sun build up vitamin D."],
    caveats:"The amount of oil used for stewing is the main source of error (±60 kcal)."},
};
