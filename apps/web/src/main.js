import './style.css'

const app = document.querySelector('#app')

app.innerHTML = `
  <div>
    <pre id="users-data">
      Loading...
    </pre>
    <div>
      <section>
        <h2>API Status</h2>
      </section>
    </div>
  </div>
`

const fetchUsers = async () => {
  const response = await fetch('/api/users')
  const users = await response.json()
  
  const preElement = document.querySelector('#users-data')
  preElement.textContent = JSON.stringify(users, null, 2)
}

fetchUsers()

