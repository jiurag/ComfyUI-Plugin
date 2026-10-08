/**
 * 通用卡片渲染
 *
 * 把数据交给 TRSS 的渲染后端（puppeteer / shotium）画成图片卡片。
 * 渲染失败返回 null，调用方自己决定要不要回退成文字。
 *
 * 注意 import 层级：本文件在 plugins/<插件>/utils/ 下，要退三级才到云崽根目录。
 */
import { pluginRoot } from '../model/path.js'

const TPL_FILE = `${pluginRoot}/resources/help/help.html`.replace(/\\/g, '/')

export async function renderCard(data = {}) {
  try {
    const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
    const img = await puppeteer.screenshot('comfyui-card', {
      tplFile: TPL_FILE,
      saveId: 'comfyui-card',
      scale: 2,
      imgType: 'png',
      transparent: true,
      title: data.title || 'ComfyUI 绘图',
      subtitle: data.subtitle || '',
      footer: data.footer || 'ComfyUI 绘图插件',
      sections: data.sections || [],
      config: data.config || [],
      configTitle: data.configTitle || '当前配置'
    })
    return img || null
  } catch (err) {
    logger.error(`[COMFYUI-PLUGIN] 卡片渲染失败：${err?.message || err}`)
    return null
  }
}

/** 把 sections 拼成纯文本，渲染失败时的兜底 */
export function sectionsToText(title, sections, config = []) {
  const lines = [`【${title}】`]
  for (const s of sections) {
    lines.push(`\n【${s.title}】`)
    for (const it of s.items) lines.push(`  ${it.c}${it.d ? '   ' + it.d : ''}`)
  }
  if (config.length) {
    lines.push('\n【当前配置】')
    for (const r of config) lines.push(`  ${r.k}：${r.v}`)
  }
  return lines.join('\n')
}

/** 渲染卡片，失败就回退文字（合并转发） */
export async function replyCard(e, data, fallbackTitle) {
  const img = await renderCard(data)
  if (img) {
    await e.reply(img)
    return true
  }
  await e.reply(Bot.makeForwardMsg([{ message: sectionsToText(fallbackTitle || data.title, data.sections || [], data.config || []) }]))
  return true
}
