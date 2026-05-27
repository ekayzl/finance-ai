import { NextRequest, NextResponse } from 'next/server'
import { getRecurring, addRecurring, addTransaction, type Account } from '@/lib/sheets'

export async function GET() {
  try {
    const recurring = await getRecurring()
    return NextResponse.json({ recurring })
  } catch {
    return NextResponse.json({ recurring: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // confirm=true means user is confirming to launch this recurring as a transaction
  if (body.confirm) {
    try {
      await addTransaction({
        date: new Date().toISOString().slice(0, 10),
        description: body.description,
        category: body.category,
        amount: body.amount,
        type: 'gasto',
        account: body.account || 'Pessoal',
      })
      return NextResponse.json({ ok: true, confirmed: true })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  try {
    const id = await addRecurring({
      description: body.description,
      category: body.category,
      amount: body.amount,
      account: (body.account || 'Pessoal') as Account,
      active: true,
    })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
