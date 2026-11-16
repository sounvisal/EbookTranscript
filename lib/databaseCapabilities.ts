import { prisma } from '@/lib/prisma'

/** Read the deployed schema without changing it. Do not cache across migrations. */
export async function getDatabaseCapabilities() {
  const [schema] = await prisma.$queryRaw<Array<{ jobs: boolean; scopedCache: boolean }>>`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'TranscriptionJob') AS jobs,
      (EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Transcript' AND column_name = 'cacheId')
      AND EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'TranscriptCache' AND column_name = 'userId')) AS "scopedCache"
  `
  return schema
}
