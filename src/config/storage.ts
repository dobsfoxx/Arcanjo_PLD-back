import fs from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stripUploadsPrefix } from './paths'

export type StorageProvider = 'local' | 'supabase'

const provider: StorageProvider =
  (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'supabase' ? 'supabase' : 'local'

const bucket = (process.env.SUPABASE_STORAGE_BUCKET || 'uploads').trim()
const defaultSignedUrlExpiresIn = Number(process.env.SUPABASE_SIGNED_URL_EXPIRES_IN || '3600')

let supabaseClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (provider !== 'supabase') {
    throw new Error('Supabase storage is not enabled')
  }

  if (supabaseClient) return supabaseClient

  const url = (process.env.SUPABASE_URL || '').trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for STORAGE_PROVIDER=supabase')
  }

  supabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })

  return supabaseClient
}

export function getStorageProvider(): StorageProvider {
  return provider
}

export function isSupabasePath(p: string | null | undefined): boolean {
  return typeof p === 'string' && p.startsWith('sb:')
}

export function toSupabasePath(objectKey: string): string {
  return `sb:${bucket}/${objectKey.replace(/^\/+/, '')}`
}

export function parseSupabasePath(p: string): { bucket: string; key: string } {
  // sb:<bucket>/<key>
  if (!isSupabasePath(p)) {
    throw new Error('Not a supabase path')
  }

  const withoutPrefix = p.slice('sb:'.length)
  const firstSlash = withoutPrefix.indexOf('/')
  if (firstSlash === -1) {
    throw new Error('Invalid supabase path format')
  }

  const parsedBucket = withoutPrefix.slice(0, firstSlash)
  const key = withoutPrefix.slice(firstSlash + 1)
  if (!parsedBucket || !key) {
    throw new Error('Invalid supabase path format')
  }

  return { bucket: parsedBucket, key }
}

export async function uploadFileToStorage(params: {
  localPath: string
  objectKey: string
  contentType?: string
  deleteLocal?: boolean
}): Promise<string> {
  const { localPath, objectKey, contentType, deleteLocal } = params

  if (provider !== 'supabase') {
    // Local mode: caller should store a public-ish path that matches /uploads static.
    // We return the objectKey normalized under uploads/ to keep consistency.
    const normalizedKey = objectKey.replace(/^\/+/, '')
    return `uploads/${normalizedKey}`
  }

  const client = getSupabase()
  const fileBuffer = fs.readFileSync(localPath)

  const uploadRes = await client.storage.from(bucket).upload(objectKey, fileBuffer, {
    contentType: contentType || 'application/octet-stream',
    upsert: true,
  })

  if (uploadRes.error) {
    throw new Error(`Supabase upload failed: ${uploadRes.error.message}`)
  }

  if (deleteLocal) {
    try {
      fs.unlinkSync(localPath)
    } catch {
      // ignore
    }
  }

  return `uploads/${objectKey.replace(/^\/+/, '')}`
}

export async function createSignedUrlForStoredPath(
  storedPath: string,
  expiresInSeconds: number = defaultSignedUrlExpiresIn
): Promise<string | null> {
  if (provider !== 'supabase') {
    return null
  }

  const client = getSupabase()
  const key = stripUploadsPrefix(storedPath)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')

  if (!key || key.split('/').some((segment) => segment === '..')) {
    throw new Error('Invalid storage path')
  }

  const res = await client.storage.from(bucket).createSignedUrl(key, expiresInSeconds)
  if (res.error) {
    throw new Error(`Supabase signed URL failed: ${res.error.message}`)
  }

  return res.data.signedUrl
}

export function buildObjectKeyFromMulterFile(params: {
  folder: string
  filename: string
}): string {
  const folder = (params.folder || '').replace(/^\/+/, '').replace(/\/+$/, '')
  const filename = path.basename(params.filename)
  return folder ? `${folder}/${filename}` : filename
}
