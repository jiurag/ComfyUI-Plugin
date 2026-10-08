/**
 * 「提交任务 → 发结果」这段共用逻辑
 *
 * 抽出来的原因：#绘图 和 #重绘 走的是完全一样的流程
 * （提交给 ComfyUI、轮询、发图片/视频、发参数卡片），
 * 只是参数从哪来不一样（一个是命令里现解析，一个是上次存下来的）。
 */

import fs from 'node:fs'
import Code from '../components/Core.js'
import { nsfwCheck } from './nsfw.js'
import { pluginResources } from '../model/path.js'
import { replyCard } from './render.js'

/** 生成过程中每隔一会儿说一声，别让群里以为卡死了 */
export function makeTicker(e, config) {
  const notify = Number(config?.notify_interval ?? 60)
  if (!notify) return null
  const sent = new Set()
  return (sec, remain) => {
    const n = Math.floor(sec / notify)
    if (n >= 1 && !sent.has(n)) {
      sent.add(n)
      e.reply(`还在生成…已用 ${sec} 秒${remain !== null && remain !== undefined ? `（前面还有 ${remain} 个任务）` : ''}`, true)
        .catch(() => {})
    }
  }
}

/** 把结果发出去：图片直接发，视频落盘后发 */
export async function sendResult(e, result, config) {
  for (const file of result.data.files) {
    if (file.isVideo) {
      const p = `${pluginResources}/tmp/${Date.now()}_${file.filename}`
      fs.writeFileSync(p, Buffer.from(file.base64, 'base64'))
      try {
        await e.reply(segment.video(p.replace(/\\/g, '/')))
      } catch (err) {
        console.error('[COMFYUI-PLUGIN] 视频发送失败', err?.message)
        await e.reply(`视频已生成但发送失败，文件在：${p}`)
      }
      setTimeout(() => fs.existsSync(p) && fs.unlinkSync(p), 300000)
    } else {
      await e.reply(segment.image('base64://' + file.base64))
    }
  }

  if (config?.reply_params !== false) {
    // 参数回执也用卡片，和帮助/列表保持一个样式；太长的一行截断，免得把卡片撑爆
    const cut = (v) => {
      const s = String(v ?? '')
      return s.length > 64 ? s.slice(0, 64) + '…' : s
    }
    const rows = Object.entries(result.data.parameters || {}).map(([k, v]) => ({ k, v: cut(v) }))
    await replyCard(e, {
      title: '本次出图参数',
      subtitle: `共 ${rows.length} 项 · 提示词过长会自动省略`,
      sections: [],
      config: rows,
      configTitle: '参数明细'
    }, '本次出图参数')
  }
}

/**
 * 真正跑一次：提交 → 等结果 → 审核 → 发出去
 * @returns {{ok: boolean, msg?: string, workflow?: string, parameters?: object}}
 */
export async function runDraw(e, params, config, { checkNsfw = true } = {}) {
  const result = await Code.text2img(params, makeTicker(e, config))

  if (!result.status) {
    await e.reply(result.msg)
    return { ok: false, msg: result.msg }
  }

  if (checkNsfw) {
    const isNsfw = await nsfwCheck(result.data.images[0])
    if (!isNsfw.status) {
      const msg = `生成图片未通过审核，${isNsfw.msg}`
      await e.reply(msg)
      return { ok: false, msg }
    }
  }

  await sendResult(e, result, config)
  return { ok: true, workflow: result.data.workflow, parameters: result.data.parameters }
}
