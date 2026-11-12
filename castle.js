(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("data").textContent);
  var stops = data.stops;
  var cards = stops.map(function (s) { return document.getElementById(s.id); });
  var texts = cards.map(function (c) {
    return Array.prototype.map.call(c.querySelectorAll(".say p"), function (p) { return p.textContent; });
  });
  var cur = 0, playing = false, chunkIdx = 0, chunks = [], token = 0, wake = null;
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function (k) { try { return localStorage.getItem("castle-" + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("castle-" + k, v); } catch (e) {} }
  };

  /* ---------- Map ---------- */
  var map = null, markers = {}, youMarker = null;
  if (typeof L !== "undefined") {
    map = L.map("tourmap", { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    var pts = [];
    stops.forEach(function (s) {
      if (!s.pin) return;
      var icon = L.divIcon({ className: "", html: '<div class="lpin" id="lp' + s.i + '">' + s.n + "</div>", iconSize: [26, 26], iconAnchor: [13, 13] });
      var m = L.marker(s.pin, { icon: icon, title: s.title, keyboard: false }).addTo(map);
      m.on("click", function () { select(s.i, true); });
      markers[s.i] = m;
      pts.push(s.pin);
    });
    map.fitBounds(pts, { padding: [28, 28], maxZoom: 18 });
  } else {
    $("tourmap").innerHTML = '<p class="nomap">The map did not load. The stops are listed below.</p>';
  }

  /* ---------- Selection ---------- */
  function label(i) {
    var s = stops[i];
    if (i === 0) return "Before you go in";
    if (!s.pin) return s.title;
    return "Stop " + s.n + " of 13: " + s.title;
  }
  function select(i, scroll) {
    cur = Math.max(0, Math.min(stops.length - 1, i));
    cards.forEach(function (c, k) { c.classList.toggle("cur", k === cur); });
    Object.keys(markers).forEach(function (k) {
      var el = document.getElementById("lp" + k);
      if (el) el.classList.toggle("cur", +k === cur);
    });
    $("now").textContent = label(cur);
    $("prev").disabled = cur === 0;
    $("next").disabled = cur === stops.length - 1;
    var pin = stops[cur].pin;
    if (map && pin) map.panTo(pin, { animate: true, duration: 0.5 });
    if (scroll) cards[cur].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Speech ---------- */
  var synth = window.speechSynthesis;
  var voices = [];
  function chunkText(paras) {
    var out = [];
    paras.forEach(function (p) {
      var sentences = p.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) || [p];
      var buf = "";
      sentences.forEach(function (s) {
        if ((buf + s).length > 180 && buf) { out.push(buf.trim()); buf = s; }
        else { buf += s; }
      });
      if (buf.trim()) out.push(buf.trim());
    });
    return out;
  }
  function loadVoices() {
    if (!synth) return;
    var all = synth.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    if (!all.length) return;
    all.sort(function (a, b) {
      function score(v) { return (/en[-_]GB/i.test(v.lang) ? 0 : 2) + (v.localService ? 0 : 1); }
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
    voices = all;
    var sel = $("voice"), saved = store.get("voice");
    sel.innerHTML = "";
    all.forEach(function (v, k) {
      var o = document.createElement("option");
      o.value = v.voiceURI; o.textContent = v.name + " (" + v.lang + ")";
      if (saved ? saved === v.voiceURI : k === 0) o.selected = true;
      sel.appendChild(o);
    });
  }
  function currentVoice() {
    var uri = $("voice").value;
    for (var i = 0; i < voices.length; i++) if (voices[i].voiceURI === uri) return voices[i];
    return null;
  }
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) {
        navigator.wakeLock.request("screen").then(function (l) { wake = l; }).catch(function () {});
      } else if (!on && wake) { wake.release(); wake = null; }
    } catch (e) {}
  }
  function setPlaying(on) {
    playing = on;
    $("play").textContent = on ? "Pause" : "Play";
    keepAwake(on);
  }
  function speakChunk(myToken) {
    if (myToken !== token) return;
    if (chunkIdx >= chunks.length) {
      setPlaying(false);
      if ($("auto").checked && cur < stops.length - 1) {
        setTimeout(function () { select(cur + 1, true); start(0); }, 1200);
      }
      return;
    }
    var u = new SpeechSynthesisUtterance(chunks[chunkIdx]);
    var v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-GB"; }
    u.rate = parseFloat($("rate").value) || 1;
    u.onend = function () { if (myToken === token) { chunkIdx++; speakChunk(myToken); } };
    u.onerror = function (e) {
      if (myToken !== token) return;
      if (e && (e.error === "canceled" || e.error === "interrupted")) return;
      setPlaying(false);
    };
    synth.speak(u);
  }
  function start(fromChunk) {
    if (!synth) return;
    token++;
    synth.cancel();
    chunks = chunkText(texts[cur]);
    chunkIdx = fromChunk || 0;
    setPlaying(true);
    var t = token;
    setTimeout(function () { speakChunk(t); }, 60);
  }
  function pause() {
    token++;
    if (synth) synth.cancel();
    setPlaying(false);
  }

  $("play").addEventListener("click", function () {
    if (!synth) { $("nosupport").hidden = false; $("listen").scrollIntoView(); return; }
    if (playing) pause(); else start(chunkIdx < chunks.length ? chunkIdx : 0);
  });
  $("next").addEventListener("click", function () { var was = playing; pause(); chunkIdx = 0; select(cur + 1, true); if (was) start(0); });
  $("prev").addEventListener("click", function () { var was = playing; pause(); chunkIdx = 0; select(cur - 1, true); if (was) start(0); });
  Array.prototype.forEach.call(document.querySelectorAll(".listen"), function (b) {
    b.addEventListener("click", function () {
      var i = +b.getAttribute("data-i");
      if (!synth) { $("nosupport").hidden = false; return; }
      pause(); chunkIdx = 0; select(i, false); start(0);
    });
  });
  $("voice").addEventListener("change", function () { store.set("voice", this.value); if (playing) start(chunkIdx); });
  $("rate").addEventListener("change", function () { store.set("rate", this.value); if (playing) start(chunkIdx); });
  $("auto").addEventListener("change", function () { store.set("auto", this.checked ? "1" : "0"); });
  var sr = store.get("rate"); if (sr) $("rate").value = sr;
  $("auto").checked = store.get("auto") === "1";

  if (synth) {
    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
    window.addEventListener("pagehide", function () { synth.cancel(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && playing) keepAwake(true); });
  } else {
    $("nosupport").hidden = false;
    $("play").disabled = true;
  }

  /* ---------- Script helpers ---------- */
  function fullScript() {
    return stops.map(function (s, i) { return label(i) + "\n" + texts[i].join("\n"); }).join("\n\n");
  }
  $("copy").addEventListener("click", function () {
    var note = $("copynote");
    function ok() { note.textContent = "Copied. Paste it into your text to speech app."; }
    function fail() { note.textContent = "Copy did not work. Use Download the script instead."; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(fullScript()).then(ok, fail);
    else fail();
  });

  /* ---------- Find my stop ---------- */
  function dist(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  $("locate").addEventListener("click", function () {
    var note = $("locnote");
    if (!navigator.geolocation) { note.textContent = "This browser cannot share your location."; return; }
    note.textContent = "Looking for you...";
    navigator.geolocation.getCurrentPosition(function (p) {
      var me = [p.coords.latitude, p.coords.longitude], best = -1, bd = 1e9;
      stops.forEach(function (s) { if (s.pin) { var d = dist(me, s.pin); if (d < bd) { bd = d; best = s.i; } } });
      if (bd > 600) { note.textContent = "You are about " + Math.round(bd) + " m from the castle. Pick a stop from the list."; return; }
      if (map) {
        if (youMarker) youMarker.setLatLng(me);
        else youMarker = L.marker(me, { icon: L.divIcon({ className: "", html: '<div class="lpin you"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(map);
      }
      var was = playing; pause(); chunkIdx = 0;
      select(best, true);
      note.textContent = "Closest stop is " + stops[best].n + ", about " + Math.round(bd) + " m away.";
      if (was) start(0);
    }, function () {
      note.textContent = "Location is off or blocked. Pick a stop from the list.";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  });

  select(0, false);
})();
