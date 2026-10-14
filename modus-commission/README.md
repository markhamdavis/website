# Modus- Commission

A Chrome extension that adds a commission box to the right of every **Apply**
button on the Brokers Alliance term life quoter
(`brokersalliance.com/myadvisor/dashboard/life-quotes/term-life-quoter`).
The box shows the first-year comp % from the Brokers Alliance comp grid for
that carrier, product, and term length.

## Install

1. Unzip `modus-commission.zip` somewhere permanent (e.g. `Documents/modus-commission`).
2. In Chrome, open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped `modus-commission` folder.
4. Reload the quoter page.

## Reading the boxes

| Color | Meaning |
| --- | --- |
| Green | Confident match |
| Amber with `?` | More than one grid line fits with different rates (for example Transamerica Direct vs. Family Markets), or the product name didn't match. Click it to check. |
| Blue with `✎` | A match you picked by hand |
| Gray `—` | Carrier or product not recognized. Click it to pick from the grid. |

Click any box to see what it matched, choose a different product from that
carrier, or search the whole grid. The extension remembers your pick, and it
also remembers which grid you chose for that carrier (e.g. Transamerica Family
Markets), so later ties go to that grid. Hover a box to see the matched grid
line and contract level.

The toolbar icon has an on/off switch and a button that clears your saved picks.

## How matching works

- **Carrier:** taken from the row's text, logo alt text, and logo file name
  (see `carriers.js` for the name list; add aliases there if a carrier shows `—`).
- **Term length:** taken from the row's own text first (e.g. "20 Year", "Term 20"),
  then the selected term tab or dropdown.
- **Product:** the product-name words in the row are scored against each line in
  that carrier's grid. Riders, child/spouse, substandard, ROP and NY-only lines
  are only used when the row mentions them.
- Renewal, excess, and service-fee lines are left out. Only first-year comp is shown.

## Updating the comp grid

The grid data (`data.js`) is **confidential and is not committed to this
repository** (see `.gitignore`). To rebuild it from a new export:

```
python3 tools/build_data.py BA_Comp_Grid.docx data.js
```

Then click the reload icon on the extension in `chrome://extensions`.
