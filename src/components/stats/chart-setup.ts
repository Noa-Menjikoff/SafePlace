"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
  Title,
  Legend,
} from "chart.js";

let registered = false;

export function registerChartJs() {
  if (registered) return;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Tooltip,
    Filler,
    Title,
    Legend
  );
  registered = true;
}

export const chartColors = {
  primary: "#534AB7",
  primaryFill: "rgba(83, 74, 183, 0.12)",
  teal: "#1D9E75",
  amber: "#EF9F27",
  blue: "#378ADD",
  ink: "#1a1a22",
  muted: "#6b6878",
  border: "rgba(0,0,0,0.08)",
};
