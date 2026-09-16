/**
 * Rebuilds the three pages of this bundle.
 *
 * Writes .dc.html artboards and canvas.json into ./canvas, the rendered page
 * content into ./spec, and the machine-readable contract into ./contract —
 * the same three artefacts the bundle already ships, so an edit to a screen
 * module regenerates all of them.
 *
 * Run:  node build.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SPECS } from './lib/expansion-kit.mjs'
import * as Conduct from './screens/conduct.mjs'
import * as Exams from './screens/exams.mjs'
import * as Leavers from './screens/leavers.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// The bundle shipped these as ./canvas, ./spec and ./contract beside its own
// build script. In the repo they join the canvas that is already here, so the
// artboards land in `expansion/` beside `module/` and `teacher/`, and the
// rendered specs and contracts go into the two directories every other campus
// screen already files them under — which is where `campus-conformance.mjs`
// and `10-campus-screen-contract.md` both look for them.
const OUT = path.join(HERE, 'expansion')
const SPEC = path.join(HERE, 'spec')
const CHECK = path.join(HERE, 'checklist')

const PAGES = [
  { id: 'conduct', name: 'Conduct and pastoral' },
  { id: 'exams', name: 'Public exams' },
  { id: 'leavers', name: 'Leavers and alumni' },
]

const LAYOUT = {
  conduct: [
    ['Conduct.dc.html', "The behaviour log", Conduct.Conduct, 1600, 1000],
    ['ConductIncident.dc.html', "One incident, start to finish", Conduct.ConductIncident, 1600, 1000],
    ['ConductMerits.dc.html', "Merits and demerits", Conduct.ConductMerits, 1600, 1000],
    ['ConductDetention.dc.html', "The detention register", Conduct.ConductDetention, 1600, 1000],
    ['Pastoral.dc.html', "Pastoral notes \u2014 who may read this", Conduct.Pastoral, 1600, 1000],
  ],
  exams: [
    ['Exams.dc.html', "Exam series", Exams.Exams, 1600, 1000],
    ['ExamCandidates.dc.html', "Candidates \u2014 ZIMSEC November 2026", Exams.ExamCandidates, 1600, 1000],
    ['ExamEntries.dc.html', "Subject entries and what they cost", Exams.ExamEntries, 1600, 1000],
    ['ExamSeating.dc.html', "Seating and invigilation", Exams.ExamSeating, 1600, 1000],
    ['ExamResults.dc.html', "Public results, by subject", Exams.ExamResults, 1600, 1000],
  ],
  leavers: [
    ['Leavers.dc.html', "Leavers \u2014 the queue before the record closes", Leavers.Leavers, 1600, 1000],
    ['Alumni.dc.html', "The alumni register", Leavers.Alumni, 1600, 1000],
    ['AlumniRecord.dc.html', "Alumnus \u2014 Rutendo Chikafu, class of 2019", Leavers.AlumniRecord, 1600, 1000],
    ['LeavingDocuments.dc.html', "Leaving certificate and testimonial", Leavers.LeavingDocuments, 1600, 1000],
  ],
}

const GAP = 120
const ensure = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

function main() {
  ensure(OUT); ensure(SPEC); ensure(CHECK)
  const artboards = []
  for (const { id } of PAGES) {
    let x = 0
    for (const [file, title, render, w, h] of LAYOUT[id]) {
      if (typeof render !== 'function') throw new Error(`${id}/${file}: render missing`)
      fs.writeFileSync(path.join(OUT, file), render(), 'utf8')
      artboards.push({ file, title, page: id, x, y: 0, w, h, expand: 'fit' })
      x += w + GAP
    }
  }
  const canvas = { artboards, annotations: [], launch: { view: 'canvas', page: 'conduct' }, pages: PAGES }
  fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf8')

  for (const [name, s] of SPECS) {
    fs.writeFileSync(path.join(SPEC, `${name}.html`), `${s.header}\n\n${s.content}\n`, 'utf8')
    fs.writeFileSync(
      path.join(CHECK, `${name}.json`),
      JSON.stringify({
        screen: name, story: s.story, header: s.header, filters: s.filters,
        columns: s.columns, cards: s.cards, stats: s.stats, bandChips: s.bandChips,
        buttons: s.buttons, allCopy: s.allCopy,
      }, null, 1), 'utf8',
    )
  }
  console.log(`${artboards.length} artboards, ${SPECS.size} contracts`)
}

main()
