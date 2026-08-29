import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlainTranscriptText } from '@/lib/transcript'

const HISTORY_PAGE_SIZE = 15

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (id) {
      const transcript = await prisma.transcript.findFirst({
        where: { id, userId: session.user.id }
      })

      if (!transcript) {
        return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
      }

      const cleanText = getPlainTranscriptText(transcript.text)

      return NextResponse.json({
        ...transcript,
        text: cleanText
      }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' }
      })
    }

    const requestedPage = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const searchQuery = searchParams.get('q')?.trim() || ''
    const languageFilter = searchParams.get('lang')?.trim() || ''

    const where: any = { userId: session.user.id }

    if (searchQuery) {
      where.OR = [
        { text: { contains: searchQuery, mode: 'insensitive' } },
        { filename: { contains: searchQuery, mode: 'insensitive' } },
        { source: { contains: searchQuery, mode: 'insensitive' } }
      ]
    }

    if (languageFilter && languageFilter !== 'all') {
      where.language = { equals: languageFilter, mode: 'insensitive' }
    }

    const total = await prisma.transcript.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
    const page = Math.min(requestedPage, totalPages)

    const items = await prisma.transcript.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        source: true,
        filename: true,
        duration: true,
        wordCount: true,
        language: true,
        createdAt: true
      }
    })

    // Fetch distinct languages used by this user for the filter dropdown
    const distinctLanguages = await prisma.transcript.findMany({
      where: { userId: session.user.id, language: { not: null } },
      distinct: ['language'],
      select: { language: true }
    }).then(list => list.map(l => l.language).filter(Boolean))

    return NextResponse.json(
      { items, page, pageSize: HISTORY_PAGE_SIZE, total, totalPages, languages: distinctLanguages },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching history:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
    }

    const { text, source, filename, duration, wordCount, language } = await req.json()

    if (!text || !source) {
      return NextResponse.json({ error: 'Text and source are required' }, { status: 400 })
    }

    const cleanText = getPlainTranscriptText(text)
    const computedWordCount = wordCount || cleanText.split(/\s+/).filter(Boolean).length
    const computedDuration = (typeof duration === 'number' && Number.isFinite(duration) && duration > 0)
      ? duration
      : Math.max(1, Math.round(computedWordCount / 2.3))

    const transcript = await prisma.transcript.create({
      data: {
        text: cleanText,
        source,
        filename,
        duration: computedDuration,
        wordCount: computedWordCount,
        language,
        userId: session.user.id
      }
    })

    return NextResponse.json(transcript, { status: 201 })
  } catch (error) {
    console.error('Error saving transcript:', error)
    return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 })
    }

    const id = new URL(req.url).searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const transcript = await prisma.transcript.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true }
    })

    if (!transcript) {
      return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 })
    }

    await prisma.transcript.delete({ where: { id } })
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting transcript:', error)
    return NextResponse.json({ error: 'Failed to delete transcript' }, { status: 500 })
  }
}

