// Entry point: the import window is built at init; GMs get an "Import from Chummer" button in the Actors sidebar.
import { createImportApp } from './foundry/app.js'

let ImportApp = null
const APP_ID = 'chummer-anarchy2-import'

function openImporter() {
  const open = foundry.applications.instances.get(APP_ID)
  if (open) open.bringToFront()
  else new ImportApp().render({ force: true })
}

// As sra2 adds its NPC generator button (sra2-system.ts setupNPCGeneratorButton): into the Actors directory footer.
function addButton(root) {
  root = root instanceof HTMLElement ? root : document.getElementById('actors')
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

Hooks.once('init', () => { ImportApp = createImportApp() })
Hooks.on('renderActorDirectory', (app, html) => addButton(html))
Hooks.on('changeSidebarTab', app => { if (app.tabName === 'actors') addButton() })
Hooks.on('renderSidebarTab', app => { if (app.tabName === 'actors') addButton() })
Hooks.once('ready', () => addButton())
