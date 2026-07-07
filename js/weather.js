// ============================================================
// A Patch Wilder — weather
// 7-day forecast for the site (BS25 1RQ, Winscombe) via Open-Meteo
// (no API key, CORS-enabled). Rendered into #weather in the header.
// ============================================================

const LAT = 51.313;
const LON = -2.83;

export async function initWeather() {
  const el = document.getElementById("weather");
  if (!el) return;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=Europe%2FLondon&forecast_days=7`;
    const res = await fetch(url);
    const j = await res.json();
    const d = j.daily;
    el.innerHTML = d.time
      .map((t, i) => dayHtml(t, d.weather_code[i], d.temperature_2m_max[i], d.temperature_2m_min[i]))
      .join("");
  } catch (err) {
    el.innerHTML = `<span class="weather-err">Weather unavailable</span>`;
    console.error("Weather load failed:", err);
  }
}

function dayHtml(date, code, hi, lo) {
  const day = new Date(date + "T12:00").toLocaleDateString(undefined, { weekday: "short" });
  return `<div class="wx-day" title="${describe(code)}">
      <span class="wx-dow">${day}</span>
      <span class="wx-ico">${icon(code)}</span>
      <span class="wx-temp">${Math.round(hi)}°<span class="wx-lo">${Math.round(lo)}°</span></span>
    </div>`;
}

// WMO weather codes -> emoji
function icon(c) {
  if (c === 0) return "☀️";
  if (c <= 2) return "🌤️";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 51 && c <= 57) return "🌦️";
  if (c >= 61 && c <= 67) return "🌧️";
  if (c >= 71 && c <= 77) return "❄️";
  if (c >= 80 && c <= 82) return "🌧️";
  if (c >= 85 && c <= 86) return "🌨️";
  if (c >= 95) return "⛈️";
  return "🌡️";
}

function describe(c) {
  if (c === 0) return "Clear";
  if (c <= 2) return "Mostly sunny";
  if (c === 3) return "Cloudy";
  if (c === 45 || c === 48) return "Fog";
  if (c >= 51 && c <= 57) return "Drizzle";
  if (c >= 61 && c <= 67) return "Rain";
  if (c >= 71 && c <= 77) return "Snow";
  if (c >= 80 && c <= 82) return "Rain showers";
  if (c >= 85 && c <= 86) return "Snow showers";
  if (c >= 95) return "Thunderstorm";
  return "";
}
