'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Account = 'Pessoal' | 'Empresa'

interface Message {
  role: 'user' | 'assistant'
  content: string
  saved?: boolean
  savedType?: string
  savedData?: { amount: number; description: string; category?: string }
}

interface Summary {
  totalSpent: number
  lastMonthSpent: number
  totalIncome: number
  balance: number
  byCategory: Record<string, number>
  lastByCategory: Record<string, number>
  budgetAlerts: { category: string; limit: number; spent: number; pct: number }[]
  recentTransactions: { id: string; date: string; description: string; category: string; amount: number; type: string }[]
  recentIncome: { id: string; date: string; description: string; amount: number }[]
  settings: { monthlySalary: number; savingsGoal: number }
  savingsProgress: number
  budgets: { category: string; limit: number }[]
}

interface Recurring {
  id: string
  description: string
  category: string
  amount: number
  account: Account
  active: boolean
}

const CATEGORIES = ['Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Contas', 'Compras', 'Freela', 'Outro']

const CATEGORY_COLORS: Record<string, string> = {
  Alimentação: '#f97316', Transporte: '#3b82f6', Saúde: '#10b981',
  Lazer: '#a855f7', Educação: '#06b6d4', Contas: '#ef4444',
  Compras: '#f59e0b', Freela: '#84cc16', Outro: '#6b7280',
}

function fmt(n: number) { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

type Tab = 'chat' | 'dashboard' | 'history' | 'recurring' | 'budgets' | 'settings'

export default function App() {
  const [account, setAccount] = useState<Account>('Pessoal')
  const [tab, setTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `Olá! 👋 Sou seu assistente financeiro. Me fala seus gastos e eu registro automaticamente. Ex: "gastei 45 no almoço" ou "recebi 500 de freela".` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [recurring, setRecurring] = useState<Recurring[]>([])
  const [newRecurring, setNewRecurring] = useState({ description: '', category: 'Contas', amount: '', account: 'Pessoal' as Account })
  const [budgetForm, setBudgetForm] = useState({ category: 'Alimentação', limit: '' })
  const [settingsForm, setSettingsForm] = useState({ monthlySalary: '', savingsGoal: '' })
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [transactions, setTransactions] = useState<Summary['recentTransactions']>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const res = await fetch(`/api/summary?account=${account}`)
      const data = await res.json()
      setSummary(data)
      setSettingsForm({
        monthlySalary: data.settings?.monthlySalary?.toString() || '',
        savingsGoal: data.settings?.savingsGoal?.toString() || '',
      })
    } catch { /* ignore */ }
    setSummaryLoading(false)
  }, [account])

  const loadTransactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/transactions?account=${account}`)
      const data = await res.json()
      setTransactions((data.transactions || []).reverse())
    } catch { /* ignore */ }
  }, [account])

  const loadRecurring = useCallback(async () => {
    try {
      const res = await fetch('/api/recurring')
      const data = await res.json()
      setRecurring(data.recurring || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadSummary()
    if (tab === 'history') loadTransactions()
    if (tab === 'recurring') loadRecurring()
  }, [account, tab, loadSummary, loadTransactions, loadRecurring])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-10),
          account,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${data.details || data.error}` }])
      } else {
        let content = data.reply
        if (data.saved && data.savedType === 'expense') {
          content = `✅ Gasto registrado: **${data.savedData?.description}** — ${fmt(data.savedData?.amount || 0)} (${data.savedData?.category})`
        } else if (data.saved && data.savedType === 'income') {
          content = `💰 Receita registrada: **${data.savedData?.description}** — ${fmt(data.savedData?.amount || 0)}`
        }
        setMessages(prev => [...prev, { role: 'assistant', content, saved: data.saved, savedType: data.savedType, savedData: data.savedData }])
        if (data.saved) loadSummary()
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro de conexão. Tenta de novo!' }])
    }
    setLoading(false)
  }

  async function confirmRecurring(rec: Recurring) {
    await fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, ...rec }),
    })
    loadSummary()
    alert(`✅ ${rec.description} lançado!`)
  }

  async function addRecurring() {
    if (!newRecurring.description || !newRecurring.amount) return
    await fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newRecurring, amount: parseFloat(newRecurring.amount) }),
    })
    setNewRecurring({ description: '', category: 'Contas', amount: '', account: 'Pessoal' })
    loadRecurring()
  }

  async function saveBudget() {
    if (!budgetForm.limit) return
    await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...budgetForm, limit: parseFloat(budgetForm.limit), account }),
    })
    setBudgetForm({ category: 'Alimentação', limit: '' })
    loadSummary()
  }

  async function saveSettings() {
    await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account,
        monthlySalary: parseFloat(settingsForm.monthlySalary) || 0,
        savingsGoal: parseFloat(settingsForm.savingsGoal) || 0,
      }),
    })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
    loadSummary()
  }

  async function deleteTransaction(id: string) {
    await fetch(`/api/transactions?account=${account}&id=${id}`, { method: 'DELETE' })
    loadTransactions()
    loadSummary()
  }

  function exportCSV() {
    window.open(`/api/export?account=${account}&format=csv`, '_blank')
  }

  const diffPct = summary && summary.lastMonthSpent > 0
    ? Math.round(((summary.totalSpent - summary.lastMonthSpent) / summary.lastMonthSpent) * 100)
    : 0

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'history', label: 'Histórico', icon: '📋' },
    { id: 'recurring', label: 'Fixos', icon: '🔁' },
    { id: 'budgets', label: 'Orçamento', icon: '🎯' },
    { id: 'settings', label: 'Config', icon: '⚙️' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f13', color: '#e8e8f0', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #1a1a24; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        input, select, textarea { outline: none; font-family: inherit; }
        button { cursor: pointer; font-family: inherit; border: none; }
        .card { background: #16161f; border: 1px solid #222230; border-radius: 14px; padding: 20px; }
        .btn-primary { background: #6c63ff; color: white; padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; transition: all 0.15s; }
        .btn-primary:hover { background: #7c74ff; transform: translateY(-1px); }
        .btn-ghost { background: transparent; color: #888; padding: 8px 14px; border-radius: 8px; font-size: 13px; border: 1px solid #2a2a38; transition: all 0.15s; }
        .btn-ghost:hover { background: #1e1e2a; color: #e8e8f0; }
        .input-field { background: #1e1e2a; border: 1px solid #2a2a38; border-radius: 10px; color: #e8e8f0; padding: 10px 14px; font-size: 14px; width: 100%; transition: border 0.15s; }
        .input-field:focus { border-color: #6c63ff; }
        .select-field { background: #1e1e2a; border: 1px solid #2a2a38; border-radius: 10px; color: #e8e8f0; padding: 10px 14px; font-size: 14px; }
        .label { font-size: 12px; color: #666; margin-bottom: 6px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .chat-bubble-user { background: #6c63ff; color: white; border-radius: 18px 18px 4px 18px; padding: 12px 16px; max-width: 80%; font-size: 14px; line-height: 1.5; }
        .chat-bubble-ai { background: #1e1e2a; border: 1px solid #2a2a38; border-radius: 18px 18px 18px 4px; padding: 12px 16px; max-width: 85%; font-size: 14px; line-height: 1.5; }
        .stat-card { background: #16161f; border: 1px solid #222230; border-radius: 14px; padding: 20px; }
        .progress-bar { height: 6px; background: #2a2a38; border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
        .tab-btn { padding: 8px 4px; font-size: 11px; font-weight: 500; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.15s; background: transparent; color: #555; flex: 1; }
        .tab-btn.active { color: #6c63ff; }
        .tab-btn .tab-icon { font-size: 18px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.25s ease; }
        .section-title { font-size: 16px; font-weight: 600; color: #e8e8f0; margin-bottom: 16px; }
      `}</style>

      {/* Header */}
      <div style={{ background: '#0f0f13', borderBottom: '1px solid #1e1e2a', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #6c63ff, #a78bfa)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💰</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>FinanceAI</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['Pessoal', 'Empresa'] as Account[]).map(acc => (
            <button key={acc} onClick={() => setAccount(acc)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: account === acc ? '#6c63ff' : '#1e1e2a',
              color: account === acc ? 'white' : '#888',
              border: `1px solid ${account === acc ? '#6c63ff' : '#2a2a38'}`,
              transition: 'all 0.15s',
            }}>{acc}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 100px' }}>

        {/* CHAT TAB */}
        {tab === 'chat' && (
          <div className="fade-in">
            {summary && summary.budgetAlerts.length > 0 && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#2a1a1a', border: '1px solid #ef4444', borderRadius: 12, fontSize: 13, color: '#f87171' }}>
                ⚠️ Alerta: {summary.budgetAlerts.map(a => `${a.category} em ${a.pct}% do orçamento`).join(' · ')}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 400, marginBottom: 16 }}>
              {messages.map((m, i) => (
                <div key={i} className="fade-in" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #a78bfa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>🤖</div>
                  )}
                  <div className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                    {m.content.split('**').map((part, j) =>
                      j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #a78bfa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
                  <div className="chat-bubble-ai" style={{ color: '#666' }}>digitando...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ position: 'sticky', bottom: 80, background: '#0f0f13', paddingTop: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input-field"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="gastei 45 no almoço..."
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={sendMessage} disabled={loading} style={{ paddingLeft: 16, paddingRight: 16 }}>
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <div className="fade-in">
            {summaryLoading ? (
              <div style={{ textAlign: 'center', color: '#555', padding: 40 }}>Carregando...</div>
            ) : summary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Top cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="stat-card">
                    <div className="label">Gasto este mês</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>{fmt(summary.totalSpent)}</div>
                    <div style={{ fontSize: 12, color: diffPct > 0 ? '#ef4444' : '#10b981', marginTop: 4 }}>
                      {diffPct > 0 ? `▲ ${diffPct}%` : `▼ ${Math.abs(diffPct)}%`} vs mês passado
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Saldo atual</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: summary.balance >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>{fmt(summary.balance)}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Receita: {fmt(summary.totalIncome)}</div>
                  </div>
                </div>

                {/* Savings goal */}
                {summary.settings.savingsGoal > 0 && (
                  <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div className="label">Meta de Economia</div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa' }}>{summary.savingsProgress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${summary.savingsProgress}%`, background: 'linear-gradient(90deg, #6c63ff, #a78bfa)' }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
                      {fmt(summary.balance)} de {fmt(summary.settings.savingsGoal)}
                    </div>
                  </div>
                )}

                {/* Budget alerts */}
                {summary.budgetAlerts.length > 0 && (
                  <div className="stat-card" style={{ borderColor: '#3a1a1a' }}>
                    <div className="section-title" style={{ color: '#f87171' }}>⚠️ Alertas de Orçamento</div>
                    {summary.budgetAlerts.map(a => (
                      <div key={a.category} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                          <span>{a.category}</span>
                          <span style={{ color: a.pct >= 100 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{fmt(a.spent)} / {fmt(a.limit)}</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${Math.min(100, a.pct)}%`, background: a.pct >= 100 ? '#ef4444' : '#f59e0b' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Categories */}
                {Object.keys(summary.byCategory).length > 0 && (
                  <div className="stat-card">
                    <div className="section-title">Gastos por Categoria</div>
                    {Object.entries(summary.byCategory)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([cat, val]) => {
                        const pct = Math.round(((val as number) / summary.totalSpent) * 100)
                        const lastVal = summary.lastByCategory[cat] || 0
                        const catDiff = lastVal > 0 ? Math.round(((val as number) - lastVal) / lastVal * 100) : 0
                        return (
                          <div key={cat} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: CATEGORY_COLORS[cat] || '#6b7280', display: 'inline-block' }} />
                                {cat}
                              </span>
                              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                {catDiff !== 0 && <span style={{ fontSize: 11, color: catDiff > 0 ? '#ef4444' : '#10b981' }}>{catDiff > 0 ? '▲' : '▼'}{Math.abs(catDiff)}%</span>}
                                <span style={{ fontWeight: 600 }}>{fmt(val as number)}</span>
                              </span>
                            </div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${pct}%`, background: CATEGORY_COLORS[cat] || '#6c63ff' }} />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}

                {/* Recent transactions */}
                {summary.recentTransactions.length > 0 && (
                  <div className="stat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div className="section-title" style={{ marginBottom: 0 }}>Últimas Transações</div>
                      <button className="btn-ghost" onClick={exportCSV} style={{ fontSize: 12 }}>⬇ Exportar CSV</button>
                    </div>
                    {summary.recentTransactions.slice(0, 8).map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e1e2a' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{t.description}</div>
                          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{t.date} · <span style={{ color: CATEGORY_COLORS[t.category] || '#888' }}>{t.category}</span></div>
                        </div>
                        <span style={{ fontWeight: 700, color: t.type === 'receita' ? '#10b981' : '#f87171', fontSize: 14 }}>
                          {t.type === 'receita' ? '+' : '-'}{fmt(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(summary.byCategory).length === 0 && (
                  <div style={{ textAlign: 'center', color: '#444', padding: 40, fontSize: 14 }}>
                    Nenhum dado ainda. Use o chat para registrar gastos!
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Todas as Transações</div>
              <button className="btn-ghost" onClick={exportCSV} style={{ fontSize: 12 }}>⬇ Exportar CSV</button>
            </div>
            <div className="card">
              {transactions.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#444', padding: 32, fontSize: 14 }}>Nenhuma transação ainda.</div>
              ) : transactions.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #1e1e2a' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.description}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{t.date} · <span style={{ color: CATEGORY_COLORS[t.category] || '#888' }}>{t.category}</span></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, color: t.type === 'receita' ? '#10b981' : '#f87171', fontSize: 14 }}>
                      {t.type === 'receita' ? '+' : '-'}{fmt(t.amount)}
                    </span>
                    <button onClick={() => deleteTransaction(t.id)} style={{ background: 'transparent', color: '#444', fontSize: 16, padding: '4px 6px', borderRadius: 6, transition: 'color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#444')}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RECURRING TAB */}
        {tab === 'recurring' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="section-title">Adicionar Gasto Fixo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div className="label">Descrição</div>
                  <input className="input-field" value={newRecurring.description} onChange={e => setNewRecurring(p => ({ ...p, description: e.target.value }))} placeholder="Netflix, Academia..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div className="label">Categoria</div>
                    <select className="select-field" style={{ width: '100%' }} value={newRecurring.category} onChange={e => setNewRecurring(p => ({ ...p, category: e.target.value }))}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="label">Valor (R$)</div>
                    <input className="input-field" type="number" value={newRecurring.amount} onChange={e => setNewRecurring(p => ({ ...p, amount: e.target.value }))} placeholder="0,00" />
                  </div>
                </div>
                <div>
                  <div className="label">Conta</div>
                  <select className="select-field" style={{ width: '100%' }} value={newRecurring.account} onChange={e => setNewRecurring(p => ({ ...p, account: e.target.value as Account }))}>
                    <option>Pessoal</option>
                    <option>Empresa</option>
                  </select>
                </div>
                <button className="btn-primary" onClick={addRecurring}>Salvar Fixo</button>
              </div>
            </div>

            <div className="card">
              <div className="section-title">Gastos Fixos Cadastrados</div>
              {recurring.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#444', padding: 24, fontSize: 14 }}>Nenhum gasto fixo cadastrado.</div>
              ) : recurring.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #1e1e2a' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.description}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{r.category} · {r.account}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: '#f87171', fontSize: 14 }}>{fmt(r.amount)}</span>
                    <button className="btn-primary" onClick={() => confirmRecurring(r)} style={{ padding: '6px 12px', fontSize: 12 }}>
                      Lançar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BUDGETS TAB */}
        {tab === 'budgets' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="section-title">Definir Limite por Categoria</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div className="label">Categoria</div>
                  <select className="select-field" style={{ width: '100%' }} value={budgetForm.category} onChange={e => setBudgetForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div className="label">Limite Mensal (R$)</div>
                  <input className="input-field" type="number" value={budgetForm.limit} onChange={e => setBudgetForm(p => ({ ...p, limit: e.target.value }))} placeholder="Ex: 500" />
                </div>
                <button className="btn-primary" onClick={saveBudget}>Salvar Limite</button>
              </div>
            </div>

            {summary && summary.budgets.length > 0 && (
              <div className="card">
                <div className="section-title">Limites Definidos — {account}</div>
                {summary.budgets.map(b => {
                  const spent = summary.byCategory[b.category] || 0
                  const pct = Math.min(100, Math.round((spent / b.limit) * 100))
                  return (
                    <div key={b.category} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[b.category] || '#6b7280', display: 'inline-block' }} />
                          {b.category}
                        </span>
                        <span style={{ color: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                          {fmt(spent)} / {fmt(b.limit)} ({pct}%)
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : CATEGORY_COLORS[b.category] || '#6c63ff' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="section-title">Configurações — {account}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div className="label">Salário / Renda Mensal Fixa (R$)</div>
                  <input className="input-field" type="number" value={settingsForm.monthlySalary} onChange={e => setSettingsForm(p => ({ ...p, monthlySalary: e.target.value }))} placeholder="Ex: 5000" />
                  <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>Entra automaticamente no cálculo de saldo todo mês.</div>
                </div>
                <div>
                  <div className="label">Meta de Economia Mensal (R$)</div>
                  <input className="input-field" type="number" value={settingsForm.savingsGoal} onChange={e => setSettingsForm(p => ({ ...p, savingsGoal: e.target.value }))} placeholder="Ex: 1000" />
                  <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>Aparece como barra de progresso no dashboard.</div>
                </div>
                <button className="btn-primary" onClick={saveSettings}>
                  {settingsSaved ? '✅ Salvo!' : 'Salvar Configurações'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="section-title">Exportar Dados</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn-ghost" onClick={exportCSV} style={{ textAlign: 'left', padding: '12px 16px', width: '100%' }}>
                  📊 Exportar CSV — {account}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0f0f13', borderTop: '1px solid #1e1e2a', padding: '8px 4px 16px', display: 'flex', zIndex: 50 }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
