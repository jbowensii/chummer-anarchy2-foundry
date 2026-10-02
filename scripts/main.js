// Entry point: the import window is built at init; GMs get an "Import from Chummer" button in the Actors sidebar.
import { createImportApp } from './foundry/app.js'
import { registerQuench } from './foundry/quench.js'
import { createIconsApp, loadIconIndex } from './foundry/icons.js'
import { MODULE_ID } from './lib/constants.js'

let ImportApp = null
let icons = null  // icons/index.json, loaded once at ready; null = no icons
const APP_ID = 'chummer-anarchy2-import'

function openImporter() {
  const open = foundry.applications.instances.get(APP_ID)
  if (open) open.bringToFront()
  else new ImportApp().render({ force: true })
}

// As sra2 adds its NPC generator button (sra2-system.ts setupNPCGeneratorButton): into the directory footer of the
// Actors tab (runners) and the Compendium tab (book data); either opens the same window, which reads both kinds of file.
function addButton(root, tab) {
  root = root instanceof HTMLElement ? root : document.getElementById(tab)
  if (!game.user?.isGM || !ImportApp || !root || root.querySelector('.ca2i-import-btn')) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ca2i-import-btn'
  const icon = document.createElement('i')
  icon.className = 'fas fa-file-import'
  button.append(icon, ` ${game.i18n.localize('CA2I.Button')}`)
  button.addEventListener('click', ev => { ev.preventDefault(); openImporter() })
  let footer = root.querySelector('.directory-footer')
  if (!footer) { footer = document.createElement('div'); footer.className = 'directory-footer flexrow'; root.append(footer) }
  footer.append(button)
}

Hooks.once('init', () => {
  ImportApp = createImportApp(() => icons)
  game.settings.registerMenu(MODULE_ID, 'applyIcons', { name: 'CA2I.Icons.Title', label: 'CA2I.Icons.Button',
    hint: 'CA2I.Icons.Hint', icon: 'fas fa-image', type: createIconsApp(() => icons), restricted: true })
})
Hooks.on('renderActorDirectory', (app, html) => addButton(html, 'actors'))
Hooks.on('renderCompendiumDirectory', (app, html) => addButton(html, 'compendium'))
Hooks.on('changeSidebarTab', app => { if (app.tabName === 'actors' || app.tabName === 'compendium') addButton(null, app.tabName) })
Hooks.once('ready', async () => { addButton(null, 'actors'); addButton(null, 'compendium'); icons = await loadIconIndex() })
Hooks.on('quenchReady', quench => registerQuench(quench))
