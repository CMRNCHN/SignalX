# Aesthetics TODO

This repository has been pruned to focus on the core functionality of SignalX. All non-essential
code has been removed or gated behind feature flags. Use this document as a checklist for
customizing the user interface and adding your own visual style.

## Customize UI components

- **src/App.tsx** – The root React component. Adjust layout, colors, fonts, and animations.
- **src/components/** – Smaller React components. Tweak panel layouts and buttons.
- **src/styles.css** or Tailwind config – Global styles for fonts, colors, and spacing.
- **src/assets/** – Store your own icons and images here.

## Feature flags

Use the `tools/signalx_features.py` script to enable or disable UI sections. For example:

```bash
python3 tools/signalx_features.py list --repo-local  # show current flags
python3 tools/signalx_features.py on ui.panel.ai --repo-local  # enable AI panel
python3 tools/signalx_features.py off ui.panel.device ui.panel.contacts --repo-local  # hide device and contacts panels
python3 tools/signalx_features.py preset minimal --repo-local  # apply minimal UI preset
```

You can also edit `.signalx/features.json` directly if you prefer.

## Next steps

- Add or remove panels in `src/App.tsx` based on your needs.
- Bring your own design system or use a framework like Tailwind or Shadcn UI.
- Build additional tools and visualizations as separate React components.

