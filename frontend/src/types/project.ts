export type ProjectSummary = {
  id: string
  name: string
  description: string
  folderName: string
  fileCount: number
  totalSizeLabel: string
  hasLabels: boolean
  createdAtLabel: string
}

export type AugmentationConfig = {
  workerCount: number
  runOcrLabeling: boolean
  totalImageCount: number
}

export type AugmentationResult = {
  totalImageCount: number
  successCount: number
  failedCount: number
  runOcrLabeling: boolean
  outputFolderLabel: string
}
