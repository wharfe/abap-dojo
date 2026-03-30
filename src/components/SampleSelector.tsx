import { samples, type Sample } from "../samples";

interface SampleSelectorProps {
  onSelect: (sample: Sample) => void;
}

export function SampleSelector({ onSelect }: SampleSelectorProps) {
  return (
    <select
      className="px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded border border-gray-600 focus:outline-none focus:border-blue-500"
      defaultValue=""
      onChange={(e) => {
        const sample = samples.find((s) => s.id === e.target.value);
        if (sample) {
          onSelect(sample);
          e.target.value = "";
        }
      }}
    >
      <option value="" disabled>
        Samples...
      </option>
      {samples.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  );
}
