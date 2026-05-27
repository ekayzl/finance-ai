export type Account = 'Pessoal' | 'Empresa'

export interface Transaction {
  id: string
  date: string
  description: string
  category: string
  amount: number
  type: 'gasto' | 'receita'
  account: Account
}

export interface Income {
  id: string
  date: string
  description: string
  amount: number
  account: Account
}

export interface Recurring {
  id: string
  description: string
  category: string
  amount: number
  account: Account
  active: boolean
}

export interface Budget {
  category: string
  limit: number
  account: Account
}

export interface Settings {
  account: Account
  monthlySalary: number
  savingsGoal: number
}

function getAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n')
    .replace(/^"|"$/g, '')

  return {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    key: privateKey,
  }
}

async function getAccessToken(): Promise<string> {
  const auth = getAuth()
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: auth.email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const crypto = await import('crypto')
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(auth.key, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data))
  return data.access_token
}

async function sheetsRequest(path: string, method = 'GET', body?: object) {
  const token = await getAccessToken()
  const sheetId = process.env.GOOGLE_SHEET_ID
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sheets API error: ${err}`)
  }
  return res.json()
}

const SHEETS = {
  Pessoal: 'Pessoal',
  Empresa: 'Empresa',
  RendaPessoal: 'Renda_Pessoal',
  RendaEmpresa: 'Renda_Empresa',
  Recorrentes: 'Recorrentes',
  Orcamentos: 'Orcamentos',
  Configuracoes: 'Configuracoes',
}

export async function ensureAllSheets() {
  const data = await sheetsRequest('')
  const existing: string[] = data.sheets.map((s: { properties: { title: string } }) => s.properties.title)

  const needed = Object.values(SHEETS).filter(s => !existing.includes(s))
  if (needed.length === 0) return

  await sheetsRequest(':batchUpdate', 'POST', {
    requests: needed.map(title => ({
      addSheet: { properties: { title } }
    }))
  })

  // Add headers
  const updates: { range: string; values: string[][] }[] = []

  if (needed.includes(SHEETS.Pessoal)) updates.push({ range: `${SHEETS.Pessoal}!A1:G1`, values: [['ID', 'Data', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Conta']] })
  if (needed.includes(SHEETS.Empresa)) updates.push({ range: `${SHEETS.Empresa}!A1:G1`, values: [['ID', 'Data', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Conta']] })
  if (needed.includes(SHEETS.RendaPessoal)) updates.push({ range: `${SHEETS.RendaPessoal}!A1:E1`, values: [['ID', 'Data', 'Descrição', 'Valor', 'Conta']] })
  if (needed.includes(SHEETS.RendaEmpresa)) updates.push({ range: `${SHEETS.RendaEmpresa}!A1:E1`, values: [['ID', 'Data', 'Descrição', 'Valor', 'Conta']] })
  if (needed.includes(SHEETS.Recorrentes)) updates.push({ range: `${SHEETS.Recorrentes}!A1:F1`, values: [['ID', 'Descrição', 'Categoria', 'Valor', 'Conta', 'Ativo']] })
  if (needed.includes(SHEETS.Orcamentos)) updates.push({ range: `${SHEETS.Orcamentos}!A1:C1`, values: [['Categoria', 'Limite', 'Conta']] })
  if (needed.includes(SHEETS.Configuracoes)) updates.push({ range: `${SHEETS.Configuracoes}!A1:C1`, values: [['Conta', 'SalarioMensal', 'MetaEconomia']] })

  if (updates.length > 0) {
    await sheetsRequest('/values:batchUpdate', 'POST', {
      valueInputOption: 'RAW',
      data: updates,
    })
  }
}

function sheetName(account: Account) {
  return account === 'Pessoal' ? SHEETS.Pessoal : SHEETS.Empresa
}

function incomeSheetName(account: Account) {
  return account === 'Pessoal' ? SHEETS.RendaPessoal : SHEETS.RendaEmpresa
}

export async function getTransactions(account: Account): Promise<Transaction[]> {
  try {
    const data = await sheetsRequest(`/values/${sheetName(account)}`)
    const rows: string[][] = data.values || []
    if (rows.length <= 1) return []
    return rows.slice(1).map(r => ({
      id: r[0] || '',
      date: r[1] || '',
      description: r[2] || '',
      category: r[3] || '',
      amount: parseFloat(r[4]) || 0,
      type: (r[5] as 'gasto' | 'receita') || 'gasto',
      account: (r[6] as Account) || account,
    }))
  } catch { return [] }
}

export async function addTransaction(t: Omit<Transaction, 'id'>) {
  const id = Date.now().toString()
  await sheetsRequest(`/values/${sheetName(t.account)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', {
    values: [[id, t.date, t.description, t.category, t.amount, t.type, t.account]]
  })
  return id
}

export async function deleteTransaction(account: Account, id: string) {
  const data = await sheetsRequest(`/values/${sheetName(account)}`)
  const rows: string[][] = data.values || []
  const rowIndex = rows.findIndex(r => r[0] === id)
  if (rowIndex === -1) return

  const sheetData = await sheetsRequest('')
  const sheet = sheetData.sheets.find((s: { properties: { title: string } }) => s.properties.title === sheetName(account))
  if (!sheet) return

  await sheetsRequest(':batchUpdate', 'POST', {
    requests: [{
      deleteDimension: {
        range: {
          sheetId: sheet.properties.sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1,
        }
      }
    }]
  })
}

export async function getIncome(account: Account): Promise<Income[]> {
  try {
    const data = await sheetsRequest(`/values/${incomeSheetName(account)}`)
    const rows: string[][] = data.values || []
    if (rows.length <= 1) return []
    return rows.slice(1).map(r => ({
      id: r[0] || '',
      date: r[1] || '',
      description: r[2] || '',
      amount: parseFloat(r[3]) || 0,
      account: (r[4] as Account) || account,
    }))
  } catch { return [] }
}

export async function addIncome(inc: Omit<Income, 'id'>) {
  const id = Date.now().toString()
  await sheetsRequest(`/values/${incomeSheetName(inc.account)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', {
    values: [[id, inc.date, inc.description, inc.amount, inc.account]]
  })
  return id
}

export async function getRecurring(): Promise<Recurring[]> {
  try {
    const data = await sheetsRequest(`/values/${SHEETS.Recorrentes}`)
    const rows: string[][] = data.values || []
    if (rows.length <= 1) return []
    return rows.slice(1).map(r => ({
      id: r[0] || '',
      description: r[1] || '',
      category: r[2] || '',
      amount: parseFloat(r[3]) || 0,
      account: (r[4] as Account) || 'Pessoal',
      active: r[5] === 'true',
    }))
  } catch { return [] }
}

export async function addRecurring(rec: Omit<Recurring, 'id'>) {
  const id = Date.now().toString()
  await sheetsRequest(`/values/${SHEETS.Recorrentes}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', {
    values: [[id, rec.description, rec.category, rec.amount, rec.account, rec.active]]
  })
  return id
}

export async function getBudgets(account: Account): Promise<Budget[]> {
  try {
    const data = await sheetsRequest(`/values/${SHEETS.Orcamentos}`)
    const rows: string[][] = data.values || []
    if (rows.length <= 1) return []
    return rows.slice(1)
      .filter(r => r[2] === account)
      .map(r => ({
        category: r[0] || '',
        limit: parseFloat(r[1]) || 0,
        account: (r[2] as Account) || account,
      }))
  } catch { return [] }
}

export async function setBudget(budget: Budget) {
  const data = await sheetsRequest(`/values/${SHEETS.Orcamentos}`)
  const rows: string[][] = data.values || []
  const rowIndex = rows.findIndex(r => r[0] === budget.category && r[2] === budget.account)

  if (rowIndex === -1) {
    await sheetsRequest(`/values/${SHEETS.Orcamentos}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', {
      values: [[budget.category, budget.limit, budget.account]]
    })
  } else {
    await sheetsRequest(`/values/${SHEETS.Orcamentos}!A${rowIndex + 1}:C${rowIndex + 1}?valueInputOption=RAW`, 'PUT', {
      values: [[budget.category, budget.limit, budget.account]]
    })
  }
}

export async function getSettings(account: Account): Promise<Settings> {
  try {
    const data = await sheetsRequest(`/values/${SHEETS.Configuracoes}`)
    const rows: string[][] = data.values || []
    const row = rows.slice(1).find(r => r[0] === account)
    if (row) {
      return { account, monthlySalary: parseFloat(row[1]) || 0, savingsGoal: parseFloat(row[2]) || 0 }
    }
  } catch { /* ignore */ }
  return { account, monthlySalary: 0, savingsGoal: 0 }
}

export async function saveSettings(settings: Settings) {
  const data = await sheetsRequest(`/values/${SHEETS.Configuracoes}`)
  const rows: string[][] = data.values || []
  const rowIndex = rows.findIndex(r => r[0] === settings.account)

  if (rowIndex === -1) {
    await sheetsRequest(`/values/${SHEETS.Configuracoes}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', {
      values: [[settings.account, settings.monthlySalary, settings.savingsGoal]]
    })
  } else {
    await sheetsRequest(`/values/${SHEETS.Configuracoes}!A${rowIndex + 1}:C${rowIndex + 1}?valueInputOption=RAW`, 'PUT', {
      values: [[settings.account, settings.monthlySalary, settings.savingsGoal]]
    })
  }
}

export async function getSummary(account: Account) {
  const now = new Date()
  const thisMonth = now.toISOString().slice(0, 7)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)

  const [transactions, income, budgets, settings] = await Promise.all([
    getTransactions(account),
    getIncome(account),
    getBudgets(account),
    getSettings(account),
  ])

  const thisMonthTx = transactions.filter(t => t.date.startsWith(thisMonth) && t.type === 'gasto')
  const lastMonthTx = transactions.filter(t => t.date.startsWith(lastMonth) && t.type === 'gasto')
  const thisMonthIncome = income.filter(i => i.date.startsWith(thisMonth))

  const totalSpent = thisMonthTx.reduce((s, t) => s + t.amount, 0)
  const lastMonthSpent = lastMonthTx.reduce((s, t) => s + t.amount, 0)
  const totalIncome = thisMonthIncome.reduce((s, i) => s + i.amount, 0) + settings.monthlySalary
  const balance = totalIncome - totalSpent

  const byCategory: Record<string, number> = {}
  thisMonthTx.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + t.amount })

  const lastByCategory: Record<string, number> = {}
  lastMonthTx.forEach(t => { lastByCategory[t.category] = (lastByCategory[t.category] || 0) + t.amount })

  const budgetAlerts = budgets
    .map(b => ({
      category: b.category,
      limit: b.limit,
      spent: byCategory[b.category] || 0,
      pct: Math.round(((byCategory[b.category] || 0) / b.limit) * 100),
    }))
    .filter(b => b.pct >= 80)

  const savingsProgress = settings.savingsGoal > 0
    ? Math.min(100, Math.round((balance / settings.savingsGoal) * 100))
    : 0

  return {
    totalSpent,
    lastMonthSpent,
    totalIncome,
    balance,
    byCategory,
    lastByCategory,
    budgetAlerts,
    recentTransactions: transactions.slice(-10).reverse(),
    recentIncome: income.slice(-5).reverse(),
    settings,
    savingsProgress,
    budgets,
  }
}
