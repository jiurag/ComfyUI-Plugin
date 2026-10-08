
import fs from 'node:fs'
import Code from '../components/Core.js'
import { nsfwCheck } from './nsfw.js'
import { pluginResources } from '../model/path.js'
import { replyCard } from './render.js'

export function replyParamsMode(config) {
  const raw = config?.reply_params
  if (raw === false || raw === 'none' || raw === 'false' || raw === 'off') return 'none'
  if (raw === 'time') return 'time'
  return 'full' 
}

export function formatSeconds(sec) {
  const n = Number(sec)
  if (!Number.isFinite(n) || n < 0) return '未知'
  return `${n.toFixed(1)} 秒`
}

export function submitText(queue, prefix = '已提交') {
  const ahead = queue?.ahead
  if (typeof ahead === 'number' && ahead > 0) return `${prefix} · 前面还有 ${ahead} 个`
  return `${prefix} · 正在生成…`
}

export function makeTicker(e, config) {
  const notify = Number(config?.notify_interval ?? 60)
  if (!notify) return null
  const sent = new Set()
  return (sec, remain) => {
    const n = Math.floor(sec / notify)
    if (n >= 1 && !sent.has(n)) {
      sent.add(n)
      e.reply(`还在生成…已用 ${sec} 秒${remain !== null && remain !== undefined ? `（前面还有 ${remain} 个）` : ''}`, true)
        .catch(() => {})
    }
  }
}

export async function sendResult(e, result, config, elapsed) {
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

  const mode = replyParamsMode(config)

  if (mode === 'time') {
    await e.reply(`出图完成，耗时 ${formatSeconds(elapsed)}`, true)
    return
  }

  if (mode === 'full') {
    const cut = (v) => {
      const s = String(v ?? '')
      return s.length > 64 ? s.slice(0, 64) + '…' : s
    }
    const rows = Object.entries(result.data.parameters || {}).map(([k, v]) => ({ k, v: cut(v) }))
    if (elapsed !== undefined && elapsed !== null) {
      rows.push({ k: '耗时', v: formatSeconds(elapsed) })
    }
    await replyCard(e, {
      title: '本次出图参数',
      subtitle: `共 ${rows.length} 项 · 提示词过长会自动省略`,
      sections: [],
      config: rows,
      configTitle: '参数明细'
    }, '本次出图参数')
  }
}

export async function runDraw(e, params, config, { checkNsfw = true, submitPrefix = '已提交' } = {}) {
  const started = Date.now()

  const onSubmit = async (info) => {
    await e.reply(submitText(info?.queue, submitPrefix), true)
  }

  const result = await Code.text2img(params, makeTicker(e, config), onSubmit)
  const elapsed = (Date.now() - started) / 1000

  if (!result.status) {
    await e.reply(result.msg)
    return { ok: false, msg: result.msg, elapsed }
  }

  if (checkNsfw) {
    const isNsfw = await nsfwCheck(result.data.images[0])
    if (!isNsfw.status) {
      const msg = `生成图片未通过审核，${isNsfw.msg}`
      await e.reply(msg)
      return { ok: false, msg, elapsed }
    }
  }

  await sendResult(e, result, config, elapsed)
  return { ok: true, workflow: result.data.workflow, parameters: result.data.parameters, elapsed }
}
