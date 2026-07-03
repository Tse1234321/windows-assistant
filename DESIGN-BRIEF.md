# DESIGN-BRIEF - PC Life Assistant

## 1. Anchor
- Subject: PC Life Assistant is a Windows desktop command center for files, workflows, system health, security checks, updates, and power-user utilities.
- Audience: desktop power users and maintainers; this is a dense pro tool, not a marketing site.
- Interface job: help users quickly inspect machine/project status, take safe actions, and understand what changed.
- Visual vocabulary: Windows utility panels, diagnostics consoles, oscilloscope glow, circuit traces, system telemetry, file explorer structure, and clean command palettes.

## 2. Personality Axes
- Density: compact data tool.
- Temperature: calm technical utility with a little NEXUS glow.
- Sharpness: precise small radii, generally 7-10px.
- Motion: restrained; motion explains state changes and status pulses.

## 3. Palette
| Name | Token | Light | Dark | Use |
| --- | --- | --- | --- | --- |
| Background | `--bg` | `#f4f7fb` | `#060b1a` | App canvas |
| Surface | `--surface-1` | `#ffffff` | `rgba(9, 18, 42, 0.86)` | Elevated panels |
| Surface muted | `--surface-2` | `#eef3f9` | `rgba(10, 22, 52, 0.72)` | Cards and grouped regions |
| Ink | `--text-1` | `#182230` | `#eaf7ff` | Primary text |
| Ink muted | `--text-2` | `#64748b` | `#9ab7d4` | Secondary text |
| Accent | `--accent` | `#2563eb` | `#22d3ee` | Primary interaction and active status |
| Accent alternate | `--accent-2` | `#7c3aed` | `#a855f7` | Rare NEXUS signature emphasis |

Semantic colors are reserved for actual meaning: `--success`, `--warning`, and `--danger`.

## 4. Typography
- Display: Segoe UI / Microsoft JhengHei, semibold, used sparingly for app headers and panel titles.
- Body: Segoe UI / Microsoft JhengHei / system UI.
- Data: ui-monospace / SFMono-Regular / Consolas for counters, paths, and telemetry.
- Scale: compact desktop scale based around 14px UI text and 16px readable body text.

## 5. Signature Element
The signature element is a restrained "diagnostic glow": cyan/purple edge light and telemetry-like motion used only for status, active tools, dashboards, and the tech background. Static content should remain quiet.

## 6. Project-Specific Don'ts
- Do not make ordinary app screens look like landing pages.
- Do not add new decorative gradients, glows, or animated backgrounds unless they support diagnostics, status, or workflow structure.
- Do not introduce a second icon style.
- Do not use emoji as UI controls.
- Do not create card-inside-card layouts for dashboards or settings.
- Do not use destructive colors for non-destructive decoration.

## 7. Tradeoffs
- The app favors desktop scan density over spacious consumer onboarding because its main use is repeated operational work.
- The dark NEXUS theme is allowed to be more expressive than light mode; light mode should stay crisp and utilitarian.
- Some legacy CSS still uses older token names. New UI should use the semantic aliases in `src/styles/tokens.css`.
