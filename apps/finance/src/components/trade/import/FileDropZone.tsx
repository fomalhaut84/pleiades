'use client'

import { useRef, useState, useCallback } from 'react'

interface FileDropZoneProps {
  onFile: (file: File) => void
  accept?: string
  maxSizeMB?: number
}

export default function FileDropZone({
  onFile,
  accept = '.csv,.tsv,.txt',
  maxSizeMB = 5,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`파일 크기가 ${maxSizeMB}MB를 초과합니다.`)
        return
      }
      onFile(file)
    },
    [maxSizeMB, onFile]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all
          ${isDragging
            ? 'border-sodam/50 bg-sodam/5'
            : 'border-border hover:border-border-hover hover:bg-card'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        <div className="text-[28px] mb-3 opacity-40">
          &#128196;
        </div>
        <p className="text-[13px] text-muted font-medium">
          CSV 파일을 드래그하거나 클릭하여 선택
        </p>
        <p className="text-[11px] text-dim mt-1.5">
          .csv, .tsv, .txt / 최대 {maxSizeMB}MB
        </p>
      </div>
      {error && (
        <p className="text-[11px] text-red-400 mt-2">{error}</p>
      )}
    </div>
  )
}
