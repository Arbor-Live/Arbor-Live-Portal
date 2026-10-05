# PDF brand fonts

Inter (body) and Space Grotesk (headings), the web app's fonts, embedded as
base64 data URLs so react-pdf never fetches fonts at render time inside Convex
actions. Both are licensed under the SIL Open Font License 1.1
(https://openfontlicense.org).

Subset to Latin, Latin Extended, general punctuation, and arrows. To
regenerate (needs `fonttools`):

```sh
U="U+0000-024F,U+02B0-02FF,U+0300-036F,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+2713,U+2715,U+25A0-25CF"
# TTF URLs: curl -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Inter:wght@400"
python3 -m fontTools.subset inter-400.ttf --unicodes="$U" --layout-features='*' --output-file=inter-400.subset.ttf
echo "export const INTER_400_TTF = \"data:font/ttf;base64,$(base64 -i inter-400.subset.ttf | tr -d '\n')\";" > inter-400.ts
```

Repeat for `inter-400-italic`, `inter-600`, and `space-grotesk-600`.
