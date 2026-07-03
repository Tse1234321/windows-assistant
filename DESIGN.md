# DESIGN.md - UI/UX Rulebook For AI Agents

Read this file before writing UI code. Rules are numbered so reviews can cite them. `DESIGN.md` defines the floor and process; `DESIGN-BRIEF.md` defines this project's personality.

## 0. Philosophy
- Quality in UI is coherence of decisions, not quantity of decoration.
- The user's attention is the scarcest resource. Every element must inform, orient, or enable action.
- Perceived quality comes mostly from typography and spacing; color and motion support the hierarchy.
- Spend boldness in exactly one place per project: the signature element.

## 1. Process
- P1: Before UI code, write a short design plan: subject, audience, page's single job, palette, type pairing, layout concept, and one signature element.
- P2: Run an anti-default check. If the plan would fit any generic app, revise it toward the subject's own world.
- P3: Ground choices in materials and patterns that belong to the product domain.
- P4: Build, inspect, self-critique, then remove one decorative element before shipping.
- P5: UI code consumes tokens. New component-level raw colors, one-off spacing, or ad-hoc durations need a reason.

## 2. Tokens
- T1: Components reference semantic tokens such as `--bg`, `--surface-1`, `--surface-2`, `--text-1`, `--text-2`, `--text-3`, `--border`, `--accent`, `--accent-text`, `--danger`, `--success`, `--warning`, and `--focus-ring`.
- T2: Theme changes are token remaps, never per-component patches.
- T3: Spacing uses a 4px base grid: 4, 8, 12, 16, 24, 32, 48, 64.
- T4: Radius follows the project scale; do not mix sharp, soft, and pill shapes arbitrarily.
- T5: Elevation has a small vocabulary. Shadows are for floating surfaces, menus, dialogs, and drag states.

## 3. Typography
- Y1: Use a small modular scale. Body text is usually 14-16px for this desktop pro tool; captions stay readable.
- Y2: Use two UI weights for most text: regular and semibold. Do not bold entire paragraphs.
- Y3: Body line-height should stay readable; long prose should not span the full viewport.
- Y4: Data-heavy areas use tabular numbers.
- Y5: Use sentence case for headings, labels, and buttons unless a brand mark requires otherwise.

## 4. Color
- C1: Most of the screen is neutral. Accent is reserved for interaction, selection, and meaningful emphasis.
- C2: Semantic colors are reserved for actual meaning: danger, success, warning.
- C3: Respect WCAG AA contrast for readable text and meaningful controls.
- C4: Do not rely on color alone to communicate state.
- C5: Text on a colored fill must be checked for contrast, not guessed.

## 5. Layout And Hierarchy
- L1: Every screen has one primary action. Secondary actions are quieter.
- L2: Spacing encodes relationship: close for related, wider for separate groups.
- L3: Minimize alignment lines; every new edge should help scanning.
- L4: Cards, dividers, numbered steps, and tabs must reflect real structure.
- L5: Screens remain usable at 360px wide with no horizontal text scroll.
- L6: This is a desktop pro tool, so density may be higher than a consumer app, but hierarchy must remain scannable.

## 6. Components And States
- S1: Interactive components need default, hover, focus-visible, active, and disabled states.
- S2: Data views need loading, empty, error, partial, and ideal states.
- S3: Hit targets are at least 44px touch or 32px pointer-dense desktop.
- S4: Forms use visible labels; validation appears next to the relevant field.
- S5: Destructive actions require confirmation or an undo path proportional to risk.
- S6: Every interaction needs feedback within 100ms.

## 7. Motion
- M1: Micro-interactions use 120-200ms; panels and modals use 200-300ms.
- M2: Animate transform and opacity where possible.
- M3: Motion should explain what changed. Decorative perpetual motion belongs only in the signature element.
- M4: `prefers-reduced-motion` support is mandatory.

## 8. Writing
- W1: Use names users recognize, not implementation names.
- W2: Buttons use action verbs: "Save changes", "Run workflow", "Open folder".
- W3: Errors say what happened and how to fix it.
- W4: Keep product copy plain, specific, and calm.
- W5: Microcopy should match a capable desktop utility, not a marketing landing page.

## 9. Accessibility
- A1: Everything is keyboard reachable and has visible focus.
- A2: Inputs have labels; meaningful images have alt text; icon-only buttons have `aria-label`.
- A3: Honor contrast, reduced motion, and hit target requirements.
- A4: The product should still work at 200% zoom, in dark mode, and without a mouse.

## 10. Anti-Slop Blacklist
- X1: Purple gradients everywhere, glass by default, or decorative mesh/noise without a product reason.
- X2: Emoji as UI icons. Use one icon style.
- X3: Heavy shadows on static elements.
- X4: Too many font sizes, weights, centered paragraphs, or ornamental text treatments.
- X5: Every section animated or every card hovering.
- X6: Generic hero/stat-card layouts inside the app.
- X7: Disabled primary buttons as the only error signal, placeholder-only forms, or spinner-only loading for content-shaped data.

## 11. Ship Checklist
1. Squint test: hierarchy and primary action are still obvious.
2. Token audit: new UI uses semantic tokens and the 4px spacing grid.
3. States audit: touched interactive controls and data views cover required states.
4. Theme check: light and dark modes remain readable.
5. Keyboard walk: focus is visible and tab order is logical.
6. Copy pass: buttons are verbs, errors are actionable, text is sentence case.
7. Anti-default pass: the result feels specific to PC Life Assistant/NEXUS.
8. One-accessory rule: one decorative element has been removed or justified.
9. Reduced-motion and 360px width sanity check passed or limitations are documented.
