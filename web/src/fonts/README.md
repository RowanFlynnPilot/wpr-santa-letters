# Fonts

Fraunces (display) and Public Sans (text), served from our own site instead of Google's: one fewer
connection before the words appear, and no request to Google from a children's page.

The files are the variable fonts from `@fontsource-variable/fraunces` 5.3.0 (every axis: optical size,
weight, SOFT, WONK) and `@fontsource-variable/public-sans` 5.3.0 (weight), copied here unchanged: the
Latin subset every page uses, and the Latin Extended and Vietnamese subsets, which a browser fetches only
when a name or a letter needs them (`unicode-range` in `styles.css`). Both are under the SIL Open Font
License (the two LICENSE files).
