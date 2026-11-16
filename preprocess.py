"""
Stage 2-4 of the workflow (collection, cleansing, modelling):
Reads NASA PCoE battery .mat files from data/, extracts discharge capacity
per cycle, computes State of Health (SOH) and a simple RUL estimate, and
writes docs/data/batteries.json for the dashboard.

Usage:
    python preprocess.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.io import loadmat

DATA_DIR = Path("data")
OUT_FILE = Path("docs/data/batteries.json")

RATED_CAPACITY = 2.0      # Ah, NASA cells are rated 2 Ah
EOL_THRESHOLD = 0.70      # End of life when capacity falls to 70% of rated (1.4 Ah)
FIT_WINDOW = 30           # number of recent cycles used for the linear trend fit


def load_discharge_capacity(mat_path: Path):
    """Return (cycle_numbers, capacities, ambient_temps) for discharge cycles only."""
    mat = loadmat(mat_path, squeeze_me=True, struct_as_record=False)
    cell_name = mat_path.stem                      # e.g. "B0005"
    cycles = mat[cell_name].cycle

    cycle_ids, capacities, temps = [], [], []
    n = 0
    for c in cycles:
        if str(c.type).lower() != "discharge":
            continue
        n += 1
        cap = float(np.asarray(c.data.Capacity).ravel()[0])
        cycle_ids.append(n)
        capacities.append(cap)
        temps.append(float(c.ambient_temperature))
    return cycle_ids, capacities, temps


def estimate_rul(cycles, capacities):
    """Linear fit on the last FIT_WINDOW cycles, extrapolated to the EOL threshold."""
    eol_capacity = RATED_CAPACITY * EOL_THRESHOLD
    current_cycle = cycles[-1]

    if capacities[-1] <= eol_capacity:
        return current_cycle, 0

    window_c = np.array(cycles[-FIT_WINDOW:])
    window_q = np.array(capacities[-FIT_WINDOW:])
    slope, intercept = np.polyfit(window_c, window_q, 1)

    if slope >= 0:                                  # no degradation trend detected
        return None, None

    eol_cycle = (eol_capacity - intercept) / slope
    eol_cycle = max(eol_cycle, current_cycle)
    return int(round(eol_cycle)), int(round(eol_cycle - current_cycle))


def main():
    batteries = []
    for mat_path in sorted(DATA_DIR.glob("B*.mat")):
        cycles, caps, temps = load_discharge_capacity(mat_path)
        if not cycles:
            continue

        eol_cycle, rul = estimate_rul(cycles, caps)
        batteries.append({
            "id": mat_path.stem,
            "cycles": cycles,
            "capacity": [round(c, 4) for c in caps],
            "soh": [round(c / RATED_CAPACITY * 100, 2) for c in caps],
            "ambient_temp": round(float(np.mean(temps)), 1),
            "latest_capacity": round(caps[-1], 4),
            "latest_soh": round(caps[-1] / RATED_CAPACITY * 100, 2),
            "current_cycle": cycles[-1],
            "eol_cycle": eol_cycle,
            "rul_cycles": rul,
        })
        print(f"{mat_path.stem}: {len(cycles)} discharge cycles, RUL = {rul}")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "rated_capacity_ah": RATED_CAPACITY,
        "eol_threshold_pct": EOL_THRESHOLD * 100,
        "batteries": batteries,
    }
    OUT_FILE.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT_FILE} with {len(batteries)} batteries")


if __name__ == "__main__":
    main()
