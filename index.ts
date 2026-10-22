import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "pi-tps-stats";

interface StatsEntryData {
  input: number;
  output: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  durationSeconds: number | null;
  tokensPerSecond: number | null;
  costUsd: number;
}

function snapshotUsage(usage: Usage, durationMs: number | null): StatsEntryData {
  const durationSeconds = durationMs !== null ? durationMs / 1000 : null;
  return {
    input: usage.input,
    output: usage.output,
    total: usage.totalTokens,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    durationSeconds,
    tokensPerSecond:
      durationSeconds !== null && durationSeconds > 0
        ? usage.output / durationSeconds
        : null,
    costUsd: usage.cost.total,
  };
}

function count(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

function formatStats(stats: StatsEntryData): string {
  const parts = [
    `вход ${count(stats.input)}`,
    `выход ${count(stats.output)}`,
    `всего ${count(stats.total)}`,
    `кэш ${count(stats.cacheRead)}↓/${count(stats.cacheWrite)}↑`,
    stats.tokensPerSecond === null
      ? "скорость н/д"
      : `${count(stats.tokensPerSecond)} ток/с`,
    stats.durationSeconds === null
      ? "время н/д"
      : `${stats.durationSeconds.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`,
  ];

  if (stats.costUsd > 0) {
    parts.push(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumSignificantDigits: 3,
      }).format(stats.costUsd),
    );
  }

  return `📊 ${parts.join(" · ")}`;
}

export default function (pi: ExtensionAPI) {
  let responseStartedAt: number | undefined;
  let completedStats: StatsEntryData | undefined;

  pi.registerEntryRenderer<StatsEntryData>(ENTRY_TYPE, (entry, _options, theme) => {
    if (!entry.data) return undefined;
    return new Text(theme.fg("accent", formatStats(entry.data)), 0, 0);
  });

  pi.on("message_start", (event) => {
    if (event.message.role === "assistant") responseStartedAt = Date.now();
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    const durationMs =
      responseStartedAt === undefined ? null : Math.max(0, Date.now() - responseStartedAt);
    completedStats = snapshotUsage(
      (event.message as AssistantMessage).usage,
      durationMs,
    );
    responseStartedAt = undefined;
  });

  pi.on("turn_end", (event: TurnEndEvent) => {
    if (event.message.role !== "assistant") return;

    const stats =
      completedStats ?? snapshotUsage((event.message as AssistantMessage).usage, null);
    completedStats = undefined;
    responseStartedAt = undefined;

    return {
      entries: [
        {
          type: "custom",
          customType: ENTRY_TYPE,
          data: stats,
        },
      ],
    };
  });
}
