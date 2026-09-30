// The import window. createImportApp() is called at init: Foundry's classes only exist once Foundry has loaded.
import { MODULE_ID, TESTED_SRA2 } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice } from '../lib/plan.js'
import { applyRunner, findExisting } from './apply.js'

const flagOf = d => d?.flags?.[MODULE_ID]
const time = x => Date.parse(x ?? '') || 0
// Only a real image goes into <img> and the world's files (apply.js names it .png or .jpg).
const PORTRAIT = /^data:image\/(png|jpe?g);base64,/i
const OUTCOME = { create: 'CA2I.Created', replace: 'CA2I.Replaced', new: 'CA2I.NewVersion', skip: 'CA2I.Skipped' }

export function createImportApp() {
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
      actions: { import: ChummerImportApp.#onImport, openActor: ChummerImportApp.#onOpen, done: ChummerImportApp.#onDone },
    }
    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/import.hbs`, scrollable: ['.ca2i-rows', '.ca2i-report'] } }

    file = null; rows = null; refused = ''; busy = false; report = null

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
      return { systemError, systemWarning, rows, refused: this.refused, busy: this.busy, report: this.report,
        includeLabel: L('CA2I.Include'), progress: '' }
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options)
      this.element.querySelector('input[name=file]')?.addEventListener('change', ev => this.#load(ev.target.files?.[0]))
      this.element.querySelector('select[name=applyAll]')?.addEventListener('change', ev => {
        if (!ev.target.value) return
        for (const r of this.element.querySelectorAll(`.ca2i-choices input[value=${ev.target.value}]`)) r.checked = true
      })
    }

    async #load(file) {
      if (!file) return
      const res = readExport(await file.text())
      this.file = res.ok ? res.file : null
      this.refused = res.ok ? '' : res.reason
      this.rows = res.ok ? res.file.runners.map(runner => {
        const existing = findExisting(runner.id), exportedAt = runner.exportedAt ?? res.file.exportedAt
        return { runner, existing, exportedAt, portrait: PORTRAIT.test(runner.portrait ?? '') ? runner.portrait : null,
          choice: defaultChoice(flagOf(existing), { exportedAt }) }
      }) : null
      this.render()
    }

    static async #onImport() {
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
          const t = translateRunner(row.runner, { exportedAt: row.exportedAt, appVersion: this.file.app?.version ?? '', sanitize })
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

    static #onOpen(event, target) { game.actors.get(target.dataset.actorId)?.sheet?.render(true) }
    static #onDone() { this.close() }
  }
}
