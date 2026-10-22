# pi-tps

Token usage and response speed for [Pi](https://pi.dev), displayed **in the conversation after every assistant turn**, not in the footer.

```text
📊 вход 1 000 · выход 120 · всего 1 350 · кэш 200↓/30↑ · 40 ток/с · 3 с · $0.004
```

Labels: input tokens, output tokens, provider-reported total tokens, cache read/write, output tokens per second, response duration, and recorded cost when greater than zero. Labels currently use Russian.

## Install globally

```sh
pi install https://github.com/maximkr/pi-tps
```

Run `/reload` in an existing Pi session, or restart Pi. No footer configuration is needed.

If you previously installed our single-file version at `~/.pi/agent/extensions/stats-after-response.ts`, move it outside the extensions directory before installing this package to avoid duplicate statistics. Do not keep both versions loaded.

## What it measures

- Uses provider-reported `usage`, not character-based token estimates.
- Duration is measured from assistant `message_start` to `message_end` and excludes subsequent tool execution.
- Speed is output tokens divided by that duration, **including request latency/prefill**. It is end-to-end response throughput, not isolated decoder speed or time-to-first-token.
- Tool-calling turns also get a stats line at `turn_end`, after their tools finish. This is per assistant turn, not an aggregate for a multi-turn user request.
- Provider-reported output may include reasoning tokens. Cache counts and totals follow the provider/Pi's accounting.
- Positive recorded cost is shown as an estimate in USD. Missing or zero cost is omitted; omission does not imply free usage.
- If a start timestamp is unavailable, duration and speed show `н/д` (unavailable).

Stats are persisted as Pi `custom` entries with a registered renderer. They appear in the interactive transcript and do **not** enter LLM context or trigger model requests. This extension makes no network requests itself. Other clients need to support custom-entry rendering; RPC/plain-text output is not guaranteed to display the line.

## Compatibility and verification

Targets the `@earendil-works` Pi API with `turn_end` boundary entries and `registerEntryRenderer` (developed against Pi 1.4.0). Older `@mariozechner` Pi releases are not verified.

Local tests exercise synthetic lifecycle events and render the line using Pi's real `Text` component. They do not prove visibility in every terminal/client or send any provider request.

## Tests

With the Pi peer packages available:

```sh
npm test
```

The test loader also supports a global npm Pi install. If auto-discovery fails, set `PI_TPS_HOST_DIR` to the installed `@earendil-works/pi-coding-agent` directory. Tests use Node's TypeScript stripping and require Node 22.18+ or 24+.

## Uninstall

```sh
pi remove https://github.com/maximkr/pi-tps
```

Then `/reload` or restart Pi.
