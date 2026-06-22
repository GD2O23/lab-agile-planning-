import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title } from "chart.js";
import type { ChartBarItem } from "../types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title);

/** Renders a bar chart to an offscreen canvas and returns a PNG data URL, for embedding in exports. */
export function renderBarChartImage(title: string, items: ChartBarItem[], width = 640, height = 320): string | null {
  if (!items.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const chart = new ChartJS(canvas, {
    type: "bar",
    data: {
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.value),
          backgroundColor: items.map((i) => i.color),
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16, weight: "bold" } },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
  const dataUrl = chart.toBase64Image("image/png", 1);
  chart.destroy();
  return dataUrl;
}
