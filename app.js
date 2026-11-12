(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("data").textContent);
  var CITIES = {
    edi: { lat: 55.9533, lng: -3.1883 },
    gla: { lat: 55.8642, lng: -4.2518 }
  };

  /* ---------- "Next" strip. Times on the page are UK time, which is UTC in November. ---------- */
  var events = data.events.map(function (e) { e.ms = Date.parse(e.ts); return e; })
    .sort(function (a, b) { return a.ms - b.ms; });
  var el = {
    time: document.getElementById("nexttime"),
    text: document.getElementById("nexttext"),
    inn: document.getElementById("nextin")
  };
  function untilText(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d > 0) return "in " + d + "d " + h + "h";
    if (h > 0) return "in " + h + "h " + mm + "m";
    return "in " + mm + "m";
  }
  function tick() {
    var now = Date.now(), nxt = null, i;
    for (i = 0; i < events.length; i++) { if (events[i].ms > now) { nxt = events[i]; break; } }
    if (!nxt) {
      el.time.textContent = "Home";
      el.text.textContent = "That was the last stop.";
      el.inn.textContent = "";
      return;
    }
    el.time.textContent = nxt.when;
    el.text.textContent = nxt.place;
    var today = new Date(now).toISOString().slice(0, 10);
    var sameDay = nxt.ts.slice(0, 10) === today;
    el.inn.textContent = (sameDay ? "Today, " : nxt.day + ", ") + untilText(nxt.ms - now);
  }
  tick();
  setInterval(tick, 30000);

  /* ---------- Today tag, scroll to today during the trip ---------- */
  var todayUK = new Date().toISOString().slice(0, 10);
  var sections = Array.prototype.slice.call(document.querySelectorAll("section.day"));
  var todaySec = null;
  sections.forEach(function (s) {
    if (s.getAttribute("data-date") === todayUK) {
      todaySec = s;
      var tag = s.querySelector(".todaytag");
      if (tag) tag.hidden = false;
    }
  });
  if (todaySec && !location.hash) {
    window.addEventListener("load", function () { todaySec.scrollIntoView(); });
  }

  /* ---------- Tabs highlight ---------- */
  var tabs = document.getElementById("tabs");
  var tabLinks = Array.prototype.slice.call(tabs.querySelectorAll("a"));
  function setActive(id) {
    tabLinks.forEach(function (a) {
      var on = a.getAttribute("data-tab") === id;
      a.classList.toggle("active", on);
      if (on) {
        a.setAttribute("aria-current", "true");
        var left = a.offsetLeft - (tabs.clientWidth - a.offsetWidth) / 2;
        tabs.scrollTo({ left: left, behavior: "smooth" });
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-35% 0px -60% 0px" });
    document.querySelectorAll("main section").forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Maps ---------- */
  function buildMap(m) {
    var box = document.getElementById(m.id);
    if (!box || box.getAttribute("data-built")) return;
    box.setAttribute("data-built", "1");
    if (typeof L === "undefined" || !m.pins.length) {
      box.innerHTML = '<p class="nomap">The map did not load. Use the Google Maps buttons below.</p>';
      return;
    }
    var map = L.map(box, {
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      tap: false,
      zoomControl: true
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    var pts = [];
    m.pins.forEach(function (p) {
      var icon = L.divIcon({ className: "", html: '<div class="lpin">' + p.n + "</div>", iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([p.lat, p.lng], { icon: icon, title: p.name, keyboard: false })
        .addTo(map).bindPopup("<b>" + p.n + ".</b> " + p.name + (p.href ? '<br><a href="' + p.href + '">Open the guided tour</a>' : ""));
      pts.push([p.lat, p.lng]);
    });
    if (pts.length === 1) { map.setView(pts[0], 15); }
    else { map.fitBounds(pts, { padding: [32, 32], maxZoom: 16 }); }
  }
  if ("IntersectionObserver" in window) {
    var mo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id;
          data.maps.forEach(function (m) { if (m.id === id) buildMap(m); });
          mo.unobserve(en.target);
        }
      });
    }, { rootMargin: "300px 0px" });
    data.maps.forEach(function (m) { var b = document.getElementById(m.id); if (b) mo.observe(b); });
  } else {
    data.maps.forEach(buildMap);
  }

  /* ---------- Weather: static forecast first, live Open-Meteo on top ---------- */
  var wxEls = Array.prototype.slice.call(document.querySelectorAll(".wx"));
  var wx = JSON.parse(JSON.stringify(data.weather));
  var live = false;
  function renderWx() {
    wxEls.forEach(function (n) {
      var c = n.getAttribute("data-city"), d = n.getAttribute("data-date");
      var v = wx[c] && wx[c][d];
      var out = n.querySelector(".wxv");
      if (!v) { out.textContent = "no forecast"; return; }
      out.textContent = Math.round(v[0]) + "° / " + Math.round(v[1]) + "°, " + v[2] + "% rain" + (live ? "" : " (11 Nov forecast)");
      n.classList.toggle("wet", v[2] >= 50);
    });
  }
  renderWx();
  var pending = Object.keys(CITIES).length;
  Object.keys(CITIES).forEach(function (c) {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + CITIES[c].lat + "&longitude=" + CITIES[c].lng +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLondon" +
      "&start_date=2026-11-13&end_date=2026-11-17";
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var t = j.daily.time;
        t.forEach(function (day, i) {
          var hi = j.daily.temperature_2m_max[i], lo = j.daily.temperature_2m_min[i], p = j.daily.precipitation_probability_max[i];
          if (hi != null && lo != null) wx[c][day] = [hi, lo, p == null ? 0 : p];
        });
        live = true;
        renderWx();
      })
      .catch(function () { /* keep the saved forecast */ });
  });

  /* ---------- Still-to-book ticks, saved on this device ---------- */
  document.querySelectorAll("#todo input").forEach(function (box) {
    var key = "scot-trip-" + box.getAttribute("data-k");
    try { box.checked = localStorage.getItem(key) === "1"; } catch (e) {}
    box.addEventListener("change", function () {
      try { localStorage.setItem(key, box.checked ? "1" : "0"); } catch (e) {}
    });
  });
})();
