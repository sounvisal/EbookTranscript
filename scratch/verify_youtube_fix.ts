import 'dotenv/config'
import { extractYouTubeTranscript } from '../lib/youtube'

async function testYouTubeVerification() {
  console.log('====================================================')
  console.log('🧪 VERIFYING YOUTUBE TRANSCRIPT EXTRACTION FIX')
  console.log('====================================================')

  const testCases = [
    {
      name: 'Reported Incident Video (Israel flight incident)',
      url: 'https://youtu.be/-u7x3-6JHV8'
    },
    {
      name: 'First YouTube Video ("Me at the zoo")',
      url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
    }
  ]

  for (const testCase of testCases) {
    console.log(`\n▶️ Testing: ${testCase.name}`)
    console.log(`🔗 URL: ${testCase.url}`)
    const t0 = Date.now()

    try {
      const result = await extractYouTubeTranscript(testCase.url)
      const durationMs = Date.now() - t0

      if (!result) {
        console.error(`❌ FAILED: extractYouTubeTranscript returned null for ${testCase.url}`)
        continue
      }

      console.log(`✅ SUCCESS in ${durationMs}ms!`)
      console.log(`   📌 Title: "${result.sourceName}"`)
      console.log(`   🌐 Language: ${result.language}`)
      console.log(`   ⏱ Duration: ${result.duration}s`)
      console.log(`   📊 Segments Count: ${result.segments.length}`)
      console.log(`   📝 Word Count: ${result.text.split(/\s+/).filter(Boolean).length}`)
      console.log(`   🔍 First Segment:`, result.segments[0])
      console.log(`   🔍 Last Segment:`, result.segments[result.segments.length - 1])
      console.log(`   📄 Text Sample: "${result.text.slice(0, 150)}..."`)
    } catch (err) {
      console.error(`❌ EXCEPTION for ${testCase.url}:`, err)
    }
  }

  console.log('\n====================================================')
  console.log('🎉 VERIFICATION COMPLETED')
  console.log('====================================================')
}

testYouTubeVerification()
