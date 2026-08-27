/**
 * Phosphor icons, rendered the way the app renders them.
 *
 * lib/icons.tsx wraps @phosphor-icons/react and picks a weight per glyph:
 *   - `fill` by default — "which is how the product is drawn"
 *   - `bold` for Caret*, X, Plus, Minus, Check, Checks, Equals, because
 *     Phosphor's fill weight has nothing to fill in a glyph made only of
 *     lines and fills the BOX instead (a solid triangle where the chevron
 *     should be)
 *   - `regular` for MagnifyingGlass, because "a filled magnifier is a black
 *     lollipop: the lens, which is the part that says search, is exactly the
 *     part the fill removes"
 *
 * The path data in phosphor-raw.json is extracted verbatim from the installed
 * package's defs, so these are the glyphs the running app draws.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RAW = JSON.parse(fs.readFileSync(path.join(HERE, 'phosphor-raw.json'), 'utf8'))

const STROKE_WEIGHT_PREFIX = /^Caret/
const STROKE_WEIGHT_EXACT = new Set(['X', 'Plus', 'Minus', 'Check', 'Checks', 'Equals'])
const OUTLINE_WEIGHT_EXACT = new Set(['MagnifyingGlass'])

const weightFor = (name) =>
  STROKE_WEIGHT_PREFIX.test(name) || STROKE_WEIGHT_EXACT.has(name)
    ? 'bold'
    : OUTLINE_WEIGHT_EXACT.has(name)
      ? 'regular'
      : 'fill'

/**
 * One Phosphor glyph as inline SVG.
 *
 * Phosphor's viewBox is 0 0 256 256 and its paths are solid shapes, so this
 * renders `fill` rather than `stroke` — the opposite of a Lucide-style icon.
 */
export function ph(name, { size = 16, color = 'currentColor', weight } = {}) {
  const rec = RAW[name]
  if (!rec) throw new Error(`ph(): no Phosphor data for "${name}"`)
  const w = weight ?? weightFor(name)
  const paths = rec[w] ?? rec.fill ?? rec.regular ?? rec.bold
  if (!paths) throw new Error(`ph(): no "${w}" weight for "${name}"`)
  return `<svg viewBox="0 0 256 256" fill="${color}" style="width: ${size}px; height: ${size}px; flex-shrink: 0; display: block">${paths
    .map((d) => `<path d="${d}"></path>`)
    .join('')}</svg>`
}

export const hasIcon = (name) => Boolean(RAW[name])
