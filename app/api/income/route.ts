import { NextRequest, NextResponse } from 'next/server'
import { getIncome, addIncome, type Account } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = (searchParams.get('account') || 'Pessoal') as Account
  try {
    const income = await getIncome(account)
    return NextResponse.json({ income })
  } catch {
    return NextResponse.json({ income: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    const id = await addIncome({
      date: body.date || new Date().toISOString().slice(0, 10),
      description: body.description,
      amount: body.amount,
      account: body.account || 'Pessoal',
    })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
