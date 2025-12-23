import './style.css'

const app = document.querySelector('#app')

const AUTH_KEY = 'tda_auth'
const COURSES_KEY = 'tda_courses'
const LECTURER = { username: 'lecturer', password: 'TdA26!' }

const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 9)

const API_BASE = '/api'

const saveCourses = (arr) => localStorage.setItem(COURSES_KEY, JSON.stringify(arr))
const loadCourses = () => JSON.parse(localStorage.getItem(COURSES_KEY) || 'null') || []

async function fetchCourses() {
  try {
    const res = await fetch(`${API_BASE}/courses`)
    if (!res.ok) throw new Error('Failed to fetch')
    return await res.json()
  } catch (e) {
    // fallback to local
    return loadCourses()
  }
}

async function fetchCourse(uuid) {
  try {
    const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(uuid)}`)
    if (!res.ok) throw new Error('Not found')
    return await res.json()
  } catch (e) {
    const local = loadCourses()
    return local.find(c => c.id === uuid)
  }
}

async function createCourseOnServer(title, description) {
  try {
    const res = await fetch(`${API_BASE}/courses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: title, description }) })
    if (!res.ok) throw new Error('Create failed')
    return await res.json()
  } catch (e) {
    const arr = loadCourses()
    const obj = { id: uuid(), title, description }
    arr.push(obj); saveCourses(arr); return obj
  }
}

async function updateCourseOnServer(uuid, title, description) {
  try {
    const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(uuid)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: title, description }) })
    if (!res.ok) throw new Error('Update failed')
    return await res.json()
  } catch (e) {
    const arr = loadCourses()
    const idx = arr.findIndex(c => c.id === uuid)
    if (idx >= 0) { arr[idx].title = title; arr[idx].description = description; saveCourses(arr); return arr[idx] }
    throw e
  }
}

async function deleteCourseOnServer(uuid) {
  try {
    const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(uuid)}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) throw new Error('Delete failed')
    return true
  } catch (e) {
    const arr = loadCourses().filter(x => x.id !== uuid)
    saveCourses(arr)
    return true
  }
}

const isAuth = () => !!localStorage.getItem(AUTH_KEY)
const login = (username, password) => {
  if (username === LECTURER.username && password === LECTURER.password) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: username }))
    updateNav()
    return true
  }
  return false
}
const logout = () => { localStorage.removeItem(AUTH_KEY); updateNav(); navigateTo('/') }

const routes = []

function route(path, renderer) { routes.push({ path, renderer }) }

function parseLocation() {
  return location.pathname
}

function findRoute(pathname) {
  for (const r of routes) {
    if (r.path === pathname) return { renderer: r.renderer, params: {} }
    const paramMatch = matchParam(r.path, pathname)
    if (paramMatch) return { renderer: r.renderer, params: paramMatch }
  }
  return null
}

function matchParam(routePath, pathname) {
  const routeParts = routePath.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  if (routeParts.length !== pathParts.length) return null
  const params = {}
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) {
      params[routeParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    } else if (routeParts[i] !== pathParts[i]) return null
  }
  return params
}

async function router() {
  const pathname = parseLocation()
  const match = findRoute(pathname)
  if (!match) { renderNotFound(); return }
  if (pathname === '/dashboard' && !isAuth()) { navigateTo('/login'); return }
  await match.renderer(match.params)
}

function navigateTo(url) {
  history.pushState(null, null, url)
  router()
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]')
  if (a && a.host === location.host) {
    e.preventDefault()
    navigateTo(a.pathname)
  }
})

window.addEventListener('popstate', router)

function updateNav() {
  const loginLink = document.getElementById('nav-login')
  const dashboardLink = document.getElementById('nav-dashboard')
  if (isAuth()) {
    loginLink.style.display = 'none'
    dashboardLink.style.display = ''
  } else {
    loginLink.style.display = ''
    dashboardLink.style.display = 'none'
  }
}

function renderNotFound() {
  app.innerHTML = `<h2>Not found</h2><p>The page does not exist.</p>`
}

function renderHome() {
  app.innerHTML = `
    <h1>Noodle</h1>
    <p>Něco jako Moodle ale horší a nefunkční.</p>
  `
}

async function renderCourses() {
  const courses = await fetchCourses()
  app.innerHTML = `
    <h1>Courses</h1>
    <div style="margin-bottom:1rem;">
      <input id="search" placeholder="Search by title" style="padding:0.5rem;width:60%" />
    </div>
    <div id="courses-list"></div>
  `
  const list = document.getElementById('courses-list')
  function show(filtered) {
    if (!filtered.length) { list.innerHTML = '<p>No courses found.</p>'; return }
    list.innerHTML = filtered.map(c => `
      <article style="text-align:left;border:1px solid #e6e9ee;padding:1rem;margin:0.5rem 0;">
        <h3><a href="/courses/${c.uuid || c.id}" data-link>${escapeHtml(c.name || c.title)}</a></h3>
        <p>${escapeHtml(c.description || '')}</p>
      </article>
    `).join('')
  }
  show(courses)
  const search = document.getElementById('search')
  search.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase()
    if (!q) return show(courses)
    show(courses.filter(c => (c.name || c.title || '').toLowerCase().includes(q)))
  })
}

async function renderCourseDetail(params) {
  const course = await fetchCourse(params.uuid)
  if (!course) { renderNotFound(); return }
  const materials = (course.materials || []).slice().sort((a,b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
  app.innerHTML = `
    <h1>${escapeHtml(course.name || course.title)}</h1>
    <p>${escapeHtml(course.description || '')}</p>
    <section style="max-width:760px;margin:1rem auto;text-align:left;">
      <h2>Materials</h2>
      <div id="public-materials-list">
        ${materials.length ? materials.map(m => {
          if (m.type === 'file') {
            return `<div style="border:1px solid #e6e9ee;padding:0.5rem;margin-bottom:0.5rem;">
              <strong>${escapeHtml(m.name)}</strong>
              <div style="color:#666">${escapeHtml(m.description || '')}</div>
              <div><a href="${m.fileUrl}" target="_blank" rel="noopener">Download</a></div>
            </div>`
          }
          return `<div style="border:1px solid #e6e9ee;padding:0.5rem;margin-bottom:0.5rem;display:flex;gap:0.5rem;align-items:center;">
            ${m.faviconUrl ? `<img src="${m.faviconUrl}" style="width:24px;height:24px;object-fit:contain;border-radius:4px" />` : ''}
            <div>
              <strong><a href="${m.url}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a></strong>
              <div style="color:#666">${escapeHtml(m.description || '')}</div>
            </div>
          </div>`
        }).join('') : '<p>No materials yet.</p>'}
      </div>
    </section>
    <p><a href="/courses" data-link>Back to list</a></p>
  `
}

function renderLogin() {
  if (isAuth()) { navigateTo('/dashboard'); return }
  app.innerHTML = `
    <h1>Lecturer Login</h1>
    <form id="login-form" style="max-width:28rem;margin:0 auto;text-align:left;">
      <label>Username<br/><input name="username" required style="width:100%;padding:0.5rem"/></label>
      <label>Password<br/><input name="password" type="password" required style="width:100%;padding:0.5rem"/></label>
      <div style="margin-top:0.5rem;"><button type="submit">Login</button></div>
      <p id="login-error" style="color:#c0392b"></p>
    </form>
  `
  const form = document.getElementById('login-form')
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const username = fd.get('username')
    const password = fd.get('password')
    if (login(username, password)) { navigateTo('/dashboard') } else {
      document.getElementById('login-error').textContent = 'Invalid credentials.'
    }
  })
}

async function renderDashboard() {
  if (!isAuth()) { navigateTo('/login'); return }
  const courses = await fetchCourses()
  app.innerHTML = `
    <h1>Dashboard</h1>
    <div style="text-align:left;max-width:760px;margin:0 auto;">
      <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;">
        <button id="logout">Logout</button>
      </div>
      <section style="margin-bottom:1rem;">
        <h2>Add course</h2>
        <form id="add-form">
          <input name="title" placeholder="Title" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
          <textarea name="description" placeholder="Description" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem"></textarea>
          <div><button type="submit">Add</button></div>
        </form>
      </section>
      <section>
        <h2>Your courses</h2>
        <div id="manage-list"></div>
      </section>
    </div>
  `
  document.getElementById('logout').addEventListener('click', () => { logout() })
  const addForm = document.getElementById('add-form')
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(addForm)
    const title = fd.get('title').trim()
    const description = fd.get('description').trim()
    if (!title) return
    await createCourseOnServer(title, description)
    renderDashboard()
  })
  renderManageList()
}

async function renderManageList() {
  const list = document.getElementById('manage-list')
  const courses = await fetchCourses()
  if (!courses.length) { list.innerHTML = '<p>No courses yet.</p>'; return }
  list.innerHTML = courses.map(c => `
    <div style="border:1px solid #e6e9ee;padding:0.5rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center;">
      <div style="flex:1;text-align:left;padding-right:1rem;">
        <strong>${escapeHtml(c.name || c.title)}</strong>
        <div style="color:#666">${escapeHtml(c.description || '')}</div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button data-action="edit" data-id="${c.uuid || c.id}">Edit</button>
        <button data-action="manage" data-id="${c.uuid || c.id}">Manage</button>
        <button data-action="delete" data-id="${c.uuid || c.id}">Delete</button>
      </div>
    </div>
  `).join('')
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    if (action === 'delete') {
      if (!confirm('Delete this course?')) return
      await deleteCourseOnServer(id)
      renderDashboard()
    } else if (action === 'edit') {
      openEditForm(id)
    } else if (action === 'manage') {
      navigateTo(`/dashboard/courses/${encodeURIComponent(id)}`)
    }
  }))
}

function openEditForm(id) {
  fetchCourse(id).then(course => {
    if (!course) return renderNotFound()
  app.innerHTML = `
    <h1>Edit course</h1>
    <form id="edit-form" style="max-width:760px;margin:0 auto;text-align:left;">
      <input name="title" value="${escapeHtml(course.name || course.title)}" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
      <textarea name="description" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem">${escapeHtml(course.description || '')}</textarea>
      <div><button type="submit">Save</button> <button id="cancel">Cancel</button></div>
    </form>
  `
  document.getElementById('cancel').addEventListener('click', (e) => { e.preventDefault(); renderDashboard() })
  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = fd.get('title').trim()
    const description = fd.get('description').trim()
    await updateCourseOnServer(id, title, description)
    renderDashboard()
  })
  }).catch(() => renderNotFound())
}

// Lecturer: manage single course (materials)
async function renderManageCourse(params) {
  if (!isAuth()) { navigateTo('/login'); return }
  const id = params.uuid
  const course = await fetchCourse(id)
  if (!course) return renderNotFound()
  const materials = (course.materials || []).slice().sort((a,b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
  app.innerHTML = `
    <h1>Manage course: ${escapeHtml(course.name || course.title)}</h1>
    <p><a href="/dashboard" data-link>Back to dashboard</a></p>
    <section style="max-width:760px;margin:0 auto;text-align:left;">
      <h2>Materials</h2>
      <div id="materials-list">${materials.length ? '' : '<p>No materials yet.</p>'}</div>
      <hr />
      <h3>Add file</h3>
      <form id="upload-form">
        <input name="name" placeholder="Title" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        <input name="description" placeholder="Short description" style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        <input type="file" name="file" required style="margin-bottom:0.5rem" />
        <input type="hidden" name="type" value="file" />
        <div><button type="submit">Upload file</button></div>
      </form>
      <hr />
      <h3>Add link</h3>
      <form id="link-form">
        <input name="name" placeholder="Title" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        <input name="url" placeholder="https://..." required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        <input name="description" placeholder="Short description" style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        <div><button type="submit">Add link</button></div>
      </form>
    </section>
  `

  function renderMaterials() {
    const container = document.getElementById('materials-list')
    const arr = (course.materials || []).slice().sort((a,b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })
    if (!arr.length) { container.innerHTML = '<p>No materials yet.</p>'; return }
    container.innerHTML = arr.map(m => {
      if (m.type === 'file') {
        return `<div style="border:1px solid #e6e9ee;padding:0.5rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center;">
          <div style="text-align:left;flex:1">
            <strong>${escapeHtml(m.name)}</strong>
            <div style="color:#666">${escapeHtml(m.description || '')}</div>
            <div><a href="${m.fileUrl}" target="_blank" rel="noopener">Download</a> — ${m.mimeType || ''} ${m.sizeBytes ? '('+m.sizeBytes+' bytes)' : ''}</div>
          </div>
          <div style="display:flex;gap:0.5rem">
            <button data-action="edit-material" data-id="${m.uuid}">Edit</button>
            <button data-action="delete-material" data-id="${m.uuid}">Delete</button>
          </div>
        </div>`
      }
      return `<div style="border:1px solid #e6e9ee;padding:0.5rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center;">
        <div style="text-align:left;flex:1;display:flex;gap:0.5rem;align-items:center">
          ${m.faviconUrl ? `<img src="${m.faviconUrl}" style="width:24px;height:24px;object-fit:contain;border-radius:4px" />` : ''}
          <div>
            <strong><a href="${m.url}" target="_blank" rel="noopener">${escapeHtml(m.name)}</a></strong>
            <div style="color:#666">${escapeHtml(m.description || '')}</div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button data-action="edit-material" data-id="${m.uuid}">Edit</button>
          <button data-action="delete-material" data-id="${m.uuid}">Delete</button>
        </div>
      </div>`
    }).join('')
    // attach listeners
    container.querySelectorAll('button').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id
      const action = e.currentTarget.dataset.action
      if (action === 'delete-material') {
        if (!confirm('Delete this material?')) return
        await fetch(`${API_BASE}/courses/${encodeURIComponent(idCourse(id))}/materials/${encodeURIComponent(id)}`, { method: 'DELETE' })
        // refresh
        const latest = await fetchCourse(idCourse(id))
        course.materials = latest.materials || []
        renderMaterials()
      } else if (action === 'edit-material') {
        openEditMaterial(id)
      }
    }))
  }

  function idCourse(materialId) {
    // helper — materials stored on this course
    return course.uuid || course.id
  }

  function openEditMaterial(materialId) {
    const m = (course.materials || []).find(x => x.uuid === materialId)
    if (!m) return
    const formHtml = `
      <h4>Edit material</h4>
      <form id="edit-material-form">
        <input name="name" value="${escapeHtml(m.name)}" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        <input name="description" value="${escapeHtml(m.description || '')}" style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
        ${m.type === 'url' ? `<input name="url" value="${escapeHtml(m.url || '')}" style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />` : ''}
        <div><button type="submit">Save</button> <button id="cancel-edit">Cancel</button></div>
      </form>
    `
    const container = document.getElementById('materials-list')
    container.insertAdjacentHTML('afterbegin', formHtml)
    document.getElementById('cancel-edit').addEventListener('click', (e) => { e.preventDefault(); renderMaterials() })
    document.getElementById('edit-material-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget)
      const payload = { name: fd.get('name'), description: fd.get('description') }
      if (m.type === 'url') payload.url = fd.get('url')
      await fetch(`${API_BASE}/courses/${encodeURIComponent(idCourse(materialId))}/materials/${encodeURIComponent(materialId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const latest = await fetchCourse(idCourse(materialId))
      course.materials = latest.materials || []
      renderMaterials()
    })
  }

  // upload handler
  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = e.currentTarget
    const fd = new FormData(f)
    try {
      const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(id)}/materials`, { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Upload failed')
        return
      }
      const created = await res.json()
      course.materials = (course.materials || []).concat([created])
      renderMaterials()
      f.reset()
    } catch (e) { alert('Upload failed') }
  })

  document.getElementById('link-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = { type: 'url', name: fd.get('name'), description: fd.get('description'), url: fd.get('url') }
    try {
      const res = await fetch(`${API_BASE}/courses/${encodeURIComponent(id)}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const err = await res.json().catch(()=>({})); alert(err.error||'Failed'); return }
      const created = await res.json()
      course.materials = (course.materials || []).concat([created])
      renderMaterials()
      e.currentTarget.reset()
    } catch (e) { alert('Failed to add link') }
  })

  renderMaterials()
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

route('/', renderHome)
route('/courses', renderCourses)
route('/courses/:uuid', renderCourseDetail)
route('/login', renderLogin)
route('/dashboard', renderDashboard)
route('/dashboard/courses/:uuid', renderManageCourse)

updateNav()
router()

window.navigateTo = navigateTo

