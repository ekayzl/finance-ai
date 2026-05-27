import { NextRequest, NextResponse } from 'next/server'
import { addTransaction, addIncome, getSummary, ensureAllSheets, type Account } from '@/lib/sheets'

async function callGroq(messages: { role: string; content: string }[]) {
  const apiKey = (process.env.GROQ_API_KEY || '').trim()
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: 600,
      temperature: 0.7,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  if (!data.choices?.[0]?.message?.content) throw new Error('Empty response')
  return data.choices[0].message.content as string
}

const CATEGORIES = ['Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Contas', 'Compras', 'Salário', 'Freela', 'Outro']

export async function POST(req: NextRequest) {
  const { message, history, account } = await req.json()
  const acc: Account = account || 'Pessoal'

  try {
    await ensureAllSheets()
    const summary = await getSummary(acc)

    const resumo = `
Conta: ${acc}
Total gasto este mês: R$${summary.totalSpent.toFixed(2)} (mês passado: R$${summary.lastMonthSpent.toFixed(2)})
Receita este mês: R$${summary.totalIncome.toFixed(2)}
Saldo: R$${summary.balance.toFixed(2)}
Meta de economia: R$${summary.settings.savingsGoal.toFixed(2)} (progresso: ${summary.savingsProgress}%)
Por categoria: ${Object.entries(summary.byCategory).map(([k, v]) => `${k}: R$${(v as number).toFixed(2)}`).join(', ') || 'nenhum'}
Alertas de orçamento: ${summary.budgetAlerts.map(a => `${a.category} ${a.pct}% do limite`).join(', ') || 'nenhum'}
Últimas transações: ${summary.recentTransactions.slice(0, 5).map(t => `${t.description} R$${t.amount} (${t.category})`).join(', ') || 'nenhuma'}
    `.trim()

const systemPrompt = `Você é um assistente financeiro pessoal simpático e direto para a conta "${acc}".

SITUAÇÃO FINANCEIRA ATUAL:
${resumo}

CATEGORIAS: ${CATEGORIES.join(', ')}

INSTRUÇÕES:
1. GASTO: Se o usuário mencionar UM gasto, responda SOMENTE com JSON:
   {"action":"expense","amount":50,"category":"Alimentação","description":"Almoço","date":"${new Date().toISOString().slice(0, 10)}"}

2. MÚLTIPLOS GASTOS: Se mencionar mais de um gasto na mesma mensagem, responda SOMENTE com JSON array:
   [{"action":"expense","amount":50,"category":"Alimentação","description":"Almoço","date":"${new Date().toISOString().slice(0, 10)}"},{"action":"expense","amount":35,"category":"Transporte","description":"Uber","date":"${new Date().toISOString().slice(0, 10)}"}]

3. RECEITA/GANHO: Se mencionar que recebeu ou ganhou dinheiro, responda SOMENTE com JSON:
   {"action":"income","amount":500,"description":"Freela design","date":"${new Date().toISOString().slice(0, 10)}"}

4. REMOÇÃO/DELETAR: NUNCA tente remover gastos via JSON. Se pedirem pra remover, diga: "Para remover um gasto, vai na aba Histórico e clica no X ao lado da transação."

5. ANÁLISE/PERGUNTA: Responda em texto normal, português casual.

6. Nunca misture JSON com texto. É um ou outro.
7. Hoje é ${new Date().toISOString().slice(0, 10)}.`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ]

    const reply = await callGroq(messages)

    let saved = false
    let savedData = null
    let savedType = ''

try {
      // Try array first (multiple expenses)
      const arrayMatch = reply.match(/\[[\s\S]*?\]/)
      const singleMatch = reply.match(/\{[\s\S]*?"action"[\s\S]*?\}/)
      
      const items = arrayMatch 
        ? JSON.parse(arrayMatch[0]) 
        : singleMatch ? [JSON.parse(singleMatch[0])] : []

      for (const parsed of items) {
        if (parsed.action === 'expense') {
          await addTransaction({
            date: parsed.date || new Date().toISOString().slice(0, 10),
            description: parsed.description,
            category: parsed.category,
            amount: parsed.amount,
            type: 'gasto',
            account: acc,
          })
          saved = true
          savedType = 'expense'
          savedData = parsed
        } else if (parsed.action === 'income') {
          await addIncome({
            date: parsed.date || new Date().toISOString().slice(0, 10),
            description: parsed.description,
            amount: parsed.amount,
            account: acc,
          })
          saved = true
          savedType = 'income'
          savedData = parsed
        }
      }

      if (saved && items.length > 1) {
        savedData = { amount: items.reduce((s: number, i: {amount: number}) => s + i.amount, 0), description: `${items.length} gastos`, category: 'Múltiplos' }
      }
    } catch { /* not JSON */ }

    return NextResponse.json({ reply, saved, savedData, savedType })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ error: 'Erro interno', details: String(err) }, { status: 500 })
  }
}
