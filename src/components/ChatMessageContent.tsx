import type { ReactNode } from 'react'

type ChatMessageContentProps = {
  content: string
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(https?:\/\/\S+|\*\*[^*]+\*\*)/g).filter(Boolean)

  return parts.map((part, index) => {
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
          {part}
        </a>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    }

    return part
  })
}

function isBulletLine(line: string) {
  return /^[-*]\s+/.test(line.trim())
}

function isNumberedLine(line: string) {
  return /^\d+\.\s+/.test(line.trim())
}

function isStrongHeading(line: string) {
  const trimmed = line.trim()
  return trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4
}

export default function ChatMessageContent({ content }: ChatMessageContentProps) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)

  return (
    <div className="chat-rich-content">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)

        if (!lines.length) {
          return null
        }

        if (lines.every(isBulletLine)) {
          return (
            <ul key={blockIndex} className="chat-rich-list">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          )
        }

        if (lines.every(isNumberedLine)) {
          return (
            <ol key={blockIndex} className="chat-rich-list">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^\d+\.\s+/, ''))}</li>
              ))}
            </ol>
          )
        }

        if (lines.length === 1 && isStrongHeading(lines[0])) {
          return (
            <h4 key={blockIndex} className="chat-rich-heading">
              {renderInline(lines[0].slice(2, -2))}
            </h4>
          )
        }

        return (
          <div key={blockIndex} className="chat-rich-block">
            {lines.map((line, lineIndex) => {
              if (isStrongHeading(line)) {
                return (
                  <h4 key={lineIndex} className="chat-rich-heading">
                    {renderInline(line.slice(2, -2))}
                  </h4>
                )
              }

              if (isBulletLine(line)) {
                return (
                  <ul key={lineIndex} className="chat-rich-list">
                    <li>{renderInline(line.replace(/^[-*]\s+/, ''))}</li>
                  </ul>
                )
              }

              if (isNumberedLine(line)) {
                return (
                  <ol key={lineIndex} className="chat-rich-list">
                    <li>{renderInline(line.replace(/^\d+\.\s+/, ''))}</li>
                  </ol>
                )
              }

              return <p key={lineIndex}>{renderInline(line)}</p>
            })}
          </div>
        )
      })}
    </div>
  )
}
