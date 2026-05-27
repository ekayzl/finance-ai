import { NextRequest, NextResponse } from 'next/server'
import { getTransactions, getIncome, getSummary, type Account } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = (searchParams.get('account') || 'Pessoal') as Account
  const format = searchParams.get('format') || 'csv'

  try {
    const [transactions, income, summary] = await Promise.all([
      getTransactions(account),
      getIncome(account),
      getSummary(account),
    ])

    if (format === 'csv') {
      const now = new Date().toISOString().slice(0, 7)
      let csv = `RELATÓRIO FINANCEIRO - ${account} - ${now}\n\n`

      csv += `RESUMO DO MÊS\n`
      csv += `Total Gasto,R$${summary.totalSpent.toFixed(2)}\n`
      csv += `Total Receita,R$${summary.totalIncome.toFixed(2)}\n`
      csv += `Saldo,R$${summary.balance.toFixed(2)}\n`
      csv += `Mês Anterior,R$${summary.lastMonthSpent.toFixed(2)}\n\n`

      csv += `GASTOS POR CATEGORIA\n`
      csv += `Categoria,Valor\n`
      Object.entries(summary.byCategory).forEach(([cat, val]) => {
        csv += `${cat},R$${(val as number).toFixed(2)}\n`
      })
      csv += `\n`

      csv += `TRANSAÇÕES\n`
      csv += `Data,Descrição,Categoria,Valor,Tipo\n`
      transactions.forEach(t => {
        csv += `${t.date},"${t.description}",${t.category},${t.amount},${t.type}\n`
      })
      csv += `\n`

      csv += `RECEITAS\n`
      csv += `Data,Descrição,Valor\n`
      income.forEach(i => {
        csv += `${i.date},"${i.description}",${i.amount}\n`
      })

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="financas-${account}-${now}.csv"`,
        },
      })
    }

    // JSON export
    return NextResponse.json({ transactions, income, summary })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
