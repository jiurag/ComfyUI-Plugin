import fs from 'node:fs'
import path from 'node:path'
import { pluginResources } from '../model/path.js'

const FILE = path.join(pluginResources, 'tmp', 'last_draw.json')

const MAX_AGE = 12 * 60 * 60 * 1000
const MAX_ITEMS = 300
const MAX_PROMPT_SHOW = 200

function readAll() {
  try {
    const txt = fs.readFileSync(FILE, 'utf-8')
    const data = JSON.parse(txt)
    return data && typeof data === 'object' ? data : {}
  } catch (err) {
    if (err?.code !== 'ENOENT') console.error('[COMFYUI-PLUGIN] 读取 last_draw.json 失败', err?.message)
    return {}
  }
}

function writeAll(data) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('[COMFYUI-PLUGIN] 写入 last_draw.json 失败', err?.message)
    return false
  }
}

export function lastDrawKey(e) {
  if (e?.group_id) return `g${e.group_id}`
  if (e?.user_id) return `u${e.user_id}`
  return 'default'
}

export function saveLast(key, record) {
  if (!key || !record?.params) return false
  const all = readAll()
  all[key] = {
    time: Date.now(),
    who: record.who || '',
    userId: record.userId || '',
    raw: record.raw || '',
    params: record.params,
    applied: record.applied || null
  }

  const now = Date.now()
  let entries = Object.entries(all).filter(([, v]) => v && now - (v.time || 0) < MAX_AGE)
  if (entries.length > MAX_ITEMS) {
    entries = entries.sort((a, b) => (b[1].time || 0) - (a[1].time || 0)).slice(0, MAX_ITEMS)
  }
  writeAll(Object.fromEntries(entries))
  return true
}

export function getLast(key) {
  const rec = readAll()[key]
  if (!rec || !rec.params) return null
  if (Date.now() - (rec.time || 0) > MAX_AGE) return null
  return rec
}

export function clearLast(key) {
  const all = readAll()
  if (!(key in all)) return false
  delete all[key]
  writeAll(all)
  return true
}

export function lastDrawRows(rec, extra = []) {
  const cut = (v, n = MAX_PROMPT_SHOW) => {
    const s = String(v ?? '')
    return s.length > n ? s.slice(0, n) + '…' : s
  }
  const when = new Date(rec.time || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  const w = rec.applied?.width ?? rec.params?.width
  const h = rec.applied?.height ?? rec.params?.height
  const ratioText = rec.params?.ratio || rec.params?.ar || rec.params?.['比例'] || rec.applied?.aspect_ratio
  const sizeText = w && h ? `${w} x ${h}${ratioText ? `（${ratioText}）` : ''}` : ratioText ? `按比例 ${ratioText}` : '（工作流自带）'
  return [
    { k: '提示词', v: cut(rec.raw || rec.params?.prompt) || '（空）' },
    ...(rec.raw && rec.params?.prompt && rec.raw !== rec.params.prompt
      ? [{ k: '实际用的（英）', v: cut(rec.params.prompt) }]
      : []),
    { k: '工作流', v: String(rec.params?.workflow || '（当时用的是默认工作流）') },
    { k: '尺寸', v: sizeText },
    { k: '步数 / CFG', v: `${rec.params?.steps ?? '工作流默认'} / ${rec.params?.cfg ?? '工作流默认'}` },
    { k: '谁画的', v: rec.who || '（未知）' },
    { k: '时间', v: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}` },
    ...extra
  ]
}
