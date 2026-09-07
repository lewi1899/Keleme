"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AdminTable } from "@/components/admin/AdminPage";
import { formatDuration } from "@/lib/format";
import type { ActivityPoint } from "@/app/admin/analytics/page";

/**
 * Two charts, each carrying one measure.
 *
 * Study time and learner count are different scales, so they are deliberately
 * NOT plotted on two y-axes — a dual-axis chart lets the reader infer a
 * relationship from where the lines happen to cross, which is an artefact of
 * the scales rather than the data. Learner count rides in the tooltip instead,
 * where it can be read exactly.
 *
 * Both charts use a single hue (the active theme's accent) because each shows
 * one measure: identity is not the job, magnitude is, so a categorical palette
 * would add colour that means nothing.
 *
 * Colours come from CSS custom properties rather than hex literals, so the
 * charts re-theme instantly with the rest of the app across all six themes and
 * never sit on a mismatched blue in the green or purple themes.
 *
 * ACCESSIBILITY: the Sunset Orange theme's accent measures 2.8:1 against its
 * white surface — under the 3:1 floor for a chart mark. The table view below
 * is the required relief, and is the reason it is a first-class toggle rather
 * than an afterthought.
 */
export function AnalyticsCharts({
  series,
  gradeDistribution,
  days,
}: {
  series: ActivityPoint[];
  gradeDistribution: Record<string, number>;
  days: number;
}) {
  const [showTable, setShowTable] = useState(false);

  const activityData = useMemo(
    () =>
      series.map((point) => ({
        ...point,
        minutes: Math.round(point.seconds / 60),
        label: new Date(point.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      })),
    [series]
  );

  const gradeData = useMemo(
    () =>
      [9, 10, 11, 12].map((grade) => ({
        grade: `Grade ${grade}`,
        students: gradeDistribution[String(grade)] ?? 0,
      })),
    [gradeDistribution]
  );

  const totalSeconds = series.reduce((sum, point) => sum + point.seconds, 0);
  const peak = activityData.reduce(
    (best, point) => (point.minutes > best.minutes ? point : best),
    { minutes: 0, label: "—" } as { minutes: number; label: string }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[7, 30, 90].map((option) => (
            <a
              key={option}
              href={`/admin/analytics?days=${option}`}
              className={`kl-press rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                option === days
                  ? "border-accent bg-accent text-[var(--accent-contrast)]"
                  : "border-kl-border text-text-secondary hover:bg-accent-soft hover:text-text-primary"
              }`}
            >
              {option} days
            </a>
          ))}
        </div>

        <Button
          size="sm"
          variant="secondary"
          icon={showTable ? <BarChart3 size={15} /> : <Table2 size={15} />}
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
        >
          {showTable ? "Show charts" : "Show as table"}
        </Button>
      </div>

      {showTable ? (
        <>
          <Card className="p-5">
            <h2 className="kl-display mb-3 font-bold text-text-primary">Study time by day</h2>
            <AdminTable headers={["Day", "Study time", "Students who studied"]}>
              {activityData
                .slice()
                .reverse()
                .map((point) => (
                  <tr key={point.day}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-primary">{point.label}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-secondary">
                      {formatDuration(point.seconds)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-secondary">
                      {point.learners}
                    </td>
                  </tr>
                ))}
            </AdminTable>
          </Card>

          <Card className="p-5">
            <h2 className="kl-display mb-3 font-bold text-text-primary">Students by grade</h2>
            <AdminTable headers={["Grade", "Students"]}>
              {gradeData.map((row) => (
                <tr key={row.grade}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-primary">{row.grade}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-secondary">
                    {row.students.toLocaleString()}
                  </td>
                </tr>
              ))}
            </AdminTable>
          </Card>
        </>
      ) : (
        <>
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="kl-display font-bold text-text-primary">Study time per day</h2>
                <p className="mt-0.5 text-xs text-text-secondary">
                  Total {formatDuration(totalSeconds)} over {days} days · busiest day {peak.label}
                </p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  {/* Hairline, solid, horizontal only — the grid is there to be
                      read against, not looked at. */}
                  <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(value: number) => (value >= 60 ? `${Math.round(value / 60)}h` : `${value}m`)}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--accent)", strokeWidth: 1 }}
                    content={<ActivityTooltip />}
                  />
                  <Area
                    type="monotone"
                    dataKey="minutes"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="var(--accent)"
                    fillOpacity={0.1}
                    // A dot per day is noise at 90 days; the hover dot is how a
                    // specific day gets read.
                    dot={false}
                    activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="kl-display font-bold text-text-primary">Students by grade</h2>
            <p className="mt-0.5 text-xs text-text-secondary">Registered accounts, all time.</p>

            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeData} margin={{ top: 20, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
                  <XAxis
                    dataKey="grade"
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    allowDecimals={false}
                  />
                  <Tooltip cursor={{ fill: "var(--accent-soft)" }} content={<GradeTooltip />} />
                  <Bar
                    dataKey="students"
                    fill="var(--accent)"
                    // 4px rounded cap, square at the baseline; capped width so
                    // the band keeps its air rather than being filled.
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                    label={{
                      position: "top",
                      fill: "var(--text-secondary)",
                      fontSize: 11,
                      formatter: (value: number) => value.toLocaleString(),
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: { label: string; seconds: number; learners: number } }[];
}

function ActivityTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="kl-surface rounded-xl border px-3 py-2 shadow-kl-lift">
      <p className="text-xs font-semibold text-text-primary">{point.label}</p>
      <p className="mt-1 text-xs text-text-secondary">
        <span className="font-semibold text-text-primary">{formatDuration(point.seconds)}</span> studied
      </p>
      {/* The second measure lives here rather than on a second y-axis. */}
      <p className="text-xs text-text-secondary">
        <span className="font-semibold text-text-primary">{point.learners}</span>{" "}
        {point.learners === 1 ? "student" : "students"}
      </p>
    </div>
  );
}

function GradeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { grade: string; students: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="kl-surface rounded-xl border px-3 py-2 shadow-kl-lift">
      <p className="text-xs font-semibold text-text-primary">{point.grade}</p>
      <p className="mt-0.5 text-xs text-text-secondary">
        <span className="font-semibold text-text-primary">{point.students.toLocaleString()}</span>{" "}
        {point.students === 1 ? "student" : "students"}
      </p>
    </div>
  );
}
