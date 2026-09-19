"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

function won(n) {
  return `${Math.round(n || 0).toLocaleString()}원`;
}

function SingleChart({ title, data, usageKey, amountKey, usageUnit, usageColor, amountColor }) {
  return (
    <div className="card mb-4">
      <div className="font-semibold text-sm mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="usage"
            tick={{ fontSize: 11 }}
            label={{ value: usageUnit, angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <YAxis
            yAxisId="amount"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${Math.round(v / 10000)}만`}
          />
          <Tooltip
            formatter={(value, name) =>
              name === amountKey ? [won(value), name] : [`${Number(value).toLocaleString()}${usageUnit}`, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="usage" dataKey={usageKey} fill={usageColor} radius={[4, 4, 0, 0]} />
          <Line yAxisId="amount" dataKey={amountKey} stroke={amountColor} strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function UtilityUsageChart({ data }) {
  const hasAnyData = (data || []).some(
    (d) => d.전기사용량 || d.전기고지서금액 || d.수도사용량 || d.수도고지서금액
  );

  if (!hasAnyData) {
    return (
      <div className="card text-sm text-inkDim">
        아직 등록된 검침·관리비 데이터가 없어 그래프를 표시할 수 없습니다. 검침 관리와 관리비 고지서에서 데이터를 입력하면 여기에 자동으로 나타납니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SingleChart
        title="전기 사용량 · 고지서 금액 (최근 12개월)"
        data={data}
        usageKey="전기사용량"
        amountKey="전기고지서금액"
        usageUnit="kWh"
        usageColor="#93c5fd"
        amountColor="#004cd4"
      />
      <SingleChart
        title="수도 사용량 · 고지서 금액 (최근 12개월)"
        data={data}
        usageKey="수도사용량"
        amountKey="수도고지서금액"
        usageUnit="㎥"
        usageColor="#a5f3fc"
        amountColor="#0e7490"
      />
    </div>
  );
}
