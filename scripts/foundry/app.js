// The import window. createImportApp() is called at init: Foundry's classes only exist once Foundry has loaded.
import { MODULE_ID, TESTED_SRA2 } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice, planPack } from '../lib/plan.js'
import { PORTRAIT, translateBook, translateTableRules } from '../lib/books.js'
import { applyRunner, findExisting } from './apply.js'
import { importBook, importTableRules } from './books.js'

const flagOf = d => d?.flags?.[MODULE_ID]
const time = x => Date.parse(x ?? '') || 0
// Only a real image goes into <img> and the world's files (apply.js names it .png or .jpg).
const OUTCOME = { create: 'CA2I.Created', replace: 'CA2I.Replaced', new: 'CA2I.NewVersion', skip: 'CA2I.Skipped' }

// getIcons() -> icons/index.json as loaded at ready, or null (no icons).
export function createImportApp(getIcons = () => null) {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
  const L = k => game.i18n.localize(k), F = (k, d) => game.i18n.format(k, d)
  const date = x => time(x) ? new Date(x).toLocaleString(game.i18n.lang, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  // Plain text -> escaped paragraphs -> Foundry's cleaner (translate.js: wrap the cleaner around escapeText, never replace it).
  const clean = foundry.utils.cleanHTML ?? (h => h)
  const sanitize = s => clean(escapeText(s))

  return class ChummerImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: 'chummer-anarchy2-import',
      classes: ['ca2i-app'],
      window: { title: 'CA2I.Title', icon: 'fas fa-file-import' },
      position: { width: 560, height: 'auto' },
      actions: { import: ChummerImportApp.#onImport, openActor: ChummerImportApp.#onOpen, done: ChummerImportApp.#onDone,
        openCompendiums: ChummerImportApp.#onOpenCompendiums },
    }
    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/import.hbs`, scrollable: ['.ca2i-rows', '.ca2i-report'] } }

    file = null; rows = null; books = null; tableRules = null; refused = ''; busy = false; report = null; bookReport = false

    async _prepareContext(options) {
      const sys = game.system
      const systemError = sys.id !== 'sra2' ? F('CA2I.NotSra2', { system: sys.title ?? sys.id }) : ''
      const systemWarning = !systemError && foundry.utils.isNewerVersion(sys.version, TESTED_SRA2)
        ? F('CA2I.NewerSra2', { tested: TESTED_SRA2, version: sys.version }) : ''
      const rows = this.rows?.map(row => {
        const worldAt = flagOf(row.existing)?.exportedAt
        const d = time(row.exportedAt) - time(worldAt)
        return {
          name: row.runner.streetName, portrait: row.portrait, exported: F('CA2I.Exported', { date: date(row.exportedAt) }),
          older: row.existing && d < 0,
          inWorld: row.existing ? F('CA2I.InWorld', { world: date(worldAt), file: date(row.exportedAt),
            compare: L(d > 0 ? 'CA2I.Newer' : d < 0 ? 'CA2I.Older' : 'CA2I.Same') }) : '',
          choices: ['replace', 'new', 'skip'].map(value => ({ value, checked: value === row.choice,
            label: L({ replace: 'CA2I.Replace', new: 'CA2I.New', skip: 'CA2I.Skip' }[value]) })),
        }
      })
      const books = this.books?.map(({ book, t, error }) => ({
        name: book.source.name, id: book.source.id, error: error && F('CA2I.Failed', { reason: error }),
        canon: L(book.source.canon ? 'CA2I.Canon' : 'CA2I.NonCanon'),
        descriptions: L(this.file.descriptions === true ? 'CA2I.DescriptionsIn' : 'CA2I.DescriptionsOut'),
        // after de-duplicating ids, as the write does (planPack: an id the file has twice keeps its last entry);
        // rules count their rule pages (level 2), not the journals or the section pages
        counts: t && Object.entries(t.packs).map(([k, all]) => { const { docs } = planPack(new Set(), all)
          const n = k === 'rules' ? docs.reduce((n, j) => n + j.pages.filter(p => p.title?.level === 2).length, 0) : docs.length
          return `${L(`CA2I.Pack.${k}`)} ${n}` }).join(' · '),
      }))
      return { systemError, systemWarning, rows, books, bookReport: this.bookReport, refused: this.refused, busy: this.busy, report: this.report,
        tableRules: this.tableRules && F('CA2I.TableRules', { n: this.tableRules.length }),
        includeLabel: L('CA2I.Include'), bookLabel: L('CA2I.IncludeBook'), progress: '' }
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options)
      this.element.querySelector('input[name=file]')?.addEventListener('change', ev => this.#load(ev.target.files?.[0]))
      this.element.querySelector('select[name=applyAll]')?.addEventListener('change', ev => {
        const v = ev.target.value
        if (!v) return
        for (const r of this.element.querySelectorAll(`.ca2i-choices input[value=${v}]`)) r.checked = true
        // A runner new to the world has no choices: its tick is its only control.
        if (v === 'skip') this.rows?.forEach((row, i) => {
          const tick = !row.existing && this.element.querySelector(`[name="tick-${i}"]`)
          if (tick) tick.checked = false
        })
      })
    }

    async #load(file) {
      if (!file) return
      let res
      try { res = readExport(await file.text()) } catch (e) { res = { ok: false, reason: F('CA2I.ReadFailed', { reason: e?.message ?? String(e) }) } }
      this.file = res.ok ? res.file : null
      this.refused = res.ok ? '' : res.reason
      const books = res.ok && res.file.kind === 'books'
      const appVersion = res.file?.app?.version ?? ''
      // Translated now for the preview's counts; Import writes these. A book that can't be translated is shown failed.
      this.books = books ? res.file.books.map(book => {
        try {
          return { book, t: translateBook(book, { exportedAt: book.exportedAt ?? res.file.exportedAt, appVersion,
            descriptions: res.file.descriptions === true, sanitize, icons: getIcons() }) }
        } catch (e) { return { book, error: e?.message ?? String(e) } }
      }) : null
      this.tableRules = books && Array.isArray(res.file.tableRules) && res.file.tableRules.length ? res.file.tableRules : null
      this.rows = res.ok && !books ? res.file.runners.map(runner => {
        const existing = findExisting(runner.id), exportedAt = runner.exportedAt ?? res.file.exportedAt
        return { runner, existing, exportedAt, portrait: PORTRAIT.test(runner.portrait ?? '') ? runner.portrait : null,
          choice: defaultChoice(flagOf(existing), { exportedAt }) }
      }) : null
      this.render()
    }

    static async #onImport() {
      if (this.books) return this.#importBooks()
      if (this.busy || !this.rows || game.system.id !== 'sra2') return
      const el = this.element
      // Read the choices from the form before anything re-renders it.
      const jobs = this.rows.map((row, i) => ({ row, tick: el.querySelector(`[name="tick-${i}"]`)?.checked,
        choice: row.existing ? el.querySelector(`[name="choice-${i}"]:checked`)?.value ?? row.choice : 'create' }))
      const total = jobs.filter(j => j.tick && j.choice !== 'skip').length
      this.busy = true
      for (const b of el.querySelectorAll('button[data-action=import], input')) b.disabled = true
      const progress = el.querySelector('.ca2i-progress')
      const report = []
      let n = 0
      for (const { row, tick, choice } of jobs) {
        const name = row.runner.streetName
        if (!tick || choice === 'skip') { report.push({ name, outcome: L('CA2I.Skipped'), textOnly: [] }); continue }
        if (progress) progress.textContent = F('CA2I.Progress', { n: ++n, total })
        let res, textOnly = []
        try {
          const t = translateRunner(row.runner, { exportedAt: row.exportedAt, appVersion: this.file.app?.version ?? '', sanitize, icons: getIcons() })
          textOnly = t.textOnly
          res = await applyRunner(t, choice, { portrait: row.portrait, exportedAt: row.exportedAt })
        } catch (error) { res = { action: 'failed', error } }  // translate threw: nothing in the world changed
        const failed = res.action === 'failed'
        report.push({ name, failed, textOnly: failed ? [] : textOnly,
          outcome: failed ? F('CA2I.Failed', { reason: res.error?.message ?? String(res.error) }) : L(OUTCOME[res.action]),
          actorId: failed || res.action === 'skip' ? null : res.actor?.id,
          openLabel: F('CA2I.Open', { name: res.actor?.name ?? name }) })
      }
      Object.assign(this, { busy: false, report })
      this.render()
    }

    async #importBooks() {
      if (this.busy || game.system.id !== 'sra2') return
      const el = this.element
      const jobs = this.books.filter((b, i) => el.querySelector(`[name="book-${i}"]`)?.checked)
      const withRules = this.tableRules && el.querySelector('[name=tableRules]')?.checked
      const total = jobs.length + (withRules ? 1 : 0)
      const progress = el.querySelector('.ca2i-progress')
      if (!total) { if (progress) progress.textContent = L('CA2I.NothingSelected'); return }
      this.busy = true
      for (const b of el.querySelectorAll('button[data-action=import], input')) b.disabled = true
      const step = (name, n) => { if (progress) progress.textContent = F('CA2I.BookProgress', { name, n, total }) }
      // One line per pack written or failed; an id the file has twice is noted with the textOnly lines.
      const lines = ({ counts, failed }) => ({
        packs: [...Object.values(counts).map(c => ({ text: F('CA2I.PackResult', c) })),
          ...failed.map(f => ({ failed: true, text: F('CA2I.PackFailed', { label: f.name, reason: f.error?.message ?? String(f.error) }) }))],
        notes: Object.values(counts).flatMap(c => c.duplicates.map(name => F('CA2I.Duplicate', { label: c.label, name }))),
      })
      // A book that couldn't be translated has no tick; the report lists it as failed.
      const report = this.books.filter(b => b.error).map(({ book, error }) =>
        ({ name: book.source.name, failed: true, outcome: F('CA2I.Failed', { reason: error }), packs: [], textOnly: [] }))
      let n = 0
      for (const { book, t } of jobs) {  // a book that failed to translate has no tick
        const name = book.source.name
        step(name, ++n)
        let res
        const onProgress = ({ key, n: i, total: of }) => {
          const pack = L(`CA2I.Pack.${key}`)
          if (progress) progress.textContent = F('CA2I.BookPackProgress', { name, pack, n: i, total: of })
        }
        try { res = await importBook(t, { onProgress }) } catch (error) { res = { counts: {}, failed: [{ name, error }] } }  // importBook shouldn't throw; the window mustn't stick busy
        const { packs, notes } = lines(res)
        report.push({ name, packs, outcome: packs.length ? '' : L('CA2I.NothingInBook'), textOnly: [...t.textOnly, ...(res.notes ?? []), ...notes] })
      }
      if (withRules) {
        const name = L('CA2I.TableRulesName')
        step(name, ++n)
        let res
        try {
          res = await importTableRules(translateTableRules(this.tableRules,
            { exportedAt: this.file.exportedAt, appVersion: this.file.app?.version ?? '', sanitize }))
        } catch (error) { res = { counts: {}, failed: [{ name, error }] } }  // translate threw: nothing changed
        const { packs, notes } = lines(res)
        report.push({ name, packs, outcome: packs.length ? '' : L('CA2I.NothingToImport'), textOnly: notes })
      }
      Object.assign(this, { busy: false, report, bookReport: true })
      this.render()
    }

    static #onOpen(event, target) { game.actors.get(target.dataset.actorId)?.sheet?.render(true) }
    static #onDone() { this.close() }
    static #onOpenCompendiums() { ui.sidebar?.changeTab('compendium', 'primary'); ui.sidebar?.expand() }
  }
}
