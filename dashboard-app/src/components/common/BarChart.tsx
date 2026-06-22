import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  type ChartEvent,
  type ActiveElement,
} from "chart.js";
import type { ChartBarItem } from "../../types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface Props {
  title: string;
  items: ChartBarItem[];
  onBarClick?: (item: ChartBarItem) => void;
}

export function BarChartCard({ title, items, onBarClick }: Props) {
  const data = {
    labels: items.map((i) => i.label),
    datasets: [
      {
        data: items.map((i) => i.value),
        backgroundColor: items.map((i) => i.color),
        borderRadius: 4,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    onClick: (_evt: ChartEvent, elements: ActiveElement[]) => {
      if (elements.length && onBarClick) {
        onBarClick(items[elements[0].index]);
      }
    },
  };
  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      <div className="chart-body">
        {items.length ? <Bar data={data} options={options} /> : <span className="muted">No data</span>}
      </div>
    </div>
  );
}
