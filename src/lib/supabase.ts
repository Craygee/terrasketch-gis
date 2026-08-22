import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { CloudMap, MapSnapshot, MapVisibility } from '../types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'))
export const supabase: SupabaseClient | null = cloudConfigured ? createClient(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export async function currentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser(); return data.user
}

export async function listCloudMaps(): Promise<CloudMap[]> {
  if (!supabase) return []
  const user = await currentUser(); if (!user) return []
  const { data, error } = await supabase.from('maps').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CloudMap[]
}

export async function loadCloudMap(id: string): Promise<CloudMap> {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  const { data, error } = await supabase.from('maps').select('*').eq('id', id).single()
  if (error) throw error
  return data as CloudMap
}

export async function saveCloudMap(input: { id?: string; title: string; snapshot: MapSnapshot; visibility?: MapVisibility; allowLinkEdit?: boolean }): Promise<CloudMap> {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  const user = await currentUser(); if (!user) throw new Error('Sign in to save maps to the cloud.')
  const values = { title: input.title, snapshot: input.snapshot, visibility: input.visibility ?? 'private', allow_link_edit: input.allowLinkEdit ?? false, updated_at: new Date().toISOString() }
  const query = input.id ? supabase.from('maps').update(values).eq('id', input.id) : supabase.from('maps').insert({ ...values, owner_id: user.id })
  const { data, error } = await query.select('*').single()
  if (error) throw error
  return data as CloudMap
}

export async function updateSharing(id: string, visibility: MapVisibility, allowLinkEdit: boolean) {
  if (!supabase) throw new Error('Cloud sync is not configured.')
  const { data, error } = await supabase.from('maps').update({ visibility, allow_link_edit: allowLinkEdit, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error) throw error
  return data as CloudMap
}

export function subscribeToMap(id: string, onUpdate: (map: CloudMap) => void) {
  if (!supabase) return () => undefined
  const channel = supabase.channel(`map:${id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'maps', filter: `id=eq.${id}` }, (payload) => onUpdate(payload.new as CloudMap)).subscribe()
  return () => { void supabase.removeChannel(channel) }
}
