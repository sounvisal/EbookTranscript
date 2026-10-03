import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function findCutoffTranscript() {
  const transcripts = await prisma.transcript.findMany({
    where: {
      OR: [
        { filename: { contains: '1790936656252' } },
        { text: { contains: 'There was once a poor man' } }
      ]
    }
  })

  console.log(`Found ${transcripts.length} matching transcripts:`)
  for (const t of transcripts) {
    console.log('---')
    console.log('ID:', t.id)
    console.log('Filename:', t.filename)
    console.log('Duration:', t.duration)
    console.log('WordCount:', t.wordCount)
    console.log('CreatedAt:', t.createdAt)
    console.log('Text (full):', JSON.stringify(t.text))
  }

  // Also check TranscriptCache
  const caches = await prisma.transcriptCache.findMany({
    where: {
      text: { contains: 'There was once a poor man' }
    }
  })
  console.log(`\nFound ${caches.length} matching caches:`)
  for (const c of caches) {
    console.log('---')
    console.log('Cache ID:', c.id)
    console.log('Duration:', c.duration)
    console.log('Segments:', c.segments?.slice(0, 300))
    console.log('Text (full):', JSON.stringify(c.text))
  }
}

findCutoffTranscript().then(() => prisma.$disconnect()).catch(console.error)
