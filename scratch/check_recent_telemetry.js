const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const metrics = await prisma.usageMetric.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('--- RECENT USAGE METRICS (LAST 10) ---');
  for (const m of metrics) {
    console.log({
      id: m.id,
      createdAt: m.createdAt,
      model: m.model,
      durationSeconds: m.durationSeconds,
      latencyMs: m.latencyMs,
      status: m.status,
      fileFormat: m.fileFormat,
      fileSizeBytes: m.fileSizeBytes
    });
  }

  const errors = await prisma.errorLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('--- RECENT ERROR LOGS (LAST 10) ---');
  for (const e of errors) {
    console.log({
      id: e.id,
      createdAt: e.createdAt,
      errorMessage: e.errorMessage,
      filename: e.filename,
      fileSizeBytes: e.fileSizeBytes
    });
  }

  const transcripts = await prisma.transcript.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, filename: true, duration: true, wordCount: true, language: true, createdAt: true }
  });
  console.log('--- RECENT TRANSCRIPTS (LAST 5) ---');
  console.log(transcripts);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
