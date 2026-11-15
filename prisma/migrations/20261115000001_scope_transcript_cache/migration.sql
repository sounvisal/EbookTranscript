BEGIN;

-- Entries from the old shared cache have no attributable account.
DELETE FROM "TranscriptCache";

-- DropIndex
DROP INDEX "TranscriptCache_audioHash_key";

-- DropIndex
DROP INDEX "TranscriptCache_audioHash_idx";

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "cacheId" TEXT;

-- AlterTable
ALTER TABLE "TranscriptCache" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Transcript_cacheId_idx" ON "Transcript"("cacheId");

-- CreateIndex
CREATE INDEX "TranscriptCache_createdAt_idx" ON "TranscriptCache"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptCache_userId_audioHash_key" ON "TranscriptCache"("userId", "audioHash");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_cacheId_fkey" FOREIGN KEY ("cacheId") REFERENCES "TranscriptCache"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptCache" ADD CONSTRAINT "TranscriptCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
