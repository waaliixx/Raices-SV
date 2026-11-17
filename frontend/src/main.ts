// @ts-ignore Vite handles CSS side-effect imports at runtime.
import './style.css'
import {
  allPending,
  putPending,
  removePending,
  type PendingBooking,
} from './store'

type Experience = {
  _id: string
  title: string
  place: string
  kind: string
  price: number
  capacity: number
  description: string
  accent: string
}

type Booking = {
  id: string
  title: string
  date: string
  people: number
  name: string
  status: string
}

const app = document.querySelector<HTMLDivElement>('#app')!

const esc = (str: unknown) =>
  String(str ?? '').replace(/[&<>"']/g, c =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]!,
  )

let experiences: Experience[] = []
let selected: Experience | null = null
let filter = 'Todos'
let adminKey = ''
let syncing = false
let currentTab = 'explorar'

const dateNow = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

const money = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })

  let data: any

  try {
    data = await res.json()
  } catch {
    throw new Error('Respuesta no válida del servidor')
  }

  if (!res.ok) {
    throw new Error(data.error || 'No se pudo completar la operación')
  }

  return data as T
}

const loading = `<div class="empty"><span class="spinner"></span> Cargando experiencias…</div>`

function shell() {
  app.innerHTML = `
    <header class="nav">
      <div class="nav-inner">
        <button class="brand" id="home">
          <span class="brand-mark">✺</span>
          <span>raíces<span class="brand-dot">.</span><small>EL SALVADOR</small></span>
        </button>
        <nav class="nav-links">
          <button class="nav-item active" data-tab="explorar">Explorar</button>
          <button class="nav-item" data-tab="mis-reservas">
            Mis pendientes <span id="queue-pill" class="queue-pill">0</span>
          </button>
          <button class="nav-item" data-tab="admin">Para anfitriones</button>
        </nav>
        <div class="nav-right">
          <span id="connection" class="connection">● Comprobando</span>
          <button id="install" class="install" hidden>Instalar app</button>
        </div>
      </div>
    </header>
    <main id="page"></main>
    <footer>
      <div class="footer-inner">
        <div class="footer-brand">
          ✺ raíces<span>.</span>
          <p>Viví la naturaleza, apoyá lo local.</p>
        </div>
        <p>
          Proyecto académico · Bases de Datos II<br>
          Reservas sujetas a disponibilidad real.
        </p>
      </div>
    </footer>
    <div id="toast" role="status" aria-live="polite"></div>
  `

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
    button.onclick = () => navigate(button.dataset.tab!)
  })

  document.querySelector<HTMLButtonElement>('#home')!.onclick = () =>
    navigate('explorar')

  window.addEventListener('online', () => {
    connection()
    void synchronize()
  })
  window.addEventListener('offline', connection)
  connection()
}

function connection() {
  const label = document.querySelector('#connection')

  if (label) {
    label.textContent = navigator.onLine
      ? '● Con conexión'
      : '● Sin conexión'
    label.className =
      'connection ' + (navigator.onLine ? 'online' : 'offline')
  }
}

function toast(msg: string, bad = false) {
  const el = document.querySelector<HTMLDivElement>('#toast')!
  el.textContent = msg
  el.className = 'visible ' + (bad ? 'bad' : '')
  setTimeout(() => (el.className = ''), 4600)
}

async function badge() {
  const list = await allPending()
  const pill = document.querySelector('#queue-pill')
  if (pill) pill.textContent = String(list.length)
}

function navigate(tab: string) {
  currentTab = tab

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab)
  })

  if (tab === 'explorar') renderExplore()
  else if (tab === 'mis-reservas') void renderPending()
  else renderAdmin()

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function card(x: Experience) {
  const shades: Record<string, string> = {
    forest: '🌿',
    mist: '🏡',
    water: '💧',
    sunset: '🌋',
    night: '✨',
    coast: '🛶',
  }

  return `
    <article class="experience-card">
      <div class="visual ${esc(x.accent)}">
        <div class="graphic">${shades[x.accent] || '🌿'}</div>
        <span class="category-tag">${esc(x.kind)}</span>
      </div>
      <div class="card-content">
        <p class="location">⌖ ${esc(x.place)}</p>
        <h3>${esc(x.title)}</h3>
        <p class="description">${esc(x.description)}</p>
        <div class="card-bottom">
          <div>
            <span class="price">${money(x.price)}</span>
            <span class="muted"> / persona o unidad</span>
          </div>
          <button class="card-action" data-book="${esc(x._id)}">
            Reservar ↗
          </button>
        </div>
      </div>
    </article>
  `
}

function renderExplore() {
  const page = document.querySelector('#page')!
  const cats = [
    'Todos',
    'Senderismo',
    'Alojamiento',
    'Aventura',
    'Naturaleza',
    'Camping',
    'Ecoturismo',
  ]
  const visible =
    filter === 'Todos'
      ? experiences
      : experiences.filter(x => x.kind === filter)

  page.innerHTML = `
    <section class="hero">
      <div class="hero-backdrop">
        <span class="hero-sun"></span>
        <span class="hill hill-one"></span>
        <span class="hill hill-two"></span>
        <span class="hill hill-three"></span>
      </div>
      <div class="container hero-content">
        <div class="eyebrow">
          <span class="eyebrow-line"></span> VIAJÁ LOCAL. SENTÍ MÁS.
        </div>
        <h1>Descubrí lo <em>extraordinario</em> cerca de vos.</h1>
        <p>Escapadas auténticas, senderos inolvidables y anfitriones locales. Toda la belleza de El Salvador, en un solo lugar.</p>
        <a href="#experiencias" class="hero-cta">
          Explorar experiencias <span>↗</span>
        </a>
        <div class="hero-proof">
          <span>✦</span> Aventuras que conectan con nuestras raíces
        </div>
      </div>
      <div class="hero-side-label">EL SALVADOR · NATURALEZA VIVA</div>
    </section>

    <section class="stats">
      <div class="container stats-row">
        <div><strong>100%</strong><span>Experiencias locales</span></div>
        <div><strong>+6</strong><span>Opciones por descubrir</span></div>
        <div>
          <strong>Offline</strong>
          <span>Guardá tus solicitudes sin internet</span>
        </div>
      </div>
    </section>

    <section class="container explore" id="experiencias">
      <div class="section-top">
        <div>
          <p class="section-kicker">EXPLORÁ A TU RITMO</p>
          <h2>Tu próxima aventura <em>comienza aquí.</em></h2>
          <p class="subheading">
            Elegí lo que más te inspire y reservá con anfitriones locales.
          </p>
        </div>
        <div class="mini-stamp">
          ✺<span>HECHO PARA<br>EXPLORAR</span>
        </div>
      </div>

      <div class="filters">
        ${cats
          .map(
            c => `<button class="chip ${filter === c ? 'selected' : ''}" data-filter="${esc(c)}">${esc(c)}</button>`,
          )
          .join('')}
      </div>

      <div class="cards">
        ${visible.map(card).join('') ||
        '<div class="empty">Todavía no hay experiencias en esta categoría.</div>'}
      </div>
    </section>

    <section class="container why">
      <div class="why-icon">◉</div>
      <div>
        <p class="section-kicker">CONECTIVIDAD SIN BARRERAS</p>
        <h2>La naturaleza no espera al Wi-Fi.</h2>
        <p>
          Podés guardar una solicitud cuando no tengas señal. Al regresar la
          conexión, la app intentará enviarla y confirmará únicamente si quedan
          cupos.
        </p>
      </div>
      <button id="pending-link">Ver mis solicitudes ↗</button>
    </section>
  `

  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => {
    button.onclick = () => {
      filter = button.dataset.filter!
      renderExplore()
    }
  })

  document.querySelectorAll<HTMLButtonElement>('[data-book]').forEach(button => {
    button.onclick = () => {
      selected =
        experiences.find(x => x._id === button.dataset.book) || null
      openBooking()
    }
  })

  document.querySelector<HTMLButtonElement>('#pending-link')!.onclick = () =>
    navigate('mis-reservas')
}

function openBooking() {
  if (!selected) return

  const x = selected
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop'
  backdrop.innerHTML = `
    <section class="modal" role="dialog" aria-modal="true" aria-label="Realizar reserva">
      <button class="modal-close" id="close-modal" aria-label="Cerrar">×</button>
      <p class="section-kicker">TU PRÓXIMA EXPERIENCIA</p>
      <h2>${esc(x.title)}</h2>
      <p class="modal-location">
        ⌖ ${esc(x.place)} · ${money(x.price)} por persona o unidad
      </p>

      <form id="booking-form">
        <label>
          Tu nombre completo
          <input name="name" required minlength="2" placeholder="Nombre y apellido" autocomplete="name">
        </label>
        <label>
          Correo electrónico
          <input name="email" type="email" required placeholder="correo@ejemplo.com" autocomplete="email">
        </label>

        <div class="form-grid">
          <label>
            Fecha de visita
            <input name="date" type="date" min="${dateNow()}" value="${dateNow()}" required>
          </label>
          <label>
            Personas o unidades
            <input name="people" type="number" min="1" max="${Math.min(x.capacity, 30)}" value="1" required>
          </label>
        </div>

        <p id="availability-label" class="hint">
          Consultá disponibilidad al elegir la fecha.
        </p>
        <button class="submit-btn" type="submit">Solicitar reserva ↗</button>
        <p class="hint">
          Sin internet, la solicitud se guardará como pendiente. No implica una
          reserva confirmada ni un pago realizado.
        </p>
      </form>
    </section>
  `

  document.body.append(backdrop)

  const close = () => backdrop.remove()

  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) close()
  })

  backdrop.querySelector<HTMLButtonElement>('#close-modal')!.onclick = close

  const form = backdrop.querySelector<HTMLFormElement>('#booking-form')!

  const check = async () => {
    const date = (
      form.elements.namedItem('date') as HTMLInputElement
    ).value
    const label = backdrop.querySelector('#availability-label')!

    if (!navigator.onLine) {
      label.textContent =
        'Sin conexión: no es posible comprobar cupos ahora.'
      return
    }

    try {
      const availability = await api<{ remaining: number }>(
        `/availability/${encodeURIComponent(x._id)}/${date}`,
      )
      label.textContent = `Cupos disponibles para esa fecha: ${availability.remaining}`
    } catch {
      label.textContent = 'No se pudo consultar la disponibilidad.'
    }
  }

  ;(form.elements.namedItem('date') as HTMLInputElement).onchange = () =>
    void check()
  void check()

  form.onsubmit = async event => {
    event.preventDefault()

    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!
    submit.disabled = true

    const data = new FormData(form)
    const item: PendingBooking = {
      experience_id: x._id,
      date: String(data.get('date')),
      name: String(data.get('name')),
      email: String(data.get('email')),
      people: Number(data.get('people')),
      idempotency_key: crypto.randomUUID(),
    }

    await putPending(item)
    await badge()
    close()

    if (navigator.onLine) {
      await synchronize()
      const remains = await allPending()
      toast(
        remains.some(
          pending => pending.idempotency_key === item.idempotency_key,
        )
          ? 'Solicitud guardada. Se enviará cuando la conexión esté disponible.'
          : '¡Reserva confirmada! Podés consultar con el anfitrión.',
        false,
      )
    } else {
      toast(
        'Solicitud guardada en este dispositivo. Aún no está confirmada.',
      )
    }

    submit.disabled = false
  }
}

async function synchronize() {
  if (syncing || !navigator.onLine) return

  syncing = true

  try {
    const items = await allPending()

    for (const pending of items) {
      try {
        await api('/reservations', {
          method: 'POST',
          body: JSON.stringify(pending),
        })
        await removePending(pending.idempotency_key)
      } catch (error) {
        if (
          error instanceof Error &&
          /cupos|fecha|inválido|encontrada|Verificá/.test(error.message)
        ) {
          toast(`Solicitud rechazada: ${error.message}`, true)
          await removePending(pending.idempotency_key)
        } else {
          break
        }
      }
    }

    await badge()

    if (currentTab === 'mis-reservas') {
      await renderPending()
    }
  } finally {
    syncing = false
  }
}

async function renderPending() {
  const items = await allPending()
  const page = document.querySelector('#page')!

  page.innerHTML = `
    <section class="container narrow page-section">
      <p class="section-kicker">TUS SOLICITUDES</p>
      <h2>Reservas <em>pendientes.</em></h2>
      <p class="subheading">
        Estas solicitudes están guardadas en este navegador. No se consideran
        confirmadas hasta que el servidor las acepte.
      </p>

      <div class="pending-list">
        ${
          items.length
            ? items
                .map(
                  item => `
                    <div class="pending">
                      <div>
                        <strong>
                          ${esc(
                            experiences.find(
                              experience => experience._id === item.experience_id,
                            )?.title || item.experience_id,
                          )}
                        </strong>
                        <p>
                          ${esc(item.date)} · ${item.people} personas/unidades ·
                          ${esc(item.name)}
                        </p>
                        <span class="pending-state">◷ Sin confirmar</span>
                      </div>
                      <button data-remove="${esc(item.idempotency_key)}" class="text-button">
                        Eliminar
                      </button>
                    </div>
                  `,
                )
                .join('')
            : `
              <div class="empty">
                <span>✓</span>
                <h3>No hay solicitudes pendientes</h3>
                <p>
                  Las solicitudes enviadas correctamente se eliminan de la cola
                  local.
                </p>
              </div>
            `
        }
      </div>

      <button id="sync-now" class="submit-btn secondary">
        Reintentar envío ↗
      </button>
    </section>
  `

  page.querySelector<HTMLButtonElement>('#sync-now')!.onclick = async () => {
    await synchronize()
    toast('Sincronización revisada.')
  }

  page
    .querySelectorAll<HTMLButtonElement>('[data-remove]')
    .forEach(button => {
      button.onclick = async () => {
        await removePending(button.dataset.remove!)
        await badge()
        await renderPending()
      }
    })
}

function renderAdmin() {
  const page = document.querySelector('#page')!

  page.innerHTML = `
    <section class="container page-section">
      <p class="section-kicker">PANEL PARA MICRONEGOCIOS</p>
      <h2>Tu negocio, <em>más conectado.</em></h2>
      <p class="subheading">
        Administrá experiencias y consultá reservas confirmadas del prototipo.
      </p>

      <div class="admin-auth">
        <label>
          Clave de administración
          <input
            type="password"
            id="admin-key"
            placeholder="ADMIN_KEY de tu archivo .env"
            value="${esc(adminKey)}"
          >
        </label>
        <button id="admin-access" class="submit-btn">
          Acceder al panel ↗
        </button>
      </div>

      <div id="admin-area"></div>
    </section>
  `

  page.querySelector<HTMLButtonElement>('#admin-access')!.onclick = () => {
    adminKey = (
      page.querySelector('#admin-key') as HTMLInputElement
    ).value
    void loadAdmin()
  }

  if (adminKey) void loadAdmin()
}

async function loadAdmin() {
  const area = document.querySelector('#admin-area')!
  area.innerHTML = loading

  try {
    const [bookings, metrics] = await Promise.all([
      api<Booking[]>('/reservations', {
        headers: { 'x-admin-key': adminKey },
      }),
      api<{
        requests: number
        errors: number
        average_api_latency_ms: number
      }>('/metrics', {
        headers: { 'x-admin-key': adminKey },
      }),
    ])

    area.innerHTML = `
      <div class="admin-stats">
        <div>
          <span>Reservas confirmadas</span>
          <strong>${bookings.length}</strong>
        </div>
        <div>
          <span>Solicitudes API</span>
          <strong>${metrics.requests}</strong>
        </div>
        <div>
          <span>Latencia promedio API</span>
          <strong>${metrics.average_api_latency_ms}ms</strong>
        </div>
      </div>

      <div class="admin-columns">
        <section class="admin-panel">
          <h3>Reservas recibidas</h3>
          ${
            bookings.length
              ? bookings
                  .map(
                    booking => `
                      <div class="admin-booking">
                        <strong>${esc(booking.title)}</strong>
                        <p>
                          ${esc(booking.name)} · ${esc(booking.date)} ·
                          ${booking.people} personas/unidades
                        </p>
                        <span>Confirmada · Pago no integrado</span>
                      </div>
                    `,
                  )
                  .join('')
              : '<p class="muted">Todavía no hay reservas.</p>'
          }
        </section>

        <section class="admin-panel">
          <h3>Publicar una experiencia</h3>
          <form id="experience-form" class="admin-form">
            <label>
              Nombre
              <input name="title" required minlength="3">
            </label>
            <label>
              Ubicación
              <input name="place" required>
            </label>
            <label>
              Categoría
              <select name="kind">
                <option>Senderismo</option>
                <option>Alojamiento</option>
                <option>Aventura</option>
                <option>Naturaleza</option>
                <option>Camping</option>
                <option>Ecoturismo</option>
              </select>
            </label>

            <div class="form-grid">
              <label>
                Precio USD
                <input name="price" type="number" step="0.01" min="0" required>
              </label>
              <label>
                Capacidad
                <input name="capacity" type="number" min="1" required>
              </label>
            </div>

            <label>
              Descripción
              <textarea name="description" rows="3"></textarea>
            </label>

            <button class="submit-btn">Guardar experiencia ↗</button>
          </form>
        </section>
      </div>
    `

    area.querySelector<HTMLFormElement>('#experience-form')!.onsubmit =
      async event => {
        event.preventDefault()

        const form = event.currentTarget as HTMLFormElement
        const formData = new FormData(form)
        const data = {
          title: String(formData.get('title')),
          place: String(formData.get('place')),
          kind: String(formData.get('kind')),
          description: String(formData.get('description')),
          price: Number(formData.get('price')),
          capacity: Number(formData.get('capacity')),
        }

        try {
          await api('/experiences', {
            method: 'POST',
            headers: { 'x-admin-key': adminKey },
            body: JSON.stringify(data),
          })
          experiences = await api<Experience[]>('/experiences')
          toast('Experiencia publicada.')
          await loadAdmin()
        } catch (error) {
          toast((error as Error).message, true)
        }
      }
  } catch (error) {
    area.innerHTML = `
      <div class="error-panel">${esc((error as Error).message)}</div>
    `
  }
}

async function load() {
  shell()

  const page = document.querySelector('#page')!
  page.innerHTML = loading

  try {
    experiences = await api<Experience[]>('/experiences')
    localStorage.setItem('cached-experiences', JSON.stringify(experiences))
  } catch {
    try {
      experiences = JSON.parse(
        localStorage.getItem('cached-experiences') || '[]',
      )
    } catch {
      experiences = []
    }

    toast(
      'Modo sin conexión: mostrando información guardada. Las reservas estarán pendientes.',
      true,
    )
  }

  renderExplore()
  await badge()

  if (navigator.onLine) void synchronize()

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

let deferredPrompt: any = null

window.addEventListener('beforeinstallprompt', (event: Event) => {
  event.preventDefault()
  deferredPrompt = event

  const button = document.querySelector<HTMLButtonElement>('#install')
  if (button) button.hidden = false
})

document.addEventListener('click', async event => {
  if (
    (event.target as HTMLElement).id === 'install' &&
    deferredPrompt
  ) {
    await deferredPrompt.prompt()
    deferredPrompt = null

    const button = document.querySelector<HTMLButtonElement>('#install')
    if (button) button.hidden = true
  }
})

void load()
