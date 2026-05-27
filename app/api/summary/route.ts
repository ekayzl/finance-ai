import { NextRequest, NextResponse } from 'next/server'
import { getSummary, saveSettings, ensureAllSheets, type Account } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = (searchParams.get('account') || 'Pessoal') as Account
  try {
    await ensureAllSheets()
    const summary = await getSummary(account)
    return NextResponse.json(summary)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  try {
    await saveSettings({
      account: body.account || 'Pessoal',
      monthlySalary: body.monthlySalary || 0,
      savingsGoal: body.savingsGoal || 0,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
