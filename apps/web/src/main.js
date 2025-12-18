import './style.css'

const app = document.querySelector('#app')

const AUTH_KEY = 'tda_auth'
const COURSES_KEY = 'tda_courses'
const LECTURER = { username: 'lecturer', password: 'TdA26!' }

const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 9)

const saveCourses = (arr) => localStorage.setItem(COURSES_KEY, JSON.stringify(arr))
const loadCourses = () => JSON.parse(localStorage.getItem(COURSES_KEY) || 'null') || seedCourses()

function seedCourses() {
  const seed = [
    { id: uuid(), title: 'Test 1', description: 'Něco' },
    { id: uuid(), title: 'Test 2', description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit' }
  ]
  saveCourses(seed)
  return seed
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

function renderCourses() {
  const courses = loadCourses()
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
        <h3><a href="/courses/${c.id}" data-link>${escapeHtml(c.title)}</a></h3>
        <p>${escapeHtml(c.description)}</p>
      </article>
    `).join('')
  }
  show(courses)
  const search = document.getElementById('search')
  search.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase()
    if (!q) return show(courses)
    show(courses.filter(c => c.title.toLowerCase().includes(q)))
  })
}

function renderCourseDetail(params) {
  const courses = loadCourses()
  const course = courses.find(c => c.id === params.uuid)
  if (!course) { renderNotFound(); return }
  app.innerHTML = `
    <h1>${escapeHtml(course.title)}</h1>
    <p>${escapeHtml(course.description)}</p>
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

function renderDashboard() {
  if (!isAuth()) { navigateTo('/login'); return }
  const courses = loadCourses()
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
  addForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(addForm)
    const title = fd.get('title').trim()
    const description = fd.get('description').trim()
    if (!title) return
    const arr = loadCourses()
    arr.push({ id: uuid(), title, description })
    saveCourses(arr)
    renderDashboard()
  })
  renderManageList()
}

function renderManageList() {
  const list = document.getElementById('manage-list')
  const courses = loadCourses()
  if (!courses.length) { list.innerHTML = '<p>No courses yet.</p>'; return }
  list.innerHTML = courses.map(c => `
    <div style="border:1px solid #e6e9ee;padding:0.5rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center;">
      <div style="flex:1;text-align:left;padding-right:1rem;">
        <strong>${escapeHtml(c.title)}</strong>
        <div style="color:#666">${escapeHtml(c.description)}</div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button data-action="edit" data-id="${c.id}">Edit</button>
        <button data-action="delete" data-id="${c.id}">Delete</button>
      </div>
    </div>
  `).join('')
  list.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    if (action === 'delete') {
      if (!confirm('Delete this course?')) return
      const arr = loadCourses().filter(x => x.id !== id)
      saveCourses(arr)
      renderDashboard()
    } else if (action === 'edit') {
      openEditForm(id)
    }
  }))
}

function openEditForm(id) {
  const courses = loadCourses()
  const course = courses.find(c => c.id === id)
  if (!course) return
  app.innerHTML = `
    <h1>Edit course</h1>
    <form id="edit-form" style="max-width:760px;margin:0 auto;text-align:left;">
      <input name="title" value="${escapeHtml(course.title)}" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem" />
      <textarea name="description" required style="width:100%;padding:0.5rem;margin-bottom:0.5rem">${escapeHtml(course.description)}</textarea>
      <div><button type="submit">Save</button> <button id="cancel">Cancel</button></div>
    </form>
  `
  document.getElementById('cancel').addEventListener('click', (e) => { e.preventDefault(); renderDashboard() })
  document.getElementById('edit-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = fd.get('title').trim()
    const description = fd.get('description').trim()
    const arr = loadCourses()
    const idx = arr.findIndex(x => x.id === id)
    if (idx >= 0) { arr[idx].title = title; arr[idx].description = description; saveCourses(arr) }
    renderDashboard()
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

route('/', renderHome)
route('/courses', renderCourses)
route('/courses/:uuid', renderCourseDetail)
route('/login', renderLogin)
route('/dashboard', renderDashboard)

updateNav()
router()

window.navigateTo = navigateTo

