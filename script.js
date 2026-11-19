"use strict";

const $ = id => document.getElementById(id);

const rooms = {
  "Quiet Zone": { seats: 12, type: "quiet", label: "QUIET", icon: "◌", description: "A calm corner for uninterrupted focus.", glow: "#6cf5e7" },
  "Reading Hall": { seats: 16, type: "quiet", label: "READING", icon: "▤", description: "An open, light-filled space for deep reading.", glow: "#aa9bff" },
  "Window Bay": { seats: 8, type: "quiet", label: "RELAXED", icon: "☼", description: "A bright spot by the windows to reset and think.", glow: "#f3c47b" },
  "Computer Lab": { seats: 12, type: "technology", label: "TECH", icon: "⌘", description: "A connected workspace for coding and digital work.", glow: "#6cf5e7" },
  "Discussion Room A": { seats: 6, type: "collaborative", label: "GROUP", icon: "⌁", description: "A focused room for small team discussions.", glow: "#aa9bff" },
  "Discussion Room B": { seats: 6, type: "collaborative", label: "GROUP", icon: "⌁", description: "A second space for exchanging ideas together.", glow: "#f3c47b" },
  "Group Study Room": { seats: 8, type: "collaborative", label: "TEAM", icon: "♧", description: "Bring your group together and work through ideas.", glow: "#8ee3b4" },
  "Research Room": { seats: 8, type: "quiet", label: "RESEARCH", icon: "⌕", description: "A dedicated place for thoughtful, detailed work.", glow: "#aa9bff" }
};

const read = (key, fallback = []) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const user = {
  name: sessionStorage.getItem("name") || "",
  role: sessionStorage.getItem("role") || "student"
};

const userId = user.name.trim().toLowerCase();
const isAdmin = user.role === "admin";

let bookings = read("lumen_bookings", read("bookings"));
let selectedSeat = null;
let toastTimer;
let currentBookingFilter = "all";
let sprintSeconds = 25 * 60;
let sprintInterval = null;


// TOAST NOTIFICATIONS

function showToast(message) {
  const toast = $("toast");

  if (!toast) return alert(message);

  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3000);
}


// BOOKING STORAGE

function saveBookings() {
  localStorage.setItem("lumen_bookings", JSON.stringify(bookings));
  localStorage.setItem("bookings", JSON.stringify(bookings));
}

function refreshBookings() {
  bookings = read("lumen_bookings", read("bookings"));
}

function notify(owner, message, title = "Library update") {
  const key = "lumen_notifications_" + owner;
  const notes = read(key);

  notes.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    message,
    time: new Date().toLocaleString()
  });

  localStorage.setItem(key, JSON.stringify(notes));

  if (owner === userId) renderNotifications();
}

function getNotes() {
  return read("lumen_notifications_" + userId);
}


// TIME FUNCTIONS

function mins(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + (m || 0);
}

function overlaps(a, b, c, d) {
  return a < d && c < b;
}

function endOf(b) {
  return mins(b.start) + Number(b.duration) * 60;
}

function isSeatBusy(room, seat, date, start, duration) {
  refreshBookings();

  const a = mins(start);
  const b = a + Number(duration) * 60;

  return bookings.some(x =>
    x.room === room &&
    Number(x.seat) === Number(seat) &&
    x.date === date &&
    x.status === "Active" &&
    overlaps(a, b, mins(x.start), endOf(x))
  );
}

function isUserBusy(date, start, duration) {
  refreshBookings();

  const a = mins(start);
  const b = a + Number(duration) * 60;

  return bookings.some(x =>
    x.owner === userId &&
    x.date === date &&
    x.status === "Active" &&
    overlaps(a, b, mins(x.start), endOf(x))
  );
}

function localDate(d = new Date()) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(value) {
  if (!value) return "";

  const d = new Date(value + "T12:00:00");

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatTime(value) {
  if (!value) return "";

  const [h, m] = value.split(":").map(Number);
  const d = new Date();

  d.setHours(h, m || 0);

  return d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}


// BOOKING FORM SETUP

function populateTimes() {
  const select = $("startHour");

  if (!select) return;

  select.replaceChildren();

  for (let h = 9; h <= 21; h++) {
    const suffix = h < 12 ? "AM" : "PM";
    const shown = h % 12 || 12;

    select.add(new Option(
      `${shown}:00 ${suffix}`,
      `${String(h).padStart(2, "0")}:00`
    ));
  }
}

function initializeDate() {
  const date = $("bookingDate");

  if (!date) return;

  date.min = localDate();

  if (!date.value || date.value < localDate()) {
    date.value = localDate();
  }
}

function roomSelectOptions() {
  const select = $("roomSelect");

  if (!select) return;

  select.replaceChildren(
    ...Object.keys(rooms).map(name => new Option(name, name))
  );
}


// NAVIGATION

function goToView(name) {
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === "view-" + name);
  });

  document.querySelectorAll(".nav-link").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
  });

  const titles = {
    dashboard: [
      "YOUR CAMPUS, YOUR SPACE",
      "Good day. Find your focus.",
      "A little progress today adds up to something great."
    ],
    explore: [
      "FIND YOUR PERFECT CORNER",
      "Explore library spaces",
      "Browse by atmosphere, capacity or the way you like to work."
    ],
    booking: [
      "MAKE IT YOURS",
      "Reserve your study seat",
      "Choose a room, find an available seat and set aside time."
    ],
    mybookings: [
      "YOUR STUDY SCHEDULE",
      "My bookings",
      "Keep track of your upcoming sessions and past reservations."
    ],
    gatepass: [
      "CAMPUS ENTRY",
      "Your digital gate pass",
      "A live QR pass linked to your reservation time."
    ],
    notifications: [
      "STAY IN THE LOOP",
      "Notifications",
      "Updates and reminders about your library activity."
    ],
    admin: [
      "LIBRARY CONTROL CENTER",
      "Administration",
      "A snapshot of reservations stored in this browser."
    ]
  };

  if (titles[name]) {
    $("headerEyebrow").textContent = titles[name][0];
    $("pageTitle").textContent = titles[name][1];
    $("pageSubtitle").textContent = titles[name][2];
  }

  $("sidebar")?.classList.remove("open");

  if (name === "booking") renderSeats();
  if (name === "gatepass") renderGatePass();
  if (name === "explore") renderRooms();
  if (name === "mybookings") renderBookingHistory();
  if (name === "notifications") renderNotifications();
  if (name === "admin") renderAdmin();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ROOM CARDS

function roomCard(name) {
  const r = rooms[name];

  const photos = {
    "Quiet Zone": "photo-1507842217343-583bb7270b66",
    "Reading Hall": "photo-1521587760476-6c12a4b040da",
    "Window Bay": "photo-1497366754035-f200968a6e72",
    "Computer Lab": "photo-1516321318423-f06f85e504b3",
    "Discussion Room A": "photo-1521737711867-e3b97375f902",
    "Discussion Room B": "photo-1524758631624-e2822e304c36",
    "Group Study Room": "photo-1528605248644-14dd04022da1",
    "Research Room": "photo-1456513080510-7bf3a84b82f8"
  };

  return `
    <article class="room-card" style="--room-glow:${r.glow}">
      <div class="room-card-visual"
        style="background-image:linear-gradient(0deg,#09132166,#09132122),url(https://images.unsplash.com/${photos[name]}?auto=format&fit=crop&w=900&q=85)">
        <span>${r.icon}</span>
        <small class="room-type">${r.label}</small>
      </div>

      <div class="room-card-body">
        <h3>${name}</h3>
        <p>${r.description}</p>

        <div class="room-card-meta">
          <span>⌂ ${r.seats} seats</span>
          <span>
            <b>${r.type === "quiet" ? "Quiet study" :
              r.type === "technology" ? "Technology" : "Collaborative"}</b>
          </span>
        </div>

        <button class="button secondary" data-book-room="${name}">
          Choose this space ↗
        </button>
      </div>
    </article>
  `;
}

function renderFeatured() {
  const el = $("featuredRooms");

  if (!el) return;

  const names = [
    "Quiet Zone",
    "Reading Hall",
    "Computer Lab",
    "Group Study Room"
  ];

  el.innerHTML = names.map(n => `
    <button class="room-mini" data-book-room="${n}">
      <span class="room-mini-art">${rooms[n].icon}</span>
      <span>
        <b>${n}</b>
        <small>${rooms[n].seats} seats · ${rooms[n].label.toLowerCase()}</small>
      </span>
    </button>
  `).join("");
}

function renderRooms() {
  const container = $("allRooms");

  if (!container) return;

  const q = ($("roomSearch")?.value || "").trim().toLowerCase();
  const type = $("roomFilter")?.value || "all";
  const cap = $("capacityFilter")?.value || "all";
  const sort = $("sortRooms")?.value || "featured";

  let names = Object.keys(rooms).filter(n => {
    const r = rooms[n];

    const matchesText =
      n.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q);

    const matchesType = type === "all" || r.type === type;

    const matchesCap =
      cap === "all" ||
      (cap === "small" && r.seats <= 8) ||
      (cap === "medium" && r.seats >= 9 && r.seats <= 12) ||
      (cap === "large" && r.seats >= 13);

    return matchesText && matchesType && matchesCap;
  });

  if (sort === "name") names.sort();

  if (sort === "capacity") {
    names.sort((a, b) => rooms[b].seats - rooms[a].seats);
  }

  container.innerHTML = names.map(roomCard).join("");

  $("noRooms")?.classList.toggle("hidden", names.length !== 0);
}


// SEAT BOOKING

function getSelectedRoom() {
  return $("roomSelect")?.value || "Quiet Zone";
}

function renderSeats() {
  const map = $("seatMap");

  if (!map) return;

  const room = getSelectedRoom();
  const date = $("bookingDate").value;
  const start = $("startHour").value;
  const duration = Number($("duration").value || 1);
  const data = rooms[room];

  if (!data) return;

  $("selectedRoomName").textContent = room;
  $("seatCountLabel").textContent = data.seats;
  $("roomTypeLabel").textContent = data.label;
  $("selectedRoomDescription").textContent = data.description;
  $("selectedRoomArt").innerHTML = `<span>${data.icon}</span>`;

  map.replaceChildren();

  let available = 0;

  for (let i = 1; i <= data.seats; i++) {
    const busy = !!(
      date &&
      start &&
      isSeatBusy(room, i, date, start, duration)
    );

    const btn = document.createElement("button");

    btn.type = "button";
    btn.className = "seat";
    btn.textContent = String(i);
    btn.dataset.seat = i;

    if (busy) {
      btn.disabled = true;
      btn.title = "Already reserved for this time";
    } else {
      available++;
      btn.title = `Select seat ${i}`;
    }

    if (selectedSeat === i && !busy) {
      btn.classList.add("chosen");
      btn.setAttribute("aria-pressed", "true");
    }

    map.append(btn);
  }

  if (selectedSeat && selectedSeat > data.seats) {
    selectedSeat = null;
  }

  $("availableRoomCount").textContent = available;

  const summary = $("bookingSummary");

  if (selectedSeat) {
    summary.innerHTML = `
      <span class="summary-icon">✓</span>
      <span>
        <b>${room} · Seat ${selectedSeat}</b>
        <small>
          ${formatDate(date)} · ${formatTime(start)} ·
          ${duration} hour${duration > 1 ? "s" : ""}
        </small>
      </span>
    `;
  } else {
    summary.innerHTML = `
      <span class="summary-icon">✦</span>
      <span>
        <b>No seat selected</b>
        <small>Your booking summary will appear here.</small>
      </span>
    `;
  }

  $("bookButton").disabled = isAdmin;

  if (isAdmin) {
    $("bookButton").textContent = "Administrator view only";
  }
}


// DASHBOARD

function renderDashboard() {
  refreshBookings();

  const active = bookings.filter(b => b.status === "Active");

  const total = Object.values(rooms).reduce(
    (n, r) => n + r.seats,
    0
  );

  $("roomCount").textContent = Object.keys(rooms).length;
  $("totalCapacity").textContent = total;

  $("activeCount").textContent = isAdmin
    ? active.length
    : active.filter(b => b.owner === userId).length;

  let available = 0;

  Object.entries(rooms).forEach(([name, r]) => {
    for (let i = 1; i <= r.seats; i++) {
      if (!isSeatBusy(name, i, localDate(), "09:00", 1)) {
        available++;
      }
    }
  });

  $("availableCount").textContent = available;

  const mine = active
    .filter(b => b.owner === userId)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const next = mine
    .filter(b => new Date(`${b.date}T${b.start}:00`) > new Date())
    .slice(0, 3);

  const list = $("upcomingList");

  if (list) {
    list.innerHTML = next.length
      ? next.map(b => {
          const d = new Date(b.date + "T12:00:00");

          return `
            <div class="upcoming-item">
              <span class="upcoming-date">
                <b>${d.getDate()}</b>
                <small>${d.toLocaleDateString(undefined, {
                  month: "short"
                }).toUpperCase()}</small>
              </span>

              <span class="upcoming-info">
                <b>${b.room} · Seat ${b.seat}</b>
                <small>
                  ${formatTime(b.start)} ·
                  ${b.duration} hour${b.duration > 1 ? "s" : ""}
                </small>
              </span>
            </div>
          `;
        }).join("")
      : '<p class="empty-state">No upcoming sessions. Reserve a seat to plan your next study session.</p>';
  }

  $("navBookingCount").textContent = mine.length;
  $("navNotificationCount").textContent = getNotes().length;
}


// BOOKING HISTORY

function renderBookingHistory() {
  const list = $("bookingList");

  if (!list) return;

  refreshBookings();

  const mine = bookings.filter(b => isAdmin || b.owner === userId);

  const shown = mine
    .filter(b =>
      currentBookingFilter === "all" ||
      b.status === currentBookingFilter
    )
    .sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "")
    );

  $("allBookingCount").textContent = mine.length;

  $("activeBookingCount").textContent =
    mine.filter(b => b.status === "Active").length;

  $("cancelledBookingCount").textContent =
    mine.filter(b => b.status === "Cancelled").length;

  if (!shown.length) {
    list.innerHTML = '<p class="empty-state">Nothing to show here yet.</p>';
    return;
  }

  list.innerHTML = shown.map(b => `
    <div class="booking-row">
      <span class="booking-seat">${b.seat}</span>

      <div class="booking-info">
        <b>${b.room}</b>

        <small>
          ${formatDate(b.date)} · ${formatTime(b.start)} ·
          ${b.duration} hour${b.duration > 1 ? "s" : ""} ·
          ${b.gate || "Gate 1"}
        </small>

        <span class="${b.status === "Active" ? "status-active" : "status-cancelled"}">
          ${b.status}${isAdmin ? " · " + (b.ownerName || b.owner) : ""}
        </span>
      </div>

      ${b.status === "Active" && !isAdmin
        ? `<button class="cancel-button" data-cancel="${b.id}">Cancel</button>`
        : ""}
    </div>
  `).join("");
}


// NOTIFICATIONS

function renderNotifications() {
  const list = $("notificationList");

  if (!list) return;

  const notes = getNotes();

  $("navNotificationCount").textContent = notes.length;

  list.innerHTML = notes.length
    ? notes.map(n => `
        <div class="notification-item">
          <span class="notification-symbol">✧</span>

          <div>
            <b>${n.title || "Library update"}</b>
            <p>${n.message}</p>
            <small>${n.time}</small>
          </div>
        </div>
      `).join("")
    : '<p class="empty-state">You are all caught up. New updates will appear here.</p>';
}


// ADMIN PANEL

function renderAdmin() {
  if (!isAdmin) return;

  refreshBookings();

  const active = bookings.filter(b => b.status === "Active");
  const cancelled = bookings.filter(b => b.status === "Cancelled");

  $("adminTotal").textContent = bookings.length;
  $("adminActive").textContent = active.length;
  $("adminCancelled").textContent = cancelled.length;

  $("adminStudents").textContent =
    new Set(bookings.map(b => b.owner)).size;

  const q = ($("adminSearch")?.value || "").toLowerCase();

  const rows = bookings.filter(b =>
    (b.ownerName || b.owner || "").toLowerCase().includes(q) ||
    b.room.toLowerCase().includes(q)
  );

  $("adminBookingList").innerHTML = rows.length
    ? rows.slice().reverse().map(b => `
        <div class="booking-row">
          <span class="booking-seat">${b.seat}</span>

          <div class="booking-info">
            <b>${b.ownerName || b.owner} · ${b.room}</b>

            <small>
              ${formatDate(b.date)} · ${formatTime(b.start)} ·
              ${b.duration} hour${b.duration > 1 ? "s" : ""} ·
              ${b.gate || "Gate 1"}
            </small>

            <span class="${b.status === "Active" ? "status-active" : "status-cancelled"}">
              ${b.status}
            </span>
          </div>
        </div>
      `).join("")
    : '<p class="empty-state">No matching reservations.</p>';
}


// CREATE BOOKING

function handleBooking() {
  if (isAdmin) return;

  const room = getSelectedRoom();
  const date = $("bookingDate").value;
  const start = $("startHour").value;
  const duration = Number($("duration").value);

  if (!date || !start || !selectedSeat) {
    showToast("Choose a date, time and available seat first.");
    return;
  }

  const startMinutes = mins(start);
  const endMinutes = startMinutes + duration * 60;
  const startDate = new Date(`${date}T${start}:00`);

  if (startMinutes < 540 || endMinutes > 1320) {
    showToast("Bookings must start after 9 AM and finish by 10 PM.");
    return;
  }

  if (Number.isNaN(startDate.getTime()) || startDate <= new Date()) {
    showToast("Choose a future date and time.");
    return;
  }

  refreshBookings();

  if (isSeatBusy(room, selectedSeat, date, start, duration)) {
    selectedSeat = null;
    renderSeats();

    showToast("That seat was just reserved. Please choose another.");
    return;
  }

  if (isUserBusy(date, start, duration)) {
    showToast("You already have an overlapping booking. Cancel it or choose another time.");
    return;
  }

  const booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    passId: "LM-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    owner: userId,
    ownerName: user.name,
    room,
    seat: selectedSeat,
    date,
    start,
    duration,
    gate: $("gateSelect")?.value || "Gate 1",
    status: "Active",
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);

  saveBookings();

  notify(
    userId,
    `Your reservation is confirmed: ${room}, seat ${booking.seat}, on ${formatDate(date)} at ${formatTime(start)}.`,
    "Reservation confirmed"
  );

  const seat = selectedSeat;

  selectedSeat = null;

  renderSeats();
  renderDashboard();
  renderBookingHistory();

  showToast(`Seat ${seat} reserved successfully!`);
}


// CANCEL BOOKING

function cancelBooking(id) {
  refreshBookings();

  const b = bookings.find(x =>
    x.id === id &&
    x.owner === userId &&
    x.status === "Active"
  );

  if (!b) {
    return showToast("This reservation is no longer active.");
  }

  if (!confirm(`Cancel ${b.room}, seat ${b.seat} on ${formatDate(b.date)}?`)) {
    return;
  }

  b.status = "Cancelled";

  saveBookings();

  notify(
    userId,
    `Your reservation for ${b.room}, seat ${b.seat}, has been cancelled.`,
    "Reservation cancelled"
  );

  renderBookingHistory();
  renderDashboard();
  renderSeats();

  showToast("Reservation cancelled.");
}


// GATE PASS TIMER

function bookingWindowState(b) {
  const start = new Date(`${b.date}T${b.start}:00`);
  const end = new Date(start.getTime() + Number(b.duration) * 3600000);
  const now = new Date();

  const opens = new Date(start.getTime() - 15 * 60000);

  if (now < opens) {
    return {
      label: "Opens in",
      target: opens,
      sub: "Your QR pass activates 15 minutes before the booking."
    };
  }

  if (now <= end) {
    return {
      label: now < start ? "Starts in" : "Session ends in",
      target: now < start ? start : end,
      sub: now < start
        ? "Your entry window is open."
        : "Your reserved study session is in progress."
    };
  }

  return {
    label: "Expired",
    target: null,
    sub: "This reservation has ended. Select another active booking."
  };
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));

  const d = Math.floor(total / 86400);
  const h = Math.floor(total % 86400 / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;

  return `${d ? d + "d " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


// DIGITAL GATE PASS

function renderGatePass() {
  const select = $("passBookingSelect");

  if (!select) return;

  refreshBookings();

  const mine = bookings
    .filter(b => b.owner === userId && b.status === "Active")
    .sort((a, b) =>
      (a.date + a.start).localeCompare(b.date + b.start)
    );

  const previous = select.value;

  select.innerHTML = mine.length
    ? mine.map(b => `
        <option value="${b.id}">
          ${b.room} · ${formatDate(b.date)} · ${formatTime(b.start)}
        </option>
      `).join("")
    : '<option value="">No active bookings found</option>';

  if (mine.some(b => b.id === previous)) {
    select.value = previous;
  }

  const b = mine.find(x => x.id === select.value) || mine[0];

  const ids = [
    "passStudent",
    "passGate",
    "passDate",
    "passTime",
    "passRoom",
    "passId"
  ];

  if (!b) {
    ids.forEach(id => $(id).textContent = "—");

    $("passQr").innerHTML = "<span>NO ACTIVE PASS</span>";
    $("passState").textContent = "NO PASS";
    $("bookingTimer").textContent = "Select a booking";
    $("timerCaption").textContent = "BOOKING COUNTDOWN";
    $("timerSubtext").textContent = "Your active reservations will appear here.";

    return;
  }

  const endMins = mins(b.start) + Number(b.duration) * 60;

  const endTime =
    String(Math.floor(endMins / 60)).padStart(2, "0") +
    ":" +
    String(endMins % 60).padStart(2, "0");

  $("passStudent").textContent = b.ownerName || user.name;
  $("passGate").textContent = b.gate || "Gate 1";
  $("passDate").textContent = formatDate(b.date);

  $("passTime").textContent =
    `${formatTime(b.start)} – ${formatTime(endTime)}`;

  $("passRoom").textContent = `${b.room} · Seat ${b.seat}`;

  $("passId").textContent =
    b.passId || b.id.slice(0, 8).toUpperCase();

  const payload = JSON.stringify({
    app: "LUMEN",
    id: b.id,
    passId: b.passId || b.id,
    owner: b.owner,
    gate: b.gate || "Gate 1",
    date: b.date,
    start: b.start,
    duration: b.duration
  });

  const qr = $("passQr");

  qr.innerHTML = "";

  if (window.QRCode) {
    new QRCode(qr, {
      text: payload,
      width: 180,
      height: 180,
      colorDark: "#101827",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    qr.innerHTML = `
      <code>${b.passId || b.id}</code>
      <small>QR library unavailable</small>
    `;
  }

  updatePassTimer();
}

function updatePassTimer() {
  const select = $("passBookingSelect");

  if (!select || !select.value) return;

  refreshBookings();

  const b = bookings.find(x =>
    x.id === select.value &&
    x.status === "Active"
  );

  if (!b) return;

  const state = bookingWindowState(b);

  $("timerCaption").textContent = state.label.toUpperCase();

  $("bookingTimer").textContent = state.target
    ? formatCountdown(state.target - new Date())
    : "00:00:00";

  $("timerSubtext").textContent = state.sub;

  $("passState").textContent =
    state.label === "Expired"
      ? "EXPIRED"
      : state.label === "Opens in"
        ? "UPCOMING"
        : "VALID NOW";

  $("passState").className =
    "gatepass-state " +
    (
      state.label === "Expired"
        ? "expired"
        : state.label === "Opens in"
          ? "pending"
          : "valid"
    );
}


// DEMO-ONLY GATE VERIFICATION
// No camera access or real scanning is used.

function simulateGateCheck() {
  refreshBookings();

  const selectedId = $("passBookingSelect")?.value;

  const b = bookings.find(x =>
    x.id === selectedId &&
    x.status === "Active"
  );

  if (!b) {
    return showScanResult(
      "No active reservation selected. Create a booking first.",
      false
    );
  }

  const selectedGate = $("scannerGate")?.value || "Gate 1";

  if ((b.gate || "Gate 1") !== selectedGate) {
    return showScanResult(
      `GATE MISMATCH · This pass is assigned to ${b.gate || "Gate 1"}, not ${selectedGate}.`,
      false
    );
  }

  showScanResult(
    `DEMO VERIFIED · ${b.ownerName || user.name} · ${selectedGate} · ${b.room}, seat ${b.seat}. The QR pass matches the selected reservation.`,
    true
  );
}

function showScanResult(message, valid) {
  const el = $("scanResult");

  if (el) {
    el.textContent = message;
    el.className = "scan-result " + (valid ? "success" : "error");
  }
}


// FOCUS SPRINT

function startSprint() {
  if (sprintInterval) {
    clearInterval(sprintInterval);
    sprintInterval = null;

    $("sprintStart").textContent = "Resume sprint";

    return;
  }

  $("sprintStart").textContent = "Pause sprint";

  $("sprintMessage").textContent =
    "You're in your focus zone. Keep going!";

  sprintInterval = setInterval(() => {
    sprintSeconds--;

    const m = Math.floor(sprintSeconds / 60);
    const s = sprintSeconds % 60;

    $("sprintClock").textContent =
      `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    if (sprintSeconds <= 0) {
      clearInterval(sprintInterval);
      sprintInterval = null;

      $("sprintStart").textContent = "Start break";

      $("sprintMessage").textContent =
        "Sprint complete! Take a 5-minute break.";

      showToast("Focus Sprint complete. Great work!");
    }
  }, 1000);
}

function resetSprint() {
  clearInterval(sprintInterval);

  sprintInterval = null;
  sprintSeconds = 25 * 60;

  $("sprintClock").textContent = "25:00";
  $("sprintStart").textContent = "Start sprint";
  $("sprintMessage").textContent = "Ready when you are.";
}


// INITIALIZE DASHBOARD

function initializeDashboard() {
  if (!$("view-dashboard")) return;

  if (!user.name) {
    location.replace("index.html");
    return;
  }

  $("profileName").textContent = user.name;

  $("profileAvatar").textContent =
    user.name.charAt(0).toUpperCase();

  $("mobileAvatar").textContent =
    user.name.charAt(0).toUpperCase();

  $("profileRole").textContent =
    isAdmin ? "Administrator" : "Student";

  if (isAdmin) {
    document.querySelector(".admin-nav")?.classList.remove("hidden");

    document.querySelector('[data-view="booking"]')
      ?.classList.add("hidden");
  }

  $("todayLabel").textContent =
    new Date().toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    });

  roomSelectOptions();
  populateTimes();
  initializeDate();
  renderFeatured();

  ["roomSelect", "bookingDate", "startHour", "duration"]
    .forEach(id => {
      $(id).addEventListener("change", () => {
        selectedSeat = null;
        renderSeats();
      });
    });

  $("seatMap").addEventListener("click", e => {
    const btn = e.target.closest("[data-seat]");

    if (!btn || btn.disabled || isAdmin) return;

    selectedSeat = Number(btn.dataset.seat);

    renderSeats();
  });

  $("bookButton").addEventListener("click", handleBooking);

  $("passBookingSelect")?.addEventListener(
    "change",
    renderGatePass
  );

  $("simulateGateCheck")?.addEventListener(
    "click",
    simulateGateCheck
  );

  $("sprintStart")?.addEventListener(
    "click",
    startSprint
  );

  $("sprintReset")?.addEventListener(
    "click",
    resetSprint
  );

  setInterval(updatePassTimer, 1000);

  document.addEventListener("click", e => {
    const nav = e.target.closest("[data-view]");

    if (nav) goToView(nav.dataset.view);

    const go = e.target.closest("[data-go]");

    if (go) goToView(go.dataset.go);

    const room = e.target.closest("[data-book-room]");

    if (room) {
      $("roomSelect").value = room.dataset.bookRoom;

      selectedSeat = null;

      goToView("booking");

      renderSeats();
    }

    const cancel = e.target.closest("[data-cancel]");

    if (cancel) {
      cancelBooking(cancel.dataset.cancel);
    }
  });

  ["roomSearch", "roomFilter", "capacityFilter", "sortRooms"]
    .forEach(id => {
      $(id)?.addEventListener(
        id === "roomSearch" ? "input" : "change",
        renderRooms
      );
    });

  document.querySelectorAll("[data-booking-filter]")
    .forEach(btn => {
      btn.addEventListener("click", () => {
        currentBookingFilter = btn.dataset.bookingFilter;

        document.querySelectorAll("[data-booking-filter]")
          .forEach(x => {
            x.classList.toggle("active", x === btn);
          });

        renderBookingHistory();
      });
    });

  $("clearHistory").addEventListener("click", () => {
    refreshBookings();

    const has = bookings.some(b =>
      b.owner === userId &&
      b.status === "Cancelled"
    );

    if (!has) {
      return showToast("There are no cancelled reservations to clear.");
    }

    if (!confirm("Clear all your cancelled reservations?")) return;

    bookings = bookings.filter(b =>
      b.owner !== userId ||
      b.status !== "Cancelled"
    );

    saveBookings();

    renderBookingHistory();
    renderDashboard();

    showToast("Cancelled reservations cleared.");
  });

  $("clearNotifications").addEventListener("click", () => {
    if (!confirm("Clear all notifications?")) return;

    localStorage.removeItem("lumen_notifications_" + userId);

    renderNotifications();

    showToast("Notifications cleared.");
  });

  $("adminSearch")?.addEventListener("input", renderAdmin);

  $("signOut").addEventListener("click", () => {
    sessionStorage.removeItem("name");
    sessionStorage.removeItem("role");

    location.replace("index.html");
  });

  $("menuToggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  window.addEventListener("storage", e => {
    if (["lumen_bookings", "bookings"].includes(e.key)) {
      refreshBookings();

      renderDashboard();
      renderSeats();
      renderBookingHistory();
      renderAdmin();
      renderGatePass();
    }

    if (e.key === "lumen_notifications_" + userId) {
      renderNotifications();
    }
  });

  renderDashboard();
  renderSeats();
  renderRooms();
  renderBookingHistory();
  renderNotifications();
  renderAdmin();
  renderGatePass();
}


// LOGIN FORM

function updateIdFieldLabel() {
  const role = document.querySelector('input[name="role"]:checked')?.value;
  const label = $("personNameLabel");
  const input = $("personName");

  if (!label || !input) return;

  const isAdmin = role === "Administrator";

  label.textContent = isAdmin ? "Enter your Administrator ID" : "Enter your Student ID";
  input.placeholder = isAdmin ? "e.g. ADM-2048" : "e.g. 12628088";
  input.setAttribute("aria-label", isAdmin ? "Administrator ID" : "Student ID");
}

const roleInputs = document.querySelectorAll('input[name="role"]');
roleInputs.forEach(input => {
  input.addEventListener("change", updateIdFieldLabel);
});

updateIdFieldLabel();

$("loginForm")?.addEventListener("submit", e => {
  e.preventDefault();

  const name = $("personName").value.trim();

  const role = document.querySelector(
    'input[name="role"]:checked'
  )?.value;

  if (!name || !role) {
    return showToast("Enter your name and choose an access type.");
  }

  sessionStorage.setItem("name", name);

  sessionStorage.setItem(
    "role",
    role === "Administrator" ? "admin" : "student"
  );

  location.href = "home.html";
});


// START APPLICATION

initializeDashboard();