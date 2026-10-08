import Config from '../components/Config.js'
import { createHash } from 'node:crypto'

/**
 * 中文提示词自动翻译（百度翻译）
 * 没配 appid/appkey 就直接原样返回，不影响使用。
 */
export async function translate(text) {
  if (!text) return text
  const config = (await Config.getConfig()) || {}
  const { appid, appkey } = config.translate || {}
  if (!appid || !appkey) return text

  // 只有中文才翻译
  if (!/[\u4e00-\u9fa5]/.test(text)) return text

  try {
    const salt = Date.now().toString()
    const sign = createHash('md5').update(appid + text + salt + appkey).digest('hex')
    const qs = new URLSearchParams({ q: text, from: 'zh', to: 'en', appid, salt, sign })
    const res = await fetch(`https://fanyi-api.baidu.com/api/trans/vip/translate?${qs}`, {
      signal: AbortSignal.timeout(15000)
    })
    const data = await res.json()
    const dst = data?.trans_result?.map((r) => r.dst).join('\n')
    return dst || text
  } catch (err) {
    console.error('[COMFYUI-PLUGIN] 翻译失败，使用原文', err?.message)
    return text
  }
}
