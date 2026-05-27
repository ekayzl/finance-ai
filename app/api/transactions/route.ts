import { NextRequest, NextResponse } from 'next/server'
import { getTransactions, deleteTransaction, type Account } from '@/lib/sheets'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = (searchParams.get('account') || 'Pessoal') as Account
  try {
    const transactions = await getTransactions(account)
    return NextResponse.json({ transactions })
  } catch {
    return NextResponse.json({ transactions: [] })
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = (searchParams.get('account') || 'Pessoal') as Account
  const id = searchParams.get('id') || ''
  try {
    await deleteTransaction(account, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
