// My Little Tamagotchi — основная логика игры
// Пути к изображениям и музыке должны совпадать с реальными именами файлов.

const SAVE_KEY = "myLittleTamagotchiSave";
const SETTINGS = {
  transitionMs: 4000,
  eggWaitMs: 5000,
  hatchAnimationMs: 3000,
  // Ускоренное время: каждые 3 минуты игровое время меняется между днём и ночью.
  dayNightMs: 3 * 60 * 1000,
  // Погода меняется каждые 2 минуты, но отображается только днём.
  weatherMs: 2 * 60 * 1000,
  // Показатели питомца меняются раз в 30 секунд.
  needsTickMs: 30 * 1000,
  // Один игровой день длится 6 минут.
  gameDayMs: 6 * 60 * 1000
};

const $ = (id) => document.getElementById(id);

const mainMenu = $("mainMenu");
const transition = $("transition");
const game = $("game");
const startButton = $("startButton");
const roomBackground = $("roomBackground");
const roomTint = $("roomTint");
const eggArea = $("eggArea");
const egg = $("egg");
const brokenEgg = $("brokenEgg");
const eggMessage = $("eggMessage");
const petArea = $("petArea");
const pet = $("pet");
const petSpeech = $("petSpeech");
const petMood = $("petMood");
const foodMenu = $("foodMenu");
const foodGrid = $("foodGrid");
const closeFoodMenu = $("closeFoodMenu");

const PET_SPRITES = {
  idle: "images/nyunya.png",
  angry: "images/nyunyaangry.png",
  hungry: "images/nyunyahungry.png",
  pat: "images/nyunyapat.png",
  sad: "images/nyunyasad.png",
  eating: "images/nyunyaeat.png",
  sleep: "images/nyunyasleep.png"
};
const FOODS = [
  { name: "pizza", file: "images/pizza.png", hunger: 24, happiness: 4 },
  { name: "strawberry shortcake", file: "images/strawberryshortcake.png", hunger: 18, happiness: 14 },
  { name: "matcha", file: "images/matcha.png", hunger: 10, happiness: 3 },
  { name: "cookie", file: "images/cookie.png", hunger: 14, happiness: 8 }
];
let spriteActionTimer = null;
let foodOverlayTimer = null;
const statusPanel = $("statusPanel");
const actionPanel = $("actionPanel");
const musicPlayer = $("music-player");
const soundToggle = $("soundToggle");
const timeLabel = $("timeLabel");
const weatherIcon = $("weatherIcon");
const ageLabel = $("ageLabel");
const toast = $("toast");

const statElements = {
  hunger: { bar: $("hungerBar"), value: $("hungerValue") },
  happiness: { bar: $("happinessBar"), value: $("happinessValue") },
  energy: { bar: $("energyBar"), value: $("energyValue") },
  cleanliness: { bar: $("cleanlinessBar"), value: $("cleanlinessValue") }
};

// Use the six songs and exact filenames supplied for the project.
const playlist = {
  music: [
    { name: "Secret potion", file: "music/secret potion.m4a" },
    { name: "Nintendo eShop", file: "music/Wii U System Music - Nintendo eShop.mp3" },
    { name: "Photo Channel", file: "music/Photo Channel.mp3" },
    { name: "Wonder2", file: "music/Wonder2.mp3" },
    { name: "Perfume", file: "music/Perfume.mp3" },
    { name: "Electro World", file: "music/electro world.m4a" }
  ]
};

let daytime = "day";
let weather = "sunny";
let weatherIndex = 0;
let currentSong = 0;
let isMuted = false;
let timersStarted = false;
let toastTimeout = null;
const audio = new Audio();
audio.preload = "metadata";

function defaultSave() {
  return {
    hasStarted: false,
    hatched: false,
    lastSavedAt: Date.now(),
    gameAgeMs: 0,
    needs: { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 },
    sleeping: false,
    soundEnabled: true
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    const base = defaultSave();
    return {
      ...base,
      ...parsed,
      needs: { ...base.needs, ...(parsed.needs || {}) }
    };
  } catch (error) {
    console.warn("Не удалось прочитать сохранение:", error);
    return defaultSave();
  }
}

let save = loadSave();

function saveGame() {
  save.lastSavedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    console.warn("Не удалось сохранить игру:", error);
    showToast("Не получилось сохранить прогресс в браузере.");
  }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2300);
}

function setSpeech(message) {
  petSpeech.textContent = message;
}

function setRoomBackground(src) {
  // If a room image is missing, keep the previous valid background rather than showing a blank screen.
  const testImage = new Image();
  testImage.onload = () => { roomBackground.src = src; };
  testImage.onerror = () => {
    console.warn("Не удалось загрузить фон:", src);
    showToast("Не нашла файл " + src + " — оставила предыдущий фон.");
  };
  testImage.src = src;
}

function updateRoom() {
  if (daytime === "night") {
    setRoomBackground("images/roomnight.png");
    game.classList.add("night");
    timeLabel.textContent = "Ночь";
    weatherIcon.textContent = "🌙";
  } else {
    game.classList.remove("night");
    timeLabel.textContent = "День";
    if (weather === "rain") {
      setRoomBackground("images/roomrainy.png");
      weatherIcon.textContent = "🌧️";
    } else {
      setRoomBackground("images/roomsunny.png");
      weatherIcon.textContent = "☀️";
    }
  }
}

function choosePetSprite() {
  if (!save.hatched) return;
  let mood = "idle";
  if (save.sleeping) mood = "sleep";
  else if (save.needs.hunger < 20) mood = "hungry";
  else if (save.needs.happiness < 25 || save.needs.cleanliness < 20) mood = "sad";
  else if (save.needs.happiness < 25 || save.needs.hunger < 20) mood = "angry";
  pet.onerror = () => { pet.onerror = null; pet.src = PET_SPRITES.idle; };
  pet.src = PET_SPRITES[mood] || PET_SPRITES.idle;
}

function showActionSprite(key, duration = 1500) {
  clearTimeout(spriteActionTimer);
  if (save.sleeping && key !== "sleep") { choosePetSprite(); return; }
  pet.onerror = () => { pet.onerror = null; pet.src = PET_SPRITES.idle; };
  pet.src = PET_SPRITES[key] || PET_SPRITES.idle;
  spriteActionTimer = setTimeout(choosePetSprite, duration);
}

function buildFoodMenu() {
  foodGrid.innerHTML = "";
  FOODS.forEach((food) => {
    const button = document.createElement("button");
    button.className = "food-choice";
    button.type = "button";
    const image = document.createElement("img");
    image.src = food.file;
    image.alt = food.name;
    image.onerror = () => { image.style.visibility = "hidden"; };
    const label = document.createElement("span");
    label.textContent = food.name;
    button.append(image, label);
    button.addEventListener("click", () => feedWith(food));
    foodGrid.appendChild(button);
  });
}

function feedWith(food) {
  if (save.sleeping) { showToast("Нюня спит💤"); return; }
  save.needs.hunger = clamp(save.needs.hunger + food.hunger);
  save.needs.happiness = clamp(save.needs.happiness + food.happiness);
  save.needs.cleanliness = clamp(save.needs.cleanliness - 2);
  foodMenu.hidden = true;
  setSpeech(`Ням ням`);
  showToast(`Нюня кушает: ${food.name} 🍓`);
  updateStats();
  saveGame();
  showActionSprite("eating", 1700);
}

function openFoodMenu() {
  if (save.sleeping) { showToast("Нюня спит💤"); return; }
  foodMenu.hidden = false;
}

function updateStats() {
  for (const [key, elements] of Object.entries(statElements)) {
    const value = Math.round(clamp(save.needs[key]));
    elements.bar.style.width = value + "%";
    elements.value.textContent = value + "%";
    elements.bar.setAttribute("aria-valuenow", String(value));
  }

  const n = save.needs;
  if (n.hunger < 20) {
    petMood.textContent = "🍓 Очень голодный";
    setSpeech("Нюня хочет есть");
  } else if (n.energy < 20) {
    petMood.textContent = "💤 Усталый";
    setSpeech("Нюня хочет спать...");
  } else if (n.cleanliness < 20) {
    petMood.textContent = "🫧 Нужно помыться";
    setSpeech("Кажется я stinky");
  } else if (n.happiness < 25) {
    petMood.textContent = "🥺 Скучает";
    setSpeech("Поиграй с Нюней");
  } else if (save.sleeping) {
    petMood.textContent = "💤 Спит";
    setSpeech("Zzz...");
  } else {
    petMood.textContent = "✨ Счастливый";
  }

  ageLabel.textContent = String(Math.max(1, Math.floor(save.gameAgeMs / SETTINGS.gameDayMs) + 1));
  if (!spriteActionTimer) choosePetSprite();
}

function showPetGame() {
  mainMenu.hidden = true;
  transition.hidden = true;
  game.hidden = false;
  eggArea.hidden = true;
  petArea.hidden = false;
  statusPanel.hidden = false;
  actionPanel.hidden = false;
  musicPlayer.hidden = false;
  updateRoom();
  updateStats();
  choosePetSprite();
  startTimers();
}

function showEggGame() {
  mainMenu.hidden = true;
  transition.hidden = true;
  game.hidden = false;
  eggArea.hidden = false;
  petArea.hidden = true;
  statusPanel.hidden = true;
  actionPanel.hidden = true;
  musicPlayer.hidden = false;
  egg.hidden = false;
  brokenEgg.hidden = true;
  updateRoom();
  startTimers();
}

function hatchEgg() {
  egg.hidden = true;
  brokenEgg.hidden = false;
  eggMessage.textContent = "Кто то вылупляется...";
  setTimeout(() => {
    brokenEgg.hidden = true;
    eggArea.hidden = true;
    save.hatched = true;
    save.needs = { hunger: 100, happiness: 100, energy: 100, cleanliness: 100 };
    save.gameAgeMs = 0;
    save.sleeping = false;
    saveGame();
    showPetGame();
    setSpeech("Привет...");
    showToast("У тебя появилась Нюня!");
  }, SETTINGS.hatchAnimationMs);
}

function beginGame() {
  if (save.hatched) {
    showPetGame();
    return;
  }

  save.hasStarted = true;
  saveGame();
  mainMenu.hidden = true;
  musicPlayer.hidden = true;
  transition.hidden = false;

  setTimeout(() => {
    transition.hidden = true;
    showEggGame();
    eggMessage.textContent = "...";
    setTimeout(() => {
      if (!save.hatched) hatchEgg();
    }, SETTINGS.eggWaitMs);
  }, SETTINGS.transitionMs);
}

function startTimers() {
  if (timersStarted) return;
  timersStarted = true;

  setInterval(() => {
    daytime = daytime === "day" ? "night" : "day";
    updateRoom();
  }, SETTINGS.dayNightMs);

  setInterval(() => {
    weatherIndex = (weatherIndex + 1) % 2;
    weather = weatherIndex === 0 ? "sunny" : "rain";
    updateRoom();
  }, SETTINGS.weatherMs);

  setInterval(() => {
    if (!save.hatched) return;
    save.gameAgeMs += SETTINGS.needsTickMs;
    if (save.sleeping) {
      save.needs.energy = clamp(save.needs.energy + 9);
      save.needs.hunger = clamp(save.needs.hunger - 1.2);
      if (save.needs.energy >= 100) {
        save.sleeping = false;
        showToast("Нюня проснулась☀️");
      }
    } else {
      save.needs.hunger = clamp(save.needs.hunger - 2.2);
      save.needs.happiness = clamp(save.needs.happiness - 1.1);
      save.needs.energy = clamp(save.needs.energy - 1.4);
      save.needs.cleanliness = clamp(save.needs.cleanliness - 0.8);
    }
    updateStats();
    saveGame();
  }, SETTINGS.needsTickMs);
}

function performAction(action) {
  if (!save.hatched) return;
  const n = save.needs;

  if (action === "feed") {
    openFoodMenu();
    return;
  } else if (action === "play") {
    if (save.sleeping) {
      showToast("Нюня спит💤");
      return;
    }
    if (n.energy < 15) {
      showToast("Нюня слишком устала для игры.");
      return;
    }
    n.happiness = clamp(n.happiness + 22);
    n.energy = clamp(n.energy - 12);
    n.hunger = clamp(n.hunger - 5);
    setSpeech("Ура! Мне так весело! 🧸");
    showToast("Вы поиграли");
    showActionSprite("pat", 1800);
  } else if (action === "sleep") {
    save.sleeping = !save.sleeping;
    if (save.sleeping) {
      setSpeech("Zzz");
      showToast("Нюня спит🌙");
      foodMenu.hidden = true;
      showActionSprite("sleep", 24 * 60 * 60 * 1000);
    } else {
      setSpeech("Я проснулась!");
      showToast("Нюня проснулся!");
      clearTimeout(spriteActionTimer);
      spriteActionTimer = null;
      choosePetSprite();
    }
  } else if (action === "clean") {
    n.cleanliness = clamp(n.cleanliness + 45);
    n.happiness = clamp(n.happiness + 5);
    setSpeech("Теперь я не stinky");
    showToast("Нюня чистая");
  } else if (action === "pet") {
    n.happiness = clamp(n.happiness + 12);
    setSpeech("Когда вампиры?💕");
    showToast("Ты погладила питомца!");
    showActionSprite("pat", 1500);
  }

  updateStats();
  saveGame();
}

startButton.addEventListener("click", beginGame);
closeFoodMenu.addEventListener("click", () => { foodMenu.hidden = true; });
buildFoodMenu();

actionPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) performAction(button.dataset.action);
});

soundToggle.addEventListener("click", () => {
  save.soundEnabled = !save.soundEnabled;
  audio.muted = !save.soundEnabled || isMuted;
  soundToggle.textContent = save.soundEnabled ? "🔊" : "🔇";
  saveGame();
});

window.addEventListener("beforeunload", saveGame);

// ---------------- MUSIC PLAYER ----------------
const playButton = $("play");
const muteButton = $("mute");
const nextButton = $("next");
const prevButton = $("prev");
const songName = $("song-name");

function loadSong(shouldPlay = false) {
  if (!playlist.music.length) return;
  const song = playlist.music[currentSong];
  audio.pause();
  audio.currentTime = 0;
  audio.src = song.file;
  songName.textContent = song.name;
  playButton.textContent = "▶";
  if (shouldPlay) playSong();
}

async function playSong() {
  try {
    audio.muted = isMuted || !save.soundEnabled;
    await audio.play();
    playButton.textContent = "⏸";
  } catch (error) {
    playButton.textContent = "▶";
    console.warn("Музыка не запустилась. Проверь путь и имя файла:", audio.src, error);
    showToast("Не удалось включить музыку — проверь файл в папке music.");
  }
}

function changeSong(direction) {
  currentSong = (currentSong + direction + playlist.music.length) % playlist.music.length;
  loadSong(true);
}

playButton.addEventListener("click", () => {
  if (audio.paused) playSong();
  else {
    audio.pause();
    playButton.textContent = "▶";
  }
});

nextButton.addEventListener("click", () => changeSong(1));
prevButton.addEventListener("click", () => changeSong(-1));

muteButton.addEventListener("click", () => {
  isMuted = !isMuted;
  audio.muted = isMuted || !save.soundEnabled;
  muteButton.textContent = isMuted ? "🔇" : "🔊";
});

audio.addEventListener("ended", () => changeSong(1));
audio.addEventListener("play", () => { playButton.textContent = "⏸"; });
audio.addEventListener("pause", () => { playButton.textContent = "▶"; });

// Initialise UI and resume the saved pet if one already exists.
loadSong(false);
audio.muted = !save.soundEnabled;
soundToggle.textContent = save.soundEnabled ? "🔊" : "🔇";

if (save.hatched) {
  showPetGame();
} else {
  mainMenu.hidden = false;
  transition.hidden = true;
  game.hidden = true;
  musicPlayer.hidden = false;
}

// For testing only: type resetTamagotchi() in the browser console to start from the egg again.
window.resetTamagotchi = function () {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};
