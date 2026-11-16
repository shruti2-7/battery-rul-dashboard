const DATA_URL = "data/batteries.json";
let dataset = null;
let capacityChart = null;
let sohChart = null;

const PALETTE = ["#1f6feb", "#12a150", "#d9822b", "#8a4fff", "#e5484d", "#0ea5a4", "#7c8799"];

async function init() {
  const res = await fetch(DATA_URL);
  dataset = await res.json();

  const select = document.getElementById("batterySelect");
  dataset.batteries.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.id;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => showBattery(select.value));

  drawSohComparison();
  showBattery(dataset.batteries[0].id);
}

function showBattery(id) {
  const b = dataset.batteries.find((x) => x.id === id);
  if (!b) return;

  document.getElementById("latestCapacity").textContent = b.latest_capacity.toFixed(3);
  document.getElementById("latestSoh").textContent = b.latest_soh.toFixed(1);
  document.getElementById("currentCycle").textContent = b.current_cycle;
  document.getElementById("rul").textContent = b.rul_cycles ?? "N/A";

  drawCapacityChart(b);
  document.getElementById("insight").textContent = buildInsight(b);
}

function drawCapacityChart(b) {
  const eolCapacity = (dataset.rated_capacity_ah * dataset.eol_threshold_pct) / 100;
  const ctx = document.getElementById("capacityChart");
  if (capacityChart) capacityChart.destroy();

  capacityChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: b.cycles,
      datasets: [
        {
          label: `${b.id} capacity (Ah)`,
          data: b.capacity,
          borderColor: PALETTE[0],
          backgroundColor: "rgba(31,111,235,0.1)",
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
          tension: 0.25,
        },
        {
          label: `EOL threshold (${eolCapacity.toFixed(2)} Ah)`,
          data: b.cycles.map(() => eolCapacity),
          borderColor: "#e5484d",
          borderDash: [6, 6],
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: "Discharge cycle" } },
        y: { title: { display: true, text: "Capacity (Ah)" } },
      },
    },
  });
}

function drawSohComparison() {
  const ctx = document.getElementById("sohChart");
  if (sohChart) sohChart.destroy();

  sohChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dataset.batteries.map((b) => b.id),
      datasets: [
        {
          label: "Latest SOH (%)",
          data: dataset.batteries.map((b) => b.latest_soh),
          backgroundColor: dataset.batteries.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: false, title: { display: true, text: "SOH (%)" } } },
    },
  });
}

function buildInsight(b) {
  if (b.rul_cycles === 0) {
    return `${b.id} has reached end of life. Plan replacement.`;
  }
  if (b.rul_cycles === null) {
    return `${b.id} shows no clear degradation trend, so RUL cannot be estimated yet.`;
  }
  const drop = (100 - b.latest_soh).toFixed(1);
  return `${b.id} has lost ${drop}% of its rated capacity and is estimated to reach end of life in about ${b.rul_cycles} cycles.`;
}

init().catch((err) => {
  console.error("Failed to load dashboard data:", err);
  document.querySelector("main").insertAdjacentHTML(
    "afterbegin",
    `<p class="panel">Could not load data/batteries.json. Run preprocess.py first.</p>`
  );
});
