/**
 * 「上次画了什么」的记录
 *
 * 给 #重绘 用：把每次成功出图的提示词和参数存下来，
 * 之后 #重绘 就能原样再跑一遍（种子默认重新随机，所以每次都是新图）。
 *
 * 存成一个小 JSON 文件，不依赖 redis —— 机器人的 redis 万一挂了，
 * 这个功能也不会跟着坏。群聊按群记，私聊按用户记。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pluginResources } from '../model/path.js'

const FILE = path.join(pluginResources, 'tmp', 'last_draw.json')

/** 超过这个时间的记录就不复用了（12 小时） */
const MAX_AGE = 12 * 60 * 60 * 1000
/** 最多留多少条，防止文件无限长大 */
const MAX_ITEMS = 300
/** 提示词太长就截断（只在展示时用） */
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

/** 群聊按群记，私聊按用户记 */
export function lastDrawKey(e) {
  if (e?.group_id) return `g${e.group_id}`
  if (e?.user_id) return `u${e.user_id}`
  return 'default'
}

/** 记下这次画了什么 */
export function saveLast(key, record) {
  if (!key || !record?.params) return false
  const all = readAll()
  all[key] = {
    time: Date.now(),
    who: record.who || '',
    userId: record.userId || '',
    raw: record.raw || '', // 用户原话（没翻译过的）
    params: record.params, // 真正提交给 ComfyUI 的那一套
    // 提交后实际算出来的尺寸（只在卡片上展示用，不参与重绘，免得反过来把比例顶掉）
    applied: record.applied || null
  }

  // 清理：太老的、以及超出条数上限的
  const now = Date.now()
  let entries = Object.entries(all).filter(([, v]) => v && now - (v.time || 0) < MAX_AGE)
  if (entries.length > MAX_ITEMS) {
    entries = entries.sort((a, b) => (b[1].time || 0) - (a[1].time || 0)).slice(0, MAX_ITEMS)
  }
  writeAll(Object.fromEntries(entries))
  return true
}

/** 取上次的记录，过期/没有就返回 null */
export function getLast(key) {
  const rec = readAll()[key]
  if (!rec || !rec.params) return null
  if (Date.now() - (rec.time || 0) > MAX_AGE) return null
  return rec
}

/** 忘记上次（#忘记上次绘图） */
export function clearLast(key) {
  const all = readAll()
  if (!(key in all)) return false
  delete all[key]
  writeAll(all)
  return true
}

/** 组装给卡片看的几行 */
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
