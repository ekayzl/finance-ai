import { NextRequest, NextResponse } from 'next/server'
import { getBudgets, setBudget, type Account } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = (searchParams.get('account') || 'Pessoal') as Account
  try {
    const budgets = await getBudgets(account)
    return NextResponse.json({ budgets })
  } catch {
    return NextResponse.json({ budgets: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    await setBudget({ category: body.category, limit: body.limit, account: body.account || 'Pessoal' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
