import fs from 'fs'
import path from 'path'

export function getUploadsRoot(): string {
  const configured = process.env.UPLOAD_PATH
  if (configured && configured.trim()) {
    return path.resolve(configured.trim())
  }

  return path.resolve(process.cwd(), 'uploads')
}

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function getReportsDir(): string {
  const reportsDir = path.join(getUploadsRoot(), 'reports')
  ensureDir(reportsDir)
  return reportsDir
}

export function stripUploadsPrefix(p: string): string {
  const normalized = (p || '').replace(/\\/g, '/')
  return normalized.replace(/^\/?uploads\/?/, '')
}

export function resolveFromUploads(p: string): string {
  return path.join(getUploadsRoot(), stripUploadsPrefix(p))
}
