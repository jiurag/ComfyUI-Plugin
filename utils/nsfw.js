import Config from '../components/Config.js'

/**
 * 出图内容检查（可选）
 *
 * 默认关闭，直接放行。开启后会把图片 base64 POST 给 nsfw_check.url，
 * 约定返回 { status: true/false, msg: "..." }。
 * 你可以接自己的审核服务；没配 url 就相当于不检查。
 */
export async function nsfwCheck(base64) {
  const config = (await Config.getConfig()) || {}
  const nsfw = config.nsfw_check || {}
  if (!nsfw.enable) return { status: true }
  if (!nsfw.url) return { status: true, msg: '（已开启内容检查但没有配 url，跳过）' }

  try {
    const res = await fetch(nsfw.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 })
    })
    const data = await res.json()
    return { status: data.status !== false, msg: data.msg || '' }
  } catch (err) {
    console.error('[COMFYUI-PLUGIN] 内容检查调用失败，本次放行', err?.message)
    return { status: true, msg: '内容检查服务不可用' }
  }
}
