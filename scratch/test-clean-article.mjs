function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function formatCleanArticle(segments) {
  if (!segments || !segments.length) return ''

  const paragraphs = []
  let currentParagraphText = ''
  let wordCountInParagraph = 0
  let isNewSentence = true

  for (let i = 0; i < segments.length; i++) {
    let piece = (segments[i].text || '').trim()
    if (!piece) continue

    // Clean stray timestamps and duplicate spaces
    piece = piece.replace(/^[\s•*-]+/, '').replace(/\s+/g, ' ').trim()

    // Capitalize if it's the start of a new sentence and is in Latin script
    if (isNewSentence && /^[a-z]/.test(piece)) {
      piece = piece.charAt(0).toUpperCase() + piece.slice(1)
    }

    if (!currentParagraphText) {
      currentParagraphText = piece
    } else {
      const lastChar = currentParagraphText.slice(-1)
      const nextChar = piece.charAt(0)

      if (/[.!?។。]/.test(lastChar)) {
        currentParagraphText += ' ' + piece
      } else if (/[,:;]/.test(lastChar) || /[,:;]/.test(nextChar)) {
        currentParagraphText += ' ' + piece
      } else {
        currentParagraphText += ' ' + piece
      }
    }

    wordCountInParagraph += countWords(piece)

    // Check if current piece ends with sentence punctuation
    const endsWithPunct = /[.!?។。]["')\]]?$/.test(piece)
    isNewSentence = endsWithPunct

    const nextSegment = segments[i + 1]
    const timeGap = nextSegment ? (nextSegment.start - (segments[i].end || segments[i].start)) : 0

    // Form a new paragraph if sentence ended and paragraph has sufficient length, or long pause
    if (
      (endsWithPunct && wordCountInParagraph >= 35) ||
      timeGap >= 3.0 ||
      wordCountInParagraph >= 70
    ) {
      // Ensure paragraph ends with punctuation
      let finalPara = currentParagraphText.trim()
      if (!/[.!?។。…"')\]]$/.test(finalPara) && !/[\u1780-\u17FF\u4E00-\u9FFF]/.test(finalPara.slice(-5))) {
        finalPara += '.'
      }
      paragraphs.push(finalPara)
      currentParagraphText = ''
      wordCountInParagraph = 0
      isNewSentence = true
    }
  }

  if (currentParagraphText.trim()) {
    let finalPara = currentParagraphText.trim()
    if (!/[.!?។。…"')\]]$/.test(finalPara) && !/[\u1780-\u17FF\u4E00-\u9FFF]/.test(finalPara.slice(-5))) {
      finalPara += '.'
    }
    paragraphs.push(finalPara)
  }

  return paragraphs.join('\n\n')
}

const testSegments = [
  { start: 0, end: 3.0, text: "hello everyone welcome back to my channel," },
  { start: 3.2, end: 6.0, text: "today we are going to talk about" },
  { start: 6.1, end: 10.0, text: "artificial intelligence and how it is changing the world." },
  { start: 10.5, end: 13.8, text: "first let us look at modern speech recognition models." },
  { start: 14.0, end: 18.0, text: "they are getting faster and more efficient every year." },
  { start: 18.2, end: 24.5, text: "second, large language models are capable of processing video, audio, and text seamlessly." },
  { start: 25.0, end: 30.0, text: "in conclusion, this technology will help millions of creators build amazing tools." }
]

console.log('Clean Article Output:\n')
console.log(formatCleanArticle(testSegments))
